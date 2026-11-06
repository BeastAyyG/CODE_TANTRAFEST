// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title MockGovernanceToken
 * @notice Demo governance token with ERC20Votes checkpoints, so IntentGovernor
 *         can weigh a vote at a past block instead of the live balance.
 *
 *         Demo-only, like MockUSDC: anyone can mint or burn. Holders are
 *         self-delegated on first receipt, so a balance becomes voting power
 *         without a separate delegate() call.
 */
contract MockGovernanceToken is ERC20, ERC20Votes {
    constructor()
        ERC20("AegisDAO Governance", "GOV")
        EIP712("AegisDAO Governance", "1")
    {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
        if (to != address(0) && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }
}
