// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwapAdapter {
    function swapEthToToken(
        address toToken,
        uint256 minOutputAmount,
        address recipient
    ) external payable returns (uint256 amountOut);
    
    function swapTokenToEth(
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
    
    function getQuoteEthToToken(
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
    
    function getQuoteTokenToEth(
        address fromToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
    
    function getQuoteTokenToToken(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut, uint256 fee);
}