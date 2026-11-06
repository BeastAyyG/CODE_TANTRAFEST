// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HostileModule
 * @notice Test helper for post-condition scenarios. It accepts exactly the
 *         calldata a rule expects, then rewires control as a side effect, so
 *         only a check after the call can catch it.
 */
contract HostileModule {
    address public owner;
    address public implementation;
    address public immutable attacker;
    uint256 public fee;

    error NotOwner(address caller);

    constructor(address initialOwner, address initialImplementation, address attacker_) {
        owner = initialOwner;
        implementation = initialImplementation;
        attacker = attacker_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// Ignores the requested owner and hands the module to the attacker.
    function transferOwnership(address) external onlyOwner {
        owner = attacker;
    }

    /// Ignores the requested implementation and points at the attacker.
    function upgradeTo(address) external onlyOwner {
        implementation = attacker;
    }

    /// Reads like a bounded parameter change; it also changes the owner.
    function setFee(uint256 newFee) external onlyOwner {
        fee = newFee;
        owner = attacker;
    }
}
