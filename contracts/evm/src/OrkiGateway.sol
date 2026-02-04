// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/token/ERC20/IERC20.sol";
import "@openzeppelin/access/Ownable.sol";
import "@openzeppelin/utils/Pausable.sol";

contract OrkiGateway is Ownable, Pausable {
    
    struct Merchant {
        address wallet;
        address settlementToken; // address(0) for native (ETH)
        bool swapEnabled;
        bool registered;
    }

    mapping(address => Merchant) public merchants;
    uint16 public feeBps;
    address public feeVault;

    event MerchantRegistered(address indexed owner, address wallet, address settlementToken);
    event MerchantUpdated(address indexed owner, address wallet, address settlementToken, bool swapEnabled);
    event PaymentProcessed(address indexed payer, address indexed merchant, uint256 amount, uint256 fee, address token);
    event FeeUpdated(uint16 newFee);
    event FeeVaultUpdated(address newVault);

    constructor() Ownable(msg.sender) {}

    function initialize(uint16 _feeBps, address _feeVault) external onlyOwner {
        feeBps = _feeBps;
        feeVault = _feeVault;
    }

    function registerMerchant(address _wallet, address _settlementToken) external {
        require(_wallet != address(0), "Invalid wallet");
        merchants[msg.sender] = Merchant({
            wallet: _wallet,
            settlementToken: _settlementToken,
            swapEnabled: false,
            registered: true
        });
        emit MerchantRegistered(msg.sender, _wallet, _settlementToken);
    }

    function updateMerchant(address _wallet, address _settlementToken, bool _swapEnabled) external {
        require(merchants[msg.sender].registered, "Merchant not registered");
        require(_wallet != address(0), "Invalid wallet");
        
        Merchant storage merchant = merchants[msg.sender];
        merchant.wallet = _wallet;
        merchant.settlementToken = _settlementToken;
        merchant.swapEnabled = _swapEnabled; // Prepared for valid Week 2 functionality even if swap logic isn't fully here

        emit MerchantUpdated(msg.sender, _wallet, _settlementToken, _swapEnabled);
    }

    function setFee(uint16 _feeBps) external onlyOwner {
        require(_feeBps <= 10000, "Invalid fee");
        feeBps = _feeBps;
        emit FeeUpdated(_feeBps);
    }

    function setFeeVault(address _feeVault) external onlyOwner {
        require(_feeVault != address(0), "Invalid vault");
        feeVault = _feeVault;
        emit FeeVaultUpdated(_feeVault);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }

    // Process payment from User -> Merchant & FeeVault
    function processPayment(address _merchantOwner, address _token, uint256 _amount) external payable whenNotPaused {
        Merchant memory merchant = merchants[_merchantOwner];
        require(merchant.registered, "Merchant not registered");
        require(_token == merchant.settlementToken, "Invalid settlement token");
        require(feeVault != address(0), "Fee vault not set");

        uint256 fee = (_amount * feeBps) / 10000;
        uint256 merchantAmount = _amount - fee;

        if (_token == address(0)) {
            // Native ETH Payment
            require(msg.value == _amount, "Incorrect ETH amount");
            
            // Transfer Fee
            (bool successFee, ) = feeVault.call{value: fee}("");
            require(successFee, "Fee transfer failed");

            // Transfer Merchant Amount
            (bool successMerch, ) = merchant.wallet.call{value: merchantAmount}("");
            require(successMerch, "Merchant transfer failed");
        } else {
            // ERC20 Payment
            require(msg.value == 0, "ETH sent with ERC20");
            IERC20 token = IERC20(_token);
            
            // Transfer Fee
            bool successFee = token.transferFrom(msg.sender, feeVault, fee);
            require(successFee, "Fee transfer failed");

            // Transfer Merchant Amount
            bool successMerch = token.transferFrom(msg.sender, merchant.wallet, merchantAmount);
            require(successMerch, "Merchant transfer failed");
        }
        
        emit PaymentProcessed(msg.sender, merchant.wallet, _amount, fee, _token);
    }
}
