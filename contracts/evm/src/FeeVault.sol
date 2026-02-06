// pragma solidity ^0.8.20;

// import "@openzeppelin/token/ERC20/IERC20.sol";
// import "@openzeppelin/access/Ownable.sol";

// contract FeeVault is Ownable {
//     event FeesCollected(address indexed collector, uint256 amount, address token);
//     event FeesWithdrawn(address indexed collector, uint256 amount, address token);

//     constructor() Ownable(msg.sender) {}

//     // Receive native ETH
//     receive() external payable {
//         emit FeesCollected(msg.sender, msg.value, address(0));
//     }

//     // Collect ERC20 tokens
//     function collectToken(address token, uint256 amount) external {
//         bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
//         require(success, "Transfer failed");
//         emit FeesCollected(msg.sender, amount, token);
//     }

//     // Withdraw functions for owner (multisig)
//     function withdrawNative(uint256 amount) external onlyOwner {
//         (bool success, ) = owner().call{value: amount}("");
//         require(success, "Withdrawal failed");
//         emit FeesWithdrawn(owner(), amount, address(0));
//     }

//     function withdrawToken(address token, uint256 amount) external onlyOwner {
//         bool success = IERC20(token).transfer(owner(), amount);
//         require(success, "Transfer failed");
//         emit FeesWithdrawn(owner(), amount, token);
//     }

//     // View balances
//     function getNativeBalance() external view returns (uint256) {
//         return address(this).balance;
//     }

//     function getTokenBalance(address token) external view returns (uint256) {
//         return IERC20(token).balanceOf(address(this));
//     }
// }

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

    constructor(address initialOwner) Ownable(initialOwner) {}

    // Receive native ETH
    receive() external payable {
        emit FeeCollected(address(0), msg.value);
    }

    // Collect ERC20 tokens (called by OrkiGateway)
    function collectERC20(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit FeeCollected(token, amount);
    }

    // Withdraw ETH to multisig
    function withdrawETH(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        require(success, "FeeVault: ETH withdrawal failed");
        emit FeeWithdrawn(address(0), amount, owner());
    }

    // Withdraw ERC20 to multisig
    function withdrawERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
        emit FeeWithdrawn(token, amount, owner());
    }

    function getNativeBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
