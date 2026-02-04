// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/OrkiGateway.sol";
import "@openzeppelin/token/ERC20/ERC20.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {
        _mint(msg.sender, 1000000 * 10**18);
    }
}

contract OrkiGatewayTest is Test {
    OrkiGateway public gateway;
    MockUSD public token;
    address public owner;
    address public merchant;
    address public user;
    address public feeVault;

    function setUp() public {
        owner = address(this);
        merchant = address(0x1);
        user = address(0x2);
        feeVault = address(0x3);

        gateway = new OrkiGateway();
        gateway.initialize(100, feeVault); // 1% fee

        token = new MockUSD();
        token.transfer(user, 1000 * 10**18);
        vm.deal(user, 100 ether);
        vm.deal(merchant, 0); // Ensure merchant starts with 0
    }

    function testRegisterMerchant() public {
        vm.prank(merchant);
        gateway.registerMerchant(merchant, address(0)); // Native
        
        (address wallet, address settlementToken, , bool registered) = gateway.merchants(merchant);
        assertTrue(registered);
        assertEq(wallet, merchant);
        assertEq(settlementToken, address(0));
    }

    function testProcessPaymentNative() public {
        vm.prank(merchant);
        gateway.registerMerchant(merchant, address(0));

        uint256 amount = 1 ether;
        uint256 fee = amount * 100 / 10000; // 1%
        uint256 merchantAmt = amount - fee;

        vm.prank(user);
        gateway.processPayment{value: amount}(merchant, address(0), amount);

        assertEq(feeVault.balance, fee);
        assertEq(merchant.balance, merchantAmt);
    }

    function testProcessPaymentERC20() public {
        vm.prank(merchant);
        gateway.registerMerchant(merchant, address(token)); // Merchant expects tokens

        uint256 amount = 100 * 10**18;
        uint256 fee = amount * 100 / 10000;
        uint256 merchantAmt = amount - fee;

        vm.startPrank(user);
        token.approve(address(gateway), amount);
        gateway.processPayment(merchant, address(token), amount);
        vm.stopPrank();

        assertEq(token.balanceOf(feeVault), fee);
        assertEq(token.balanceOf(merchant), merchantAmt);
    }

    function testFailPaymentMismatch() public {
        // Merchant expects Native, pay ERC20
        vm.prank(merchant);
        gateway.registerMerchant(merchant, address(0));

        vm.startPrank(user);
        token.approve(address(gateway), 100);
        gateway.processPayment(merchant, address(token), 100); // Should fail
        vm.stopPrank();
    }
}
