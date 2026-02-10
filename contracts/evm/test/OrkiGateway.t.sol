// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OrkiGateway} from "../src/OrkiGateway.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

// Mock ERC20 for testing
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // event Transfer(address indexed from, address indexed to, uint256 value);
    // event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(
            allowance[from][msg.sender] >= amount,
            "Insufficient allowance"
        );

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;

        emit Transfer(from, to, amount);
        return true;
    }
}

contract OrkiGatewayTest is Test {
    OrkiGateway public gateway;
    FeeVault public feeVault;
    MockERC20 public usdc;
    MockERC20 public dai;

    address owner = address(0x1);
    address merchantOwner = address(0x2);
    address merchantWallet = address(0x3);
    address user = address(0x4);

    uint256 constant FEE_BPS = 100; // 1%

    function setUp() public {
        // Set up accounts
        vm.startPrank(owner);

        // Deploy contracts
        feeVault = new FeeVault(owner);
        gateway = new OrkiGateway(owner, address(feeVault), FEE_BPS);

        // Deploy mock tokens
        usdc = new MockERC20("USDC", "USDC", 6);
        dai = new MockERC20("DAI", "DAI", 18);

        // Fund accounts
        vm.deal(merchantOwner, 100 ether);
        vm.deal(merchantWallet, 100 ether);
        vm.deal(user, 100 ether);
        usdc.mint(user, 1000000 * 10 ** 6);
        dai.mint(user, 1000000 * 10 ** 18);

        vm.stopPrank();
    }

    function test_RegisterMerchant() public {
        vm.startPrank(merchantOwner);

        gateway.registerMerchant(
            merchantWallet,
            100 * 10 ** 6, // min 100 USDC
            10000 * 10 ** 6 // max 10,000 USDC
        );

        address wallet = gateway.getMerchantWallet(merchantOwner);
        bool registered = gateway.isMerchantRegistered(merchantOwner);

        assertEq(wallet, merchantWallet);
        assertTrue(registered);

        vm.stopPrank();
    }

    function test_Revert_RegisterMerchantZeroWallet() public {
        vm.startPrank(merchantOwner);
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidWallet.selector));
        gateway.registerMerchant(
            address(0),
            100 * 10 ** 6,
            10000 * 10 ** 6
        );
        
        vm.stopPrank();
    }

    function test_Revert_RegisterMerchantZeroMinPayment() public {
        vm.startPrank(merchantOwner);
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.ZeroAmount.selector));
        gateway.registerMerchant(
            merchantWallet,
            0,
            10000 * 10 ** 6
        );
        
        vm.stopPrank();
    }

    function test_Revert_RegisterMerchantInvalidRange() public {
        vm.startPrank(merchantOwner);
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.AmountRangeInvalid.selector));
        gateway.registerMerchant(
            merchantWallet,
            200 * 10 ** 6,
            100 * 10 ** 6
        );
        
        vm.stopPrank();
    }

    function test_ProcessDirectETHPayment() public {
        // Setup
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            0.1 ether,
            10 ether
        );
        gateway.setAllowedToken(address(0), true); // Allow ETH
        vm.stopPrank();

        // Test payment
        uint256 paymentAmount = 1 ether;
        uint256 expectedFee = (paymentAmount * FEE_BPS) / 10000;
        uint256 expectedMerchantAmount = paymentAmount - expectedFee;

        uint256 initialVaultBalance = address(feeVault).balance;
        uint256 initialMerchantBalance = merchantWallet.balance;

        vm.prank(user);
        gateway.processPayment{value: paymentAmount}(
            merchantOwner,
            address(0),
            paymentAmount
        );

        assertEq(address(feeVault).balance, initialVaultBalance + expectedFee);
        assertEq(
            merchantWallet.balance,
            initialMerchantBalance + expectedMerchantAmount
        );
    }

     function test_Revert_ProcessPaymentTokenNotAllowed() public {
        // Setup
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            0.1 ether,
            10 ether
        );
        // Do NOT allow ETH
        vm.stopPrank();

        uint256 paymentAmount = 1 ether;
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidToken.selector));
        vm.prank(user);
        gateway.processPayment{value: paymentAmount}(
            merchantOwner,
            address(0),
            paymentAmount
        );
    }


    function test_ProcessDirectERC20Payment() public {
        // Setup
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            100 * 10 ** 6,
            10000 * 10 ** 6
        );
        gateway.setAllowedToken(address(usdc), true);
        vm.stopPrank();

        // Approve gateway to spend USDC
        uint256 paymentAmount = 1000 * 10 ** 6; // 1000 USDC
        uint256 expectedFee = (paymentAmount * FEE_BPS) / 10000;

        vm.prank(user);
        usdc.approve(address(gateway), paymentAmount);

        uint256 initialVaultBalance = usdc.balanceOf(address(feeVault));
        uint256 initialMerchantBalance = usdc.balanceOf(merchantWallet);

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(usdc), paymentAmount);

        assertEq(
            usdc.balanceOf(address(feeVault)),
            initialVaultBalance + expectedFee
        );
        assertEq(
            usdc.balanceOf(merchantWallet),
            initialMerchantBalance + (paymentAmount - expectedFee)
        );
    }
 
    function test_CanAllowETHAsPaymentToken() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            100 * 10 ** 6,
            10000 * 10 ** 6
        );
        
        // This should work - allow ETH (address(0)) as payment token
        gateway.setAllowedToken(address(0), true);
        vm.stopPrank();
        
        // Verify ETH is allowed
        bool ethAllowed = gateway.allowedTokens(merchantOwner, address(0));
        assertTrue(ethAllowed, "ETH should be allowed as payment token");
        
        // Verify supported tokens includes ETH
        address[] memory supportedTokens = gateway.getSupportedTokens(merchantOwner);
        bool foundETH = false;
        for (uint i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == address(0)) {
                foundETH = true;
                break;
            }
        }
        assertTrue(foundETH, "ETH should be in supported tokens list");
    }

    function test_Revert_UnregisteredMerchant() public {
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.MerchantNotRegistered.selector));

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(0), 1 ether);
    }

    function test_ProcessMultiplePaymentTokens() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 1, 1000 ether);
        
        gateway.setAllowedToken(address(usdc), true);
        gateway.setAllowedToken(address(dai), true);
        
        // DEBUG ASSERTION
        bool isAllowed = gateway.allowedTokens(merchantOwner, address(dai));
        assertTrue(isAllowed, "DAI should be allowed");
        
        vm.stopPrank();

        // Pay with DAI
        uint256 paymentAmount = 100 * 10 ** 18;
        vm.prank(user);
        dai.approve(address(gateway), paymentAmount);

        uint256 initialMerchantDai = dai.balanceOf(merchantWallet);

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(dai), paymentAmount);

        // Merchant should receive DAI directly
        uint256 fee = gateway.calculateFee(paymentAmount);
        uint256 expectedMerchantAmount = paymentAmount - fee;
        
        assertEq(
            dai.balanceOf(merchantWallet),
            initialMerchantDai + expectedMerchantAmount
        );
    }

    function test_Revert_InvalidToken() public {
        // 1. Register merchant
        vm.prank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            1, // min
            1000 ether // max
        );
        // Only allow USDC
        vm.prank(merchantOwner);
        gateway.setAllowedToken(address(usdc), true);

        // 2. Try to pay with DAI (which isn't whitelisted) using a valid amount
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidToken.selector));

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(dai), 10 ether);
    }

    function test_GetSupportedTokens() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 1, 1000 ether);

        // Add multiple tokens
        gateway.setAllowedToken(address(usdc), true);
        gateway.setAllowedToken(address(dai), true);
        vm.stopPrank();

        address[] memory supportedTokens = gateway.getSupportedTokens(merchantOwner);
        
        assertEq(supportedTokens.length, 2);
    }

    function test_RemoveSupportedToken() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 1, 1000 ether);

        // Add token
        gateway.setAllowedToken(address(dai), true);
        
        // Check it's added
        address[] memory tokens = gateway.getSupportedTokens(merchantOwner);
        assertEq(tokens.length, 1);
        
        // Remove token
        gateway.setAllowedToken(address(dai), false);
        
        // Check it's removed
        tokens = gateway.getSupportedTokens(merchantOwner);
        assertEq(tokens.length, 0);
        vm.stopPrank();
    }

    function test_PauseUnpause() public {
        // Setup merchant first
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            0.1 ether,
            10 ether
        );
        gateway.setAllowedToken(address(0), true);
        vm.stopPrank();
    
        // Pause and test
        vm.prank(owner);
        gateway.pause();
    
        // OpenZeppelin v5 Pausable uses custom error EnforcedPause()
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()")); 
    
        vm.prank(user);
        gateway.processPayment{value: 1 ether}(
            merchantOwner,
            address(0),
            1 ether
        );
    
        // Unpause and try again
        vm.prank(owner);
        gateway.unpause();
    
        uint256 initialBalance = merchantWallet.balance;
    
        vm.prank(user);
        gateway.processPayment{value: 1 ether}(
            merchantOwner,
            address(0),
            1 ether
        );
    
        assertGt(merchantWallet.balance, initialBalance);
    }

    function test_FeeCalculation() public view{
        uint256 amount = 1000 ether;
        uint256 fee = gateway.calculateFee(amount);
        assertEq(fee, (amount * FEE_BPS) / 10000);
    }

    function test_UpdateFee() public {
        uint256 newFee = 200; // 2%

        vm.prank(owner);
        gateway.setFee(newFee);

        uint256 amount = 1000 ether;
        uint256 fee = gateway.calculateFee(amount);
        assertEq(fee, (amount * newFee) / 10000);
    }

    function test_Revert_UpdateFeeTooHigh() public {
        uint256 newFee = 600; // 6% - above maximum

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAmount.selector));
        gateway.setFee(newFee);
    }

    function test_UpdateMerchant() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            100 * 10 ** 6,
            10000 * 10 ** 6
        );

        // Update merchant
        address newWallet = address(0x5);
        
        gateway.updateMerchant(
            newWallet,
            50 * 10 ** 6,
            5000 * 10 ** 6
        );

        assertEq(gateway.getMerchantWallet(merchantOwner), newWallet);
        
        (uint256 min, uint256 max) = gateway.getMerchantLimits(merchantOwner);
        assertEq(min, 50 * 10 ** 6);
        assertEq(max, 5000 * 10 ** 6);
        
        vm.stopPrank();
    }

    function test_Revert_UpdateMerchantZeroWallet() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            100 * 10 ** 6,
            10000 * 10 ** 6
        );

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidWallet.selector));
        gateway.updateMerchant(
            address(0),
            50 * 10 ** 6,
            5000 * 10 ** 6
        );
        
        vm.stopPrank();
    }

    function test_Revert_ProcessPaymentBelowMin() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            1 ether, // Min 1 ETH
            10 ether
        );
        gateway.setAllowedToken(address(0), true);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAmount.selector));
        
        vm.prank(user);
        // Try paying 0.5 ETH
        gateway.processPayment{value: 0.5 ether}(
            merchantOwner,
            address(0),
            0.5 ether
        );
    }

    function test_Revert_ProcessPaymentAboveMax() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            0.1 ether,
            1 ether // Max 1 ETH
        );
        gateway.setAllowedToken(address(0), true);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAmount.selector));

        vm.prank(user);
        // Try paying 2 ETH
        gateway.processPayment{value: 2 ether}(
            merchantOwner,
            address(0),
            2 ether
        );
    }

    function test_Revert_ProcessPaymentETHValueMismatch() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 0.1 ether, 10 ether);
        gateway.setAllowedToken(address(0), true);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAmount.selector));

        vm.prank(user);
        // Send 0.5 ETH but say amount is 1 ETH
        gateway.processPayment{value: 0.5 ether}(
            merchantOwner,
            address(0),
            1 ether
        );
    }

    function test_Revert_ProcessPaymentERC20ValueMismatch() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 100 * 10**6, 1000 * 10**6);
        gateway.setAllowedToken(address(usdc), true);
        vm.stopPrank();

        uint256 amount = 100 * 10**6;
        vm.prank(user);
        usdc.approve(address(gateway), amount);

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAmount.selector));

        vm.prank(user);
        // Send ETH with ERC20 payment
        gateway.processPayment{value: 1 ether}(
            merchantOwner,
            address(usdc),
            amount
        );
    }

    function test_Revert_RegisterMerchantAlreadyRegistered() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, 1, 100);

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.AlreadyRegistered.selector));
        gateway.registerMerchant(merchantWallet, 1, 100);
        vm.stopPrank();
    }

    function test_Revert_SetAllowedTokenNotMerchant() public {
        // User is not a merchant
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.MerchantNotRegistered.selector));
        gateway.setAllowedToken(address(usdc), true);
    }

    function test_Revert_UpdateMerchantNotRegistered() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.MerchantNotRegistered.selector));
        gateway.updateMerchant(user, 1, 100);
    }

    function test_EmergencyWithdrawETH() public {
        // Send some ETH to the contract (forcefully or via receive)
        // OrkiGateway has a receive() function
        vm.deal(address(gateway), 5 ether);
        
        uint256 initialOwnerBalance = owner.balance;

        vm.prank(owner);
        gateway.emergencyWithdraw(address(0), 5 ether);

        assertEq(owner.balance, initialOwnerBalance + 5 ether);
        assertEq(address(gateway).balance, 0);
    }

     function test_EmergencyWithdrawERC20() public {
        // Drop some USDC into the contract
        usdc.mint(address(gateway), 1000 * 10**6);
        
        uint256 initialOwnerBalance = usdc.balanceOf(owner);

        vm.prank(owner);
        gateway.emergencyWithdraw(address(usdc), 1000 * 10**6);

        assertEq(usdc.balanceOf(owner), initialOwnerBalance + 1000 * 10**6);
        assertEq(usdc.balanceOf(address(gateway)), 0);
    }
}
