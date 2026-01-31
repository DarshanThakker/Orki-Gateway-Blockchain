pragma solidity ^0.8.20;

contract OrkiGateway {
    bool public paused;

    function initialize() external {}

    function registerMerchant() external {}

    function pause(bool _p) external {
        paused = _p;
    }

    function setFees(uint16, uint16) external {}

    function processPayment() external payable {}
}
