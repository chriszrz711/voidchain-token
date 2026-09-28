// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

contract SimpleToken {
    string public name = "SimpleChain Token";
    string public symbol = "SCT";
    uint8 public decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply * 10 ** decimals;
        balanceOf[msg.sender] = totalSupply;

        emit Transfer(
            address(0),
            msg.sender,
            totalSupply
        );
    }

    function transfer(
        address to,
        uint256 amount
    ) public returns (bool) {
        require(
            to != address(0),
            "invalid recipient"
        );

        require(
            balanceOf[msg.sender] >= amount,
            "insufficient balance"
        );

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(
            msg.sender,
            to,
            amount
        );

        return true;
    }
}