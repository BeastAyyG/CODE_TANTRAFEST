// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMintableVotesToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface ICastVote {
    function castVote(uint256 govId, uint8 support) external;
}

/**
 * @title FlashLoanVoter
 * @notice Test helper for the Beanstalk (April 2022) pattern: borrow voting
 *         power, vote, and repay inside one transaction. The "loan" is a
 *         mint and burn on the demo token.
 */
contract FlashLoanVoter {
    function borrowVoteRepay(
        address token,
        address governor,
        uint256 govId,
        uint256 amount
    ) external {
        IMintableVotesToken(token).mint(address(this), amount);
        ICastVote(governor).castVote(govId, 1);
        IMintableVotesToken(token).burn(address(this), amount);
    }
}
