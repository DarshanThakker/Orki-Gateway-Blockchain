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

//     function test_ProcessPaymentWithSwap() public {
//         // Setup merchant with swap enabled
//         vm.startPrank(owner);

//        // Register merchant
// vm.prank(merchantOwner);
// gateway.registerMerchant(
//     merchantWallet,
//     address(usdc),
//     100 * 10 ** 6,
//     10000 * 10 ** 6
// );

// // Configure swap (owner-only)
// vm.prank(owner);
// gateway.setSwapConfig(
//     merchantOwner,
//     address(swapAdapter),
//     true,
//     100
// );


//         vm.stopPrank();

//         // Allow ETH as payment token
//         vm.prank(merchantOwner);
//         gateway.setAllowedToken(address(0), true);

//         // Enable swap on merchant
//         vm.prank(merchantOwner);
//         gateway.updateMerchant(merchantWallet, address(usdc), true);

//         // Fund swap adapter with USDC for testing
//         vm.prank(owner);
//         usdc.mint(address(swapAdapter), 1000000 * 10 ** 6);

//         // Fund swap adapter with ETH
//         vm.deal(address(swapAdapter), 100 ether);

//         // Test ETH -> USDC swap payment
//         uint256 paymentAmount = 1 ether;
//         uint256 expectedFee = (paymentAmount * FEE_BPS) / 10000;

//         uint256 initialVaultBalance = address(feeVault).balance;

//         vm.prank(user);
//         gateway.processPayment{value: paymentAmount}(
//             merchantOwner,
//             address(0),
//             paymentAmount
//         );

//         // Fee should be collected in ETH
//         assertEq(address(feeVault).balance, initialVaultBalance + expectedFee);
//     }


// function test_ProcessPaymentWithSwap() public {
//     // Register merchant
//     vm.prank(merchantOwner);
//     gateway.registerMerchant(
//         merchantWallet,
//         address(usdc),
//         100 * 10 ** 6,
//         10000 * 10 ** 6
//     );

//     // Allow ETH payments
//     vm.prank(owner);
//     gateway.setAllowedToken(address(0), true);

//     // Enable swap config (owner only)
//     vm.prank(owner);
//     gateway.setSwapConfig(
//         merchantOwner,
//         address(swapAdapter),
//         true,
//         100 // 1% slippage
//     );

//     // Enable swap on merchant
//     vm.prank(merchantOwner);
//     gateway.updateMerchant(merchantWallet, address(usdc), true);

//     // Fund swap adapter
//     usdc.mint(address(swapAdapter), 1_000_000 * 10 ** 6);
//     vm.deal(address(swapAdapter), 100 ether);

//     uint256 paymentAmount = 1 ether;
//     uint256 expectedFee = (paymentAmount * FEE_BPS) / 10000;
//     uint256 initialVaultBalance = address(feeVault).balance;

//     // Pay with ETH
//     vm.prank(user);
//     gateway.processPayment{value: paymentAmount}(
//         merchantOwner,
//         address(0),
//         paymentAmount
//     );

//     // Fee collected in ETH
//     assertEq(address(feeVault).balance, initialVaultBalance + expectedFee);
// }

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

    // 3. Configure the Swap Adapter (Contract Owner only)
    vm.prank(owner);
    gateway.setSwapConfig(
        merchantOwner, 
        address(swapAdapter), 
        true, 
        100 // 1% slippage
    );

    // 4. Enable Swap on Merchant profile
    vm.prank(merchantOwner);
    gateway.updateMerchant(merchantWallet, address(usdc), true);

    // 5. Funding
    vm.deal(user, 2 ether);
    // Fund the adapter so it has USDC to send to the merchant
    usdc.mint(address(swapAdapter), 10_000 * 10**6);

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
    assertEq(address(feeVault).balance, initialVaultBalance + expectedFee, "Fee mismatch");

    // Check Merchant received USDC (Price 2000 * 0.99 ETH after fee * 0.997 adapter fee)
    // The exact amount depends on your Mock's math, but it should be > 0.
    uint256 merchantReceived = usdc.balanceOf(merchantWallet) - initialMerchantUSDC;
    assertGt(merchantReceived, 0, "Merchant did not receive any USDC");
    
    console.log("Merchant received USDC:", merchantReceived);

    // Ensure no ETH is stuck in the Gateway contract
    assertEq(address(gateway).balance, 0, "ETH stuck in gateway");
}    function test_Revert_UnregisteredMerchant() public {
        vm.expectRevert(abi.encodeWithSignature("MerchantNotRegistered()"));

        vm.prank(user);
        gateway.processPayment(merchantOwner, address(0), 1 ether);
    }


    function test_ProcessMultipleSettlementTokens() public {
    vm.startPrank(merchantOwner);
    gateway.registerMerchant(merchantWallet, address(usdc), 1, 1000 ether);
    
    // Whitelist DAI as an additional settlement token
    gateway.setAllowedToken(address(dai), true);
    vm.stopPrank();

    // Pay with DAI (should work now without swapping to USDC)
    uint256 paymentAmount = 100 * 10**18;
    vm.prank(user);
    dai.approve(address(gateway), paymentAmount);

    vm.prank(user);
    gateway.processPayment(merchantOwner, address(dai), paymentAmount);

    assertEq(dai.balanceOf(merchantWallet), paymentAmount - gateway.calculateFee(paymentAmount));
}

//     function test_Revert_InvalidToken() public {
//     // Register merchant
//     vm.prank(merchantOwner);
//     gateway.registerMerchant(
//         merchantWallet,
//         address(usdc),
//         100 * 10 ** 6,
//         10000 * 10 ** 6
//     );

//     // User tries to pay with unsupported token (DAI)
//     vm.expectRevert(abi.encodeWithSignature("MerchantNotRegistered()"));

//     vm.prank(user);
//     dai.approve(address(gateway), 1000 * 10 ** 18);

//     vm.prank(user);
//     gateway.processPayment(
//         merchantOwner,
//         address(dai),
//         1000 * 10 ** 18
//     );
// }


function test_Revert_InvalidToken() public {
    // 1. Register merchant with a wide range to be safe
    vm.prank(merchantOwner);
    gateway.registerMerchant(
        merchantWallet, 
        address(usdc), 
        1,              // min
        1000 ether      // max
    );

    // 2. Try to pay with DAI (which isn't whitelisted) using a valid amount
    vm.expectRevert(abi.encodeWithSignature("InvalidToken()"));

    vm.prank(user);
    gateway.processPayment(merchantOwner, address(dai), 10 ether); 
}


    function test_PauseUnpause() public {
        vm.prank(owner);
        gateway.pause();

        // Setup merchant first
        vm.startPrank(merchantOwner);
        gateway.registerMerchant(
            merchantWallet,
            address(0),
            0.1 ether,
            10 ether
        );
        vm.stopPrank();

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
}
