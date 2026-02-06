// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OrkiGateway} from "../src/OrkiGateway.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {MockSwapAdapter} from "../src/adapters/MockSwapAdapter.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";

// Mock ERC20 for testing
contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

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
    MockSwapAdapter public swapAdapter;
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
        swapAdapter = new MockSwapAdapter();

        // Approve swap adapter
        gateway.setApprovedAdapter(address(swapAdapter), true);

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
            address(usdc), // Settlement in USDC
            100 * 10 ** 6, // min 100 USDC
            10000 * 10 ** 6 // max 10,000 USDC
        );

        address wallet = gateway.getMerchantWallet(merchantOwner);
        address settlementToken = gateway.getMerchantSettlementToken(
            merchantOwner
        );
        bool registered = gateway.isMerchantRegistered(merchantOwner);
        bool swapEnabled = gateway.isSwapEnabled(merchantOwner);

        assertEq(wallet, merchantWallet);
        assertEq(settlementToken, address(usdc));
        assertTrue(registered);
        assertFalse(swapEnabled);

        vm.stopPrank();
    }

    function test_Revert_RegisterMerchantZeroWallet() public {
        vm.startPrank(merchantOwner);
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidWallet.selector));
        gateway.registerMerchant(
            address(0),
            address(usdc),
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
            address(usdc),
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
            address(usdc),
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
            address(0), // ETH settlement
            0.1 ether,
            10 ether
        );
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

    function test_Revert_ProcessDirectETHWithERC20Token() public {
        // Setup
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            address(0), // ETH settlement
            0.1 ether,
            10 ether
        );
        vm.stopPrank();

        // Try to pay with USDC when settlement is ETH
        uint256 paymentAmount = 1 ether;
        
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidToken.selector));
        vm.prank(user);
        gateway.processPayment{value: paymentAmount}(
            merchantOwner,
            address(usdc),
            paymentAmount
        );
    }

    function test_ProcessDirectERC20Payment() public {
        // Setup
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            address(usdc),
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

    
    function test_ProcessPaymentWithSwap() public {
    // 1. Register Merchant
    vm.prank(merchantOwner);
    gateway.registerMerchant(
        merchantWallet,
        address(usdc),
        0.01 ether,
        10 ether
    );

    // 2. Allow ETH as a payment token
    vm.prank(merchantOwner);
    gateway.setAllowedToken(address(0), true);

    // 3. Enable Swap on Merchant profile
    vm.prank(merchantOwner);
    gateway.updateMerchant(merchantWallet, address(usdc), true, 0.01 ether, 10 ether);

    // 4. Merchant sets their own swap config with 0 slippage for testing
    vm.prank(merchantOwner);
    gateway.setSwapConfig(
        address(swapAdapter),
        true,
        0 // Use 0 slippage for testing
    );

    // 5. Funding
    vm.deal(user, 2 ether);
    // Fund the adapter so it has USDC to send to the merchant
    usdc.mint(address(swapAdapter), 10_000 * 10 ** 6);

    uint256 paymentAmount = 1 ether;
    uint256 expectedFee = (paymentAmount * FEE_BPS) / 10000;

    uint256 initialVaultBalance = address(feeVault).balance;
    uint256 initialMerchantUSDC = usdc.balanceOf(merchantWallet);

    // 6. Process the Payment
    vm.prank(user);
    gateway.processPayment{value: paymentAmount}(
        merchantOwner,
        address(0), // Paying with ETH
        paymentAmount
    );

    // 7. Assertions
    // Check ETH fee reached the vault
    assertEq(
        address(feeVault).balance,
        initialVaultBalance + expectedFee,
        "Fee mismatch"
    );

    // Check Merchant received USDC
    uint256 merchantReceived = usdc.balanceOf(merchantWallet) -
        initialMerchantUSDC;
    assertGt(merchantReceived, 0, "Merchant did not receive any USDC");

    console.log("Merchant received USDC:", merchantReceived);

    // Ensure no ETH is stuck in the Gateway contract
    assertEq(address(gateway).balance, 0, "ETH stuck in gateway");
}

    
    function test_Revert_ProcessSwapWithUnapprovedAdapter() public {
    // 1. Register Merchant
    vm.prank(merchantOwner);
    gateway.registerMerchant(
        merchantWallet,
        address(usdc),
        0.01 ether,
        10 ether
    );

    // 2. Allow ETH as a payment token
    vm.prank(merchantOwner);
    gateway.setAllowedToken(address(0), true);

    // 3. Enable Swap on Merchant profile
    vm.prank(merchantOwner);
    gateway.updateMerchant(merchantWallet, address(usdc), true, 0.01 ether, 10 ether);

    // 4. DO NOT set any swap config (no adapter configured)
    
    // 5. Try to pay with ETH (swap enabled but no adapter configured)
    vm.deal(user, 2 ether);
    
    // This should fail because swap is enabled but no adapter is configured
    vm.expectRevert(abi.encodeWithSelector(OrkiGateway.SwapNotAllowed.selector));
    
    vm.prank(user);
    gateway.processPayment{value: 1 ether}(
        merchantOwner,
        address(0),
        1 ether
    );
}

function test_CanAllowETHAsPaymentToken() public {
    vm.startPrank(merchantOwner);
    gateway.registerMerchant(
        merchantWallet,
        address(usdc),
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


    function test_ProcessMultipleSettlementTokens() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, address(usdc), 1, 1000 ether);
        
        // Whitelist DAI as an additional settlement token
        // Use default swapEnabled=false to test direct payment of whitelisted token
        gateway.setAllowedToken(address(dai), true);
        
        // DEBUG ASSERTION
        bool isAllowed = gateway.allowedTokens(merchantOwner, address(dai));
        assertTrue(isAllowed, "DAI should be allowed");
        
        vm.stopPrank();

        // Pay with DAI (should work now as a direct payment of whitelisted token)
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
        // 1. Register merchant with a wide range to be safe
        vm.prank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            address(usdc),
            1, // min
            1000 ether // max
        );

        // 2. Try to pay with DAI (which isn't whitelisted) using a valid amount
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidToken.selector));

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(dai), 10 ether);
    }

    function test_GetSupportedTokens() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, address(usdc), 1, 1000 ether);

        // Add multiple tokens
        gateway.setAllowedToken(address(usdc), true);
        gateway.setAllowedToken(address(dai), true);
        vm.stopPrank();

        address[] memory supportedTokens = gateway.getSupportedTokens(merchantOwner);
        
        assertEq(supportedTokens.length, 2);
        // Note: The array will contain both tokens, but order might vary based on implementation
    }

    function test_RemoveSupportedToken() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(merchantWallet, address(usdc), 1, 1000 ether);

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
            address(0),
            0.1 ether,
            10 ether
        );
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

    function test_FeeCalculation() public {
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
            address(usdc),
            100 * 10 ** 6,
            10000 * 10 ** 6
        );

        // Update merchant
        address newWallet = address(0x5);
        address newSettlementToken = address(dai);
        
        gateway.updateMerchant(
            newWallet,
            newSettlementToken,
            true,
            50 * 10 ** 6,
            5000 * 10 ** 6
        );

        assertEq(gateway.getMerchantWallet(merchantOwner), newWallet);
        assertEq(gateway.getMerchantSettlementToken(merchantOwner), newSettlementToken);
        assertTrue(gateway.isSwapEnabled(merchantOwner));
        
        (uint256 min, uint256 max) = gateway.getMerchantLimits(merchantOwner);
        assertEq(min, 50 * 10 ** 6);
        assertEq(max, 5000 * 10 ** 6);
        
        vm.stopPrank();
    }

    function test_Revert_UpdateMerchantZeroWallet() public {
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            address(usdc),
            100 * 10 ** 6,
            10000 * 10 ** 6
        );

        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidWallet.selector));
        gateway.updateMerchant(
            address(0),
            address(dai),
            true,
            50 * 10 ** 6,
            5000 * 10 ** 6
        );
        
        vm.stopPrank();
    }

    function test_ApprovedAdapterManagement() public {
        address newAdapter = address(0x999);
        
        vm.prank(owner);
        gateway.setApprovedAdapter(newAdapter, true);
        
        assertTrue(gateway.isApprovedAdapter(newAdapter));
        
        vm.prank(owner);
        gateway.setApprovedAdapter(newAdapter, false);
        
        assertFalse(gateway.isApprovedAdapter(newAdapter));
    }

    function test_Revert_SetApprovedAdapterZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OrkiGateway.InvalidAdapter.selector));
        gateway.setApprovedAdapter(address(0), true);
    }
}
