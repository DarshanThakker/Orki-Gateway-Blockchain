// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwapAdapter {
    function swapETHToToken(
        address toToken,
        uint256 minOutputAmount,
        address recipient
    ) external payable returns (uint256 amountOut);
    
    function swapTokenToETH(
        address fromToken,
        uint256 amountIn,
        uint256 minOutputAmount,
        address recipient
    ) external returns (uint256 amountOut);
    
    function swapTokenToToken(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 minOutputAmount,
        address recipient
    ) external returns (uint256 amountOut);
    
    function getQuoteETHToToken(
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
    
    function getQuoteTokenToETH(
        address fromToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
    
    function getQuoteTokenToToken(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
}