// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {Ownable2Step} from "@openzeppelin/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/utils/Pausable.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {FeeVault} from "./FeeVault.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";

contract OrkiGateway is Ownable2Step, Pausable, ReentrancyGuard {
    // ========== STRUCTS ==========
    struct Merchant {
        address wallet;
        address settlementToken; // address(0) for native ETH
        bool swapEnabled;
        bool registered;
        uint256 minPayment;
        uint256 maxPayment;
    }

    struct SwapConfig {
        address adapter;
        bool enabled;
        uint256 slippageBps; // Max slippage in basis points (1% = 100)
    }

    // ========== HELPER FUNCTION ==========
    function calculateMinOutput(uint256 amount, uint256 slippageBps) internal pure returns (uint256) {
        if (slippageBps > 10000) revert InvalidSlippage();
        uint256 slippageAmount = (amount * slippageBps) / 10000;
        return amount - slippageAmount;
    }

    // ========== STATE VARIABLES ==========
    FeeVault public feeVault;
    uint256 public feeBps; // Basis points (100 = 1%)

    mapping(address => Merchant) public merchants;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => SwapConfig) public swapConfigs;
    mapping(address => bool) public isApprovedAdapter;
    mapping(address => address[]) private _merchantSupportedTokens;

    // ========== EVENTS ==========
    event MerchantRegistered(
        address indexed merchantOwner,
        address wallet,
        address settlementToken
    );
    event MerchantUpdated(
        address indexed merchantOwner,
        address wallet,
        address settlementToken,
        bool swapEnabled
    );
    event PaymentProcessed(
        address indexed payer,
        address indexed merchantOwner,
        uint256 amount,
        uint256 fee,
        address token,
        bool swapped
    );
    event TokenAllowed(address indexed merchant, address token, bool allowed);
    event AdapterStatusUpdated(address indexed adapter, bool approved);
    event SwapConfigUpdated(address indexed merchant, address adapter, bool enabled, uint256 slippageBps);
    event FeeUpdated(uint256 newFeeBps);

    // ========== ERRORS ==========
    error InvalidAddress();
    error MerchantNotRegistered();
    error InvalidToken();
    error InvalidAmount();
    error SwapNotAllowed();
    error TransferFailed();
    error AdapterNotApproved();
    error InvalidSlippage();
    error ArrayLengthMismatch();
    error AlreadyRegistered();
    error InvalidWallet();
    error InvalidAdapter();
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
        address settlementToken,
        uint256 minPayment,
        uint256 maxPayment
    ) external {
        if (wallet == address(0)) revert InvalidWallet();
        if (merchants[msg.sender].registered) revert AlreadyRegistered();
        if (minPayment > maxPayment) revert AmountRangeInvalid();
        if (minPayment == 0) revert ZeroAmount();
        
        merchants[msg.sender] = Merchant({
            wallet: wallet,
            settlementToken: settlementToken,
            swapEnabled: false,
            registered: true,
            minPayment: minPayment,
            maxPayment: maxPayment
        });

        emit MerchantRegistered(msg.sender, wallet, settlementToken);
    }

    function updateMerchant(
        address wallet,
        address settlementToken,
        bool swapEnabled,
        uint256 minPayment,
        uint256 maxPayment
    ) external onlyRegisteredMerchant(msg.sender) {
        if (wallet == address(0)) revert InvalidWallet();
        if (minPayment > maxPayment) revert AmountRangeInvalid();
        if (minPayment == 0) revert ZeroAmount();
        
        Merchant storage merchant = merchants[msg.sender];
        merchant.wallet = wallet;
        merchant.settlementToken = settlementToken;
        merchant.swapEnabled = swapEnabled;
        merchant.minPayment = minPayment;
        merchant.maxPayment = maxPayment;

        emit MerchantUpdated(msg.sender, wallet, settlementToken, swapEnabled);
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

        // NEW LOGIC: A token is valid if it's the primary settlement token OR explicitly allowed
        bool isWhitelisted = (token == merchant.settlementToken ||
            allowedTokens[merchantOwner][token]);

        if (!isWhitelisted) revert InvalidToken();

        bool needsSwap = (token != merchant.settlementToken &&
            merchant.swapEnabled);

        if (needsSwap) {
            _processWithSwap(merchantOwner, merchant, token, amount);
        } else {
            _processDirect(merchantOwner, merchant, token, amount);
        }
    }

    function _processDirect(
        address merchantOwner,
        Merchant memory merchant,
        address token,
        uint256 amount
    ) internal {
        // // Enforce direct settlement token
        // if (token != merchant.settlementToken) {
        //     revert InvalidToken(); // "Must use settlement token or enable swap"
        // }

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
            token,
            false
        );
    }

    function _processWithSwap(
    address merchantOwner,
    Merchant memory merchant,
    address token,
    uint256 amount
) internal {
    SwapConfig memory config = swapConfigs[merchantOwner];
    if (!config.enabled || config.adapter == address(0))
        revert SwapNotAllowed();
    
    // Check if adapter is approved by owner
    if (!isApprovedAdapter[config.adapter]) revert AdapterNotApproved();
    
    uint256 fee = (amount * feeBps) / 10000;
    uint256 swapAmount = amount - fee;
    
    // For now, use 0 minOutput for testing
    // TODO: Properly calculate min output in output token terms
    uint256 minOutput = 0;

    if (token == address(0)) {
        _handleETHSwap(merchant, config.adapter, amount, fee, swapAmount, minOutput);
    } else {
        _handleTokenSwap(merchant, config.adapter, token, amount, fee, swapAmount, minOutput);
    }

    emit PaymentProcessed(
        msg.sender,
        merchantOwner,
        amount,
        fee,
        token,
        true
    );
}
    function _handleETHSwap(
        Merchant memory merchant,
        address adapterAddr,
        uint256 amount,
        uint256 fee,
        uint256 swapAmount,
        uint256 minOutput
    ) private {
        // ETH -> Token
        if (msg.value != amount) revert InvalidAmount();

        // Transfer fee to vault
        (bool successFee, ) = address(feeVault).call{value: fee}("");
        if (!successFee) revert TransferFailed();

        // Execute swap directly to merchant
        ISwapAdapter(adapterAddr).swapEthToToken{value: swapAmount}(
            merchant.settlementToken,
            minOutput,
            merchant.wallet
        );
    }

    function _handleTokenSwap(
        Merchant memory merchant,
        address adapterAddr,
        address token,
        uint256 amount,
        uint256 fee,
        uint256 swapAmount,
        uint256 minOutput
    ) private {
        // Token -> ETH or Token -> Token
        if (msg.value != 0) revert InvalidAmount();

        // Transfer from user to this contract
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) 
            revert TransferFailed();

        // Transfer fee to vault
        if (!IERC20(token).transfer(address(feeVault), fee)) 
            revert TransferFailed();

        // Approve adapter
        if (!IERC20(token).approve(adapterAddr, swapAmount)) 
            revert TransferFailed(); 

        ISwapAdapter adapter = ISwapAdapter(adapterAddr); // Instantiate interface once

        if (merchant.settlementToken == address(0)) {
            // Token -> ETH
            adapter.swapTokenToEth(
                token,
                swapAmount,
                minOutput,
                merchant.wallet
            );
        } else {
            // Token -> Token
            adapter.swapTokenToToken(
                token,
                merchant.settlementToken,
                swapAmount,
                minOutput,
                merchant.wallet
            );
        }
        
        // CRITICAL: Reset approval to zero after swap
        if (!IERC20(token).approve(adapterAddr, 0)) 
            revert TransferFailed();
    }


    // ========== ADMIN FUNCTIONS ==========
    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 500) revert InvalidAmount(); // "Fee too high"
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setApprovedAdapter(address adapter, bool approved) external onlyOwner {
        if (adapter == address(0)) revert InvalidAdapter();
        isApprovedAdapter[adapter] = approved;
        emit AdapterStatusUpdated(adapter, approved);
    }

    function setSwapConfig(
        address adapter,
        bool enabled,
        uint256 slippageBps
    ) external onlyRegisteredMerchant(msg.sender) {
        if (slippageBps > 1000) revert InvalidSlippage(); // Max 10%
        
        // Check adapter is approved by owner (or is address(0) to disable)
        if (adapter != address(0)) {
            if (!isApprovedAdapter[adapter]) revert AdapterNotApproved();
        }
        
        swapConfigs[msg.sender] = SwapConfig({
            adapter: adapter,
            enabled: enabled,
            slippageBps: slippageBps
        });
        
        emit SwapConfigUpdated(msg.sender, adapter, enabled, slippageBps);
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

    // Get merchant info (no longer returns all fields at once due to stack too deep)
    function getMerchantWallet(
        address merchantOwner
    ) external view returns (address) {
        return merchants[merchantOwner].wallet;
    }

    function getMerchantSettlementToken(
        address merchantOwner
    ) external view returns (address) {
        return merchants[merchantOwner].settlementToken;
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

    function isSwapEnabled(address merchantOwner) external view returns (bool) {
        return merchants[merchantOwner].swapEnabled;
    }

    receive() external payable {}
}
