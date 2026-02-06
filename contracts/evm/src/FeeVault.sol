// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/access/Ownable.sol";

contract FeeVault is Ownable {
    event FeeCollected(address indexed token, uint256 amount);
    event FeeWithdrawn(
        address indexed token,
        uint256 amount,
        address recipient
    );
    
    // ========== ERRORS ==========
    error TransferFailed();
    error InvalidToken();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // Receive native ETH
    receive() external payable {
        emit FeeCollected(address(0), msg.value);
    }

    // Withdraw ETH to multisig
    function withdrawEth(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        if (!success) revert TransferFailed();
        emit FeeWithdrawn(address(0), amount, owner());
    }

    // Withdraw ERC20 to multisig
    function withdrawERC20(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert InvalidToken();
        bool success = IERC20(token).transfer(owner(), amount);
        if (!success) revert TransferFailed();
        emit FeeWithdrawn(token, amount, owner());
    }

    function getNativeBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
