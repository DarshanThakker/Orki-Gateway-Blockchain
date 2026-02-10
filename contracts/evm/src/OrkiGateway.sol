// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {Ownable2Step} from "@openzeppelin/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/utils/Pausable.sol";
import {FeeVault} from "./FeeVault.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";

contract OrkiGateway is Ownable2Step, Pausable, ReentrancyGuard {
    // ========== STRUCTS ==========
    struct Merchant {
        address wallet;
        bool registered;
        uint256 minPayment;
        uint256 maxPayment;
    }

    // ========== STATE VARIABLES ==========
    FeeVault public feeVault;
    uint256 public feeBps; // Basis points (100 = 1%)

    mapping(address => Merchant) public merchants;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => address[]) private _merchantSupportedTokens;

    // ========== EVENTS ==========
    event MerchantRegistered(
        address indexed merchantOwner,
        address wallet
    );
    event MerchantUpdated(
        address indexed merchantOwner,
        address wallet
    );
    event PaymentProcessed(
        address indexed payer,
        address indexed merchantOwner,
        uint256 amount,
        uint256 fee,
        address token
    );
    event TokenAllowed(address indexed merchant, address token, bool allowed);
    event FeeUpdated(uint256 newFeeBps);

    // ========== ERRORS ==========
    error InvalidAddress();
    error MerchantNotRegistered();
    error InvalidToken();
    error InvalidAmount();
    error TransferFailed();
    error ArrayLengthMismatch();
    error AlreadyRegistered();
    error InvalidWallet();
    error AmountRangeInvalid();
    error ZeroAmount();

    constructor(
        address _owner,
        address _feeVault,
        uint256 _feeBps
    ) Ownable(_owner) {
        if (_feeVault == address(0)) revert InvalidAddress();
        if (_feeBps > 500) revert InvalidAmount(); // "Fee too high"
        
        feeVault = FeeVault(payable(_feeVault));
        feeBps = _feeBps;
    }

    // ========== MODIFIERS ==========
    modifier onlyRegisteredMerchant(address merchantOwner) {
        _checkRegisteredMerchant(merchantOwner);
        _;
    }

    function _checkRegisteredMerchant(address merchantOwner) internal view {
        if (!merchants[merchantOwner].registered)
            revert MerchantNotRegistered();
    }

    // ========== MERCHANT FUNCTIONS ==========
    function registerMerchant(
        address wallet,
        uint256 minPayment,
        uint256 maxPayment
    ) external {
        if (wallet == address(0)) revert InvalidWallet();
        if (merchants[msg.sender].registered) revert AlreadyRegistered();
        if (minPayment > maxPayment) revert AmountRangeInvalid();
        if (minPayment == 0) revert ZeroAmount();
        
        merchants[msg.sender] = Merchant({
            wallet: wallet,
            registered: true,
            minPayment: minPayment,
            maxPayment: maxPayment
        });

        emit MerchantRegistered(msg.sender, wallet);
    }

    function updateMerchant(
        address wallet,
        uint256 minPayment,
        uint256 maxPayment
    ) external onlyRegisteredMerchant(msg.sender) {
        if (wallet == address(0)) revert InvalidWallet();
        if (minPayment > maxPayment) revert AmountRangeInvalid();
        if (minPayment == 0) revert ZeroAmount();
        
        Merchant storage merchant = merchants[msg.sender];
        merchant.wallet = wallet;
        merchant.minPayment = minPayment;
        merchant.maxPayment = maxPayment;

        emit MerchantUpdated(msg.sender, wallet);
    }


    function setAllowedToken(
    address token,
    bool allowed
) external onlyRegisteredMerchant(msg.sender) {
    // REMOVE this check to allow ETH (address(0)) as a whitelisted token
    // if (token == address(0)) revert InvalidToken();
    
    bool currentlyAllowed = allowedTokens[msg.sender][token];
    if (allowed && !currentlyAllowed) {
        allowedTokens[msg.sender][token] = true;
        _merchantSupportedTokens[msg.sender].push(token);
    } else if (!allowed && currentlyAllowed) {
        allowedTokens[msg.sender][token] = false;
        // Remove from array
        address[] storage tokens = _merchantSupportedTokens[msg.sender];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == token) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }
    
    emit TokenAllowed(msg.sender, token, allowed);
}

    function getSupportedTokens(address merchantOwner) external view returns (address[] memory) {
        return _merchantSupportedTokens[merchantOwner];
    }

    function processPayment(
        address merchantOwner,
        address token,
        uint256 amount
    ) external payable nonReentrant whenNotPaused {
        Merchant memory merchant = merchants[merchantOwner];

        if (!merchant.registered) revert MerchantNotRegistered();
        if (amount < merchant.minPayment || amount > merchant.maxPayment)
            revert InvalidAmount();

        // Check if token is allowed
        if (!allowedTokens[merchantOwner][token]) revert InvalidToken();

        uint256 fee = (amount * feeBps) / 10000;
        uint256 merchantAmount = amount - fee;

        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
            
            (bool successFee, ) = address(feeVault).call{value: fee}("");
            if (!successFee) revert TransferFailed();

            (bool successMerch, ) = merchant.wallet.call{value: merchantAmount}("");
            if (!successMerch) revert TransferFailed();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            // Wrap unchecked transfers
            bool successFee = IERC20(token).transferFrom(msg.sender, address(feeVault), fee);
            if (!successFee) revert TransferFailed();

            bool successMerch = IERC20(token).transferFrom(
                msg.sender,
                merchant.wallet,
                merchantAmount
            );
            if (!successMerch) revert TransferFailed();
        }

        emit PaymentProcessed(
            msg.sender,
            merchantOwner,
            amount,
            fee,
            token
        );
    }

    // ========== ADMIN FUNCTIONS ==========
    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 500) revert InvalidAmount(); // "Fee too high"
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency withdrawal (for stuck funds only)
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "Withdrawal failed");
        } else {
            bool success = IERC20(token).transfer(owner(), amount);
            require(success, "Withdrawal failed");
        }
    }

    // ========== VIEW FUNCTIONS ==========
    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * feeBps) / 10000;
    }

    // Get merchant info
    function getMerchantWallet(
        address merchantOwner
    ) external view returns (address) {
        return merchants[merchantOwner].wallet;
    }

    function isMerchantRegistered(
        address merchantOwner
    ) external view returns (bool) {
        return merchants[merchantOwner].registered;
    }

    function getMerchantLimits(
        address merchantOwner
    ) external view returns (uint256 minPayment, uint256 maxPayment) {
        Merchant memory merchant = merchants[merchantOwner];
        return (merchant.minPayment, merchant.maxPayment);
    }

    receive() external payable {}
}

