// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/token/ERC20/IERC20.sol";
import "../interfaces/ISwapAdapter.sol";
import "../Mock/MockERC20.sol";

contract MockSwapAdapter is ISwapAdapter {
    uint256 public constant MOCK_PRICE = 2000; // 1 ETH = 2000 USDC
    uint256 public constant FEE_BPS = 30; // 0.3% fee

    event SwapExecuted(
        address indexed caller,
        address indexed tokenOut,
        uint256 amountOut,
        address indexed recipient
    );
    
    // For testing - always returns fixed rate
    function swapETHToToken(
    address token,
    uint256 minOutputAmount,
    address recipient
) external payable returns (uint256 amountOut) {
    amountOut =
        (msg.value * MOCK_PRICE * (10000 - FEE_BPS))
        / 10000
        / 1e18;

    require(amountOut >= minOutputAmount, "Insufficient output");

    // ✅ mint to recipient
    MockERC20(token).mint(recipient, amountOut);

    emit SwapExecuted(msg.sender, token, amountOut, recipient);
}

    function swapTokenToETH(
        address fromToken,
        uint256 amountIn,
        uint256 minOutputAmount,
        address recipient
    ) external returns (uint256 amountOut) {
        // Mock implementation
        amountOut = (amountIn * 1e18 * (10000 - FEE_BPS)) / (MOCK_PRICE * 10000);
        require(amountOut >= minOutputAmount, "Insufficient output");
        return amountOut;
    }
    
    function swapTokenToToken(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minOutputAmount,
        address recipient
    ) external returns (uint256 amountOut) {
        // Mock implementation - assume 1:1 for same decimals
        amountOut = (amountIn * (10000 - FEE_BPS)) / 10000;
        require(amountOut >= minOutputAmount, "Insufficient output");
        return amountOut;
    }
    
    // Quote functions
    function getQuoteETHToToken(
        address toToken,
        uint256 amountIn
    ) external pure returns (uint256 amountOut, uint256 fee) {
        fee = (amountIn * FEE_BPS) / 10000;
        uint256 amountAfterFee = amountIn - fee;
        amountOut = (amountAfterFee * MOCK_PRICE) / 1e18;
        return (amountOut, fee);
    }
    
    function getQuoteTokenToETH(
        address fromToken,
        uint256 amountIn
    ) external pure returns (uint256 amountOut, uint256 fee) {
        fee = (amountIn * FEE_BPS) / 10000;
        uint256 amountAfterFee = amountIn - fee;
        amountOut = (amountAfterFee * 1e18) / MOCK_PRICE;
        return (amountOut, fee);
    }
    
    function getQuoteTokenToToken(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external pure returns (uint256 amountOut, uint256 fee) {
        fee = (amountIn * FEE_BPS) / 10000;
        amountOut = amountIn - fee;
        return (amountOut, fee);
    }
}