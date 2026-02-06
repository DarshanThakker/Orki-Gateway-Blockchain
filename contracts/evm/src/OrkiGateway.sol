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

    // ========== STATE VARIABLES ==========
    FeeVault public feeVault;
    uint256 public feeBps; // Basis points (100 = 1%)

    mapping(address => Merchant) public merchants;
    mapping(address => mapping(address => bool)) public allowedTokens;
    mapping(address => SwapConfig) public swapConfigs;

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
    event FeeUpdated(uint256 newFeeBps);

    // ========== ERRORS ==========
    error InvalidAddress();
    error MerchantNotRegistered();
    error InvalidToken();
    error InvalidAmount();
    error SwapNotAllowed();
    error TransferFailed();

    // ========== CONSTRUCTOR ==========
    // constructor(address _owner, address _feeVault, uint256 _feeBps) Ownable(_owner) {
    //     require(_feeVault != address(0), "Invalid fee vault");
    //     require(_feeBps <= 500, "Fee too high"); // Max 5%

    //     feeVault = FeeVault(_feeVault);
    //     feeBps = _feeBps;
    // }

    constructor(
        address _owner,
        address _feeVault,
        uint256 _feeBps
    ) Ownable(_owner) {
        require(_feeVault != address(0), "Invalid fee vault");
        require(_feeBps <= 500, "Fee too high");

        feeVault = FeeVault(payable(_feeVault));
        feeBps = _feeBps;
    }

    // ========== MODIFIERS ==========
    modifier onlyRegisteredMerchant(address merchantOwner) {
        if (!merchants[merchantOwner].registered)
            revert MerchantNotRegistered();
        _;
    }

    // ========== MERCHANT FUNCTIONS ==========
    function registerMerchant(
        address wallet,
        address settlementToken,
        uint256 minPayment,
        uint256 maxPayment
    ) external {
        require(wallet != address(0), "Invalid wallet");
        require(!merchants[msg.sender].registered, "Already registered");
        require(minPayment <= maxPayment, "Invalid amount range");

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
        bool swapEnabled
    ) external onlyRegisteredMerchant(msg.sender) {
        require(wallet != address(0), "Invalid wallet");

        Merchant storage merchant = merchants[msg.sender];
        merchant.wallet = wallet;
        merchant.settlementToken = settlementToken;
        merchant.swapEnabled = swapEnabled;

        emit MerchantUpdated(msg.sender, wallet, settlementToken, swapEnabled);
    }

    function setAllowedToken(
        address token,
        bool allowed
    ) external onlyRegisteredMerchant(msg.sender) {
        allowedTokens[msg.sender][token] = allowed;
        emit TokenAllowed(msg.sender, token, allowed);
    }

    // ========== PAYMENT PROCESSING ==========
    // function processPayment(
    //     address merchantOwner,
    //     address token,
    //     uint256 amount
    // ) external payable nonReentrant whenNotPaused {
    //     Merchant memory merchant = merchants[merchantOwner];

    //     // Validations
    //     if (!merchant.registered) revert MerchantNotRegistered();
    //     if (amount < merchant.minPayment || amount > merchant.maxPayment)
    //         revert InvalidAmount();
    //     if (
    //         token != merchant.settlementToken &&
    //         !allowedTokens[merchantOwner][token]
    //     ) revert InvalidToken();

    //     // Check if swap is needed
    //     bool needsSwap = token != merchant.settlementToken &&
    //         merchant.swapEnabled;

    //     if (needsSwap) {
    //         _processWithSwap(merchantOwner, merchant, token, amount);
    //     } else {
    //         _processDirect(merchantOwner, merchant, token, amount);
    //     }
    // }

    // function _processDirect(
    //     address merchantOwner,
    //     Merchant memory merchant,
    //     address token,
    //     uint256 amount
    // ) internal {
    //     // Validate token matches settlement token
    //     require(token == merchant.settlementToken, "Token mismatch");

    //     uint256 fee = (amount * feeBps) / 10000;
    //     uint256 merchantAmount = amount - fee;

    //     if (token == address(0)) {
    //         // Native ETH
    //         require(msg.value == amount, "ETH amount mismatch");

    //         // Transfer fee to vault
    //         (bool successFee, ) = address(feeVault).call{value: fee}("");
    //         if (!successFee) revert TransferFailed();

    //         // Transfer to merchant
    //         (bool successMerch, ) = merchant.wallet.call{value: merchantAmount}(
    //             ""
    //         );
    //         if (!successMerch) revert TransferFailed();
    //     } else {
    //         // ERC20
    //         require(msg.value == 0, "ETH sent with ERC20");

    //         // Transfer fee to vault
    //         IERC20(token).transferFrom(msg.sender, address(feeVault), fee);

    //         // Transfer to merchant
    //         IERC20(token).transferFrom(
    //             msg.sender,
    //             merchant.wallet,
    //             merchantAmount
    //         );
    //     }

    //     emit PaymentProcessed(
    //         msg.sender,
    //         merchantOwner,
    //         amount,
    //         fee,
    //         token,
    //         false
    //     );
    // }

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
    bool isWhitelisted = (token == merchant.settlementToken || allowedTokens[merchantOwner][token]);
    
    if (!isWhitelisted) revert InvalidToken();

    // Swap is only needed if the token isn't the primary one AND swap is enabled
    // If swap is NOT enabled, we treat whitelisted tokens as direct settlement
    bool needsSwap = (token != merchant.settlementToken && merchant.swapEnabled);

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
    // REMOVE or CHANGE this line:
    // require(token == merchant.settlementToken, "Token mismatch"); 

    uint256 fee = (amount * feeBps) / 10000;
    uint256 merchantAmount = amount - fee;

    if (token == address(0)) {
        require(msg.value == amount, "ETH amount mismatch");
        (bool successFee, ) = address(feeVault).call{value: fee}("");
        if (!successFee) revert TransferFailed();

        (bool successMerch, ) = merchant.wallet.call{value: merchantAmount}("");
        if (!successMerch) revert TransferFailed();
    } else {
        require(msg.value == 0, "ETH sent with ERC20");
        IERC20(token).transferFrom(msg.sender, address(feeVault), fee);
        IERC20(token).transferFrom(msg.sender, merchant.wallet, merchantAmount);
    }

    emit PaymentProcessed(msg.sender, merchantOwner, amount, fee, token, false);
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

        uint256 fee = (amount * feeBps) / 10000;
        uint256 swapAmount = amount - fee;

        ISwapAdapter adapter = ISwapAdapter(config.adapter);

        if (token == address(0)) {
            // ETH -> Token
            require(msg.value == amount, "ETH amount mismatch");

            // Transfer fee to vault
            (bool successFee, ) = address(feeVault).call{value: fee}("");
            if (!successFee) revert TransferFailed();

            // Execute swap directly to merchant
            adapter.swapETHToToken{value: swapAmount}(
                merchant.settlementToken,
                swapAmount,
                merchant.wallet
            );
        } else {
            // Token -> ETH or Token -> Token
            require(msg.value == 0, "ETH sent with ERC20");

            // Transfer from user to this contract
            IERC20(token).transferFrom(msg.sender, address(this), amount);

            // Transfer fee to vault
            IERC20(token).transfer(address(feeVault), fee);

            // Approve adapter
            IERC20(token).approve(config.adapter, swapAmount);

            if (merchant.settlementToken == address(0)) {
                // Token -> ETH
                adapter.swapTokenToETH(
                    token,
                    swapAmount,
                    0, // minOutputAmount (TODO: enforce slippage)
                    merchant.wallet
                );
            } else {
                // Token -> Token
                adapter.swapTokenToToken(
                    token,
                    merchant.settlementToken,
                    swapAmount,
                    0, // minOutputAmount
                    merchant.wallet
                );
            }
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

    // ========== ADMIN FUNCTIONS ==========
    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 500, "Fee too high");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setSwapConfig(
        address merchantOwner,
        address adapter,
        bool enabled,
        uint256 slippageBps
    ) external onlyOwner {
        require(slippageBps <= 1000, "Slippage too high"); // Max 10%
        swapConfigs[merchantOwner] = SwapConfig({
            adapter: adapter,
            enabled: enabled,
            slippageBps: slippageBps
        });
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
            IERC20(token).transfer(owner(), amount);
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
