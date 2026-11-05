// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayrollVault} from "./PayrollVault.sol";

/**
 * @title PayrollGovernor
 * @notice One-person-one-vote governance over the company's future pay.
 *
 * The board offers exactly two future work packages — a high-pressure/high-pay
 * option and a lower-pressure/lower-pay option. Every employee on the books at
 * proposal creation holds exactly one vote (a fixed snapshot: employees hired
 * afterwards cannot vote on proposals they never saw). After the voting
 * window, anyone may execute. Execution applies the winning package's pay
 * multiplier to every employee's FUTURE wage stream from the execution
 * timestamp; the PayrollVault settles all prior time at the old rate, so votes
 * can never touch pay already earned.
 *
 * Voting power is one vote per person, never token-weighted: the people doing
 * the work decide the work-versus-pay tradeoff.
 */
contract PayrollGovernor {
    // ──────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────

    enum Outcome {
        Pending,
        ExecutedHigh,
        ExecutedLow,
        FailedQuorum, // not enough employees voted — pay stays unchanged
        FailedTie,    // dead-even split — pay stays unchanged
        Canceled
    }

    /// @notice One of the two future work packages on offer.
    struct Package {
        string name;                  // human-readable label, e.g. "Sprint Mode"
        uint64 rateBps;               // pay multiplier in bps on every base rate (15_000 = 150%)
        uint32 expectedHoursPerWeek;  // informational: the "pressure" side of the tradeoff
        bytes32 detailsHash;          // hash of the off-chain package description
    }

    struct Proposal {
        uint64 createdAt;
        uint64 votingEndsAt;
        uint64 closedAt;      // 0 while pending
        uint256 quorumVotes;  // votes required (rounded up from quorumBps of the snapshot)
        uint256 votesHigh;
        uint256 votesLow;
        address[] snapshot;   // eligible voters, frozen at creation
        Outcome outcome;
        Package high;
        Package low;
        mapping(address voter => bool) hasVoted;
    }

    /// @notice Mapping-free mirror of Proposal for public reads.
    struct ProposalView {
        uint64 createdAt;
        uint64 votingEndsAt;
        uint64 closedAt;
        uint256 quorumVotes;
        uint256 votesHigh;
        uint256 votesLow;
        address[] snapshot;
        Outcome outcome;
        Package high;
        Package low;
    }

    // ──────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────

    PayrollVault public immutable payrollVault;
    address public immutable board;
    uint256 public immutable votingPeriodSeconds;
    uint256 public immutable quorumBps; // share of the snapshot that must vote, in bps

    uint256 public proposalCount;
    mapping(uint256 => Proposal) private _proposals;

    /// @notice Proposal currently open for voting/execution; 0 when none.
    uint256 public activeProposalId;

    // ──────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed by,
        uint64 votingEndsAt,
        uint256 quorumVotes,
        uint256 snapshotSize,
        uint256 highRateBps,
        uint256 lowRateBps
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool forHigh);
    event ProposalClosed(uint256 indexed proposalId, Outcome outcome, uint256 appliedRateBps);

    // ──────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────

    error NotBoard(address caller);
    error ZeroAddress();
    error InvalidConfig();
    error UnknownProposal(uint256 proposalId);
    error ActiveProposalExists(uint256 proposalId);
    error InvalidPackages();
    error NoEmployees();
    error NotEligible(address voter, uint256 proposalId);
    error AlreadyVoted(address voter, uint256 proposalId);
    error VotingStillOpen(uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error ProposalNotPending(uint256 proposalId);

    modifier onlyBoard() {
        if (msg.sender != board) revert NotBoard(msg.sender);
        _;
    }

    modifier existing(uint256 proposalId) {
        if (proposalId == 0 || proposalId > proposalCount) revert UnknownProposal(proposalId);
        _;
    }

    constructor(PayrollVault vault_, address board_, uint256 votingPeriodSeconds_, uint256 quorumBps_) {
        if (address(vault_) == address(0) || board_ == address(0)) revert ZeroAddress();
        if (votingPeriodSeconds_ == 0 || quorumBps_ == 0 || quorumBps_ > 10_000) revert InvalidConfig();
        payrollVault = vault_;
        board = board_;
        votingPeriodSeconds = votingPeriodSeconds_;
        quorumBps = quorumBps_;
    }

    // ──────────────────────────────────────────
    // Board: proposal creation
    // ──────────────────────────────────────────

    /**
     * @notice Offer exactly two future work packages to the employees. The
     * "high" package must pay strictly more than the "low" one. One proposal
     * may be open at a time; the voter snapshot is frozen at creation.
     */
    function createProposal(Package calldata high, Package calldata low)
        external
        onlyBoard
        returns (uint256 proposalId)
    {
        if (activeProposalId != 0) revert ActiveProposalExists(activeProposalId);
        if (
            bytes(high.name).length == 0 || bytes(low.name).length == 0
                || high.rateBps == 0 || low.rateBps == 0
                || high.rateBps <= low.rateBps // "high" must genuinely pay more
                || high.rateBps > PayrollVault.MAX_RATE_BPS || low.rateBps > PayrollVault.MAX_RATE_BPS
        ) {
            revert InvalidPackages();
        }

        address[] memory snapshot = payrollVault.activeEmployees();
        if (snapshot.length == 0) revert NoEmployees();

        proposalId = ++proposalCount;
        Proposal storage p = _proposals[proposalId];
        p.createdAt = uint64(block.timestamp);
        p.votingEndsAt = uint64(block.timestamp + votingPeriodSeconds);
        p.snapshot = snapshot;
        p.quorumVotes = (snapshot.length * quorumBps + 10_000 - 1) / 10_000; // round up
        p.high = high;
        p.low = low;
        activeProposalId = proposalId;

        emit ProposalCreated(
            proposalId, msg.sender, p.votingEndsAt, p.quorumVotes, snapshot.length, high.rateBps, low.rateBps
        );
    }

    /// @notice Scrap a pending proposal; pay stays unchanged.
    function cancel(uint256 proposalId) external onlyBoard existing(proposalId) {
        Proposal storage p = _proposals[proposalId];
        if (p.outcome != Outcome.Pending) revert ProposalNotPending(proposalId);
        p.outcome = Outcome.Canceled;
        p.closedAt = uint64(block.timestamp);
        if (activeProposalId == proposalId) activeProposalId = 0;
        emit ProposalClosed(proposalId, Outcome.Canceled, 0);
    }

    // ──────────────────────────────────────────
    // Employees: one person, one vote
    // ──────────────────────────────────────────

    /**
     * @notice Cast the caller's single vote on `proposalId`: true for the high
     * package, false for the low one. Only employees in the proposal's creation
     * snapshot may vote, and only once.
     */
    function castVote(uint256 proposalId, bool forHigh) external existing(proposalId) {
        Proposal storage p = _proposals[proposalId];
        if (p.outcome != Outcome.Pending) revert ProposalNotPending(proposalId);
        if (block.timestamp >= p.votingEndsAt) revert VotingClosed(proposalId);
        if (!_inSnapshot(p.snapshot, msg.sender)) revert NotEligible(msg.sender, proposalId);
        if (p.hasVoted[msg.sender]) revert AlreadyVoted(msg.sender, proposalId);
        p.hasVoted[msg.sender] = true;
        if (forHigh) {
            ++p.votesHigh;
        } else {
            ++p.votesLow;
        }
        emit VoteCast(proposalId, msg.sender, forHigh);
    }

    /**
     * @notice Close a finished vote and apply the outcome (permissionless —
     * governance should not depend on the board showing up). Outcomes that
     * change pay: ExecutedHigh / ExecutedLow. Outcomes that deliberately leave
     * pay unchanged: FailedQuorum, FailedTie (and board Canceled).
     */
    function execute(uint256 proposalId) external existing(proposalId) {
        Proposal storage p = _proposals[proposalId];
        if (p.outcome != Outcome.Pending) revert ProposalNotPending(proposalId);
        if (block.timestamp < p.votingEndsAt) revert VotingStillOpen(proposalId);

        Outcome outcome;
        uint256 appliedRateBps;
        uint256 totalVotes = p.votesHigh + p.votesLow;
        if (totalVotes < p.quorumVotes) {
            outcome = Outcome.FailedQuorum;
        } else if (p.votesHigh == p.votesLow) {
            outcome = Outcome.FailedTie;
        } else {
            bool highWins = p.votesHigh > p.votesLow;
            outcome = highWins ? Outcome.ExecutedHigh : Outcome.ExecutedLow;
            appliedRateBps = highWins ? p.high.rateBps : p.low.rateBps;
        }

        // Record the outcome before the external call (checks-effects-interactions).
        p.outcome = outcome;
        p.closedAt = uint64(block.timestamp);
        if (activeProposalId == proposalId) activeProposalId = 0;

        if (appliedRateBps != 0) {
            payrollVault.applyPackage(appliedRateBps);
        }
        emit ProposalClosed(proposalId, outcome, appliedRateBps);
    }

    // ──────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────

    /// @notice Full proposal state minus per-voter flags.
    function getProposal(uint256 proposalId) external view existing(proposalId) returns (ProposalView memory v) {
        Proposal storage p = _proposals[proposalId];
        v.createdAt = p.createdAt;
        v.votingEndsAt = p.votingEndsAt;
        v.closedAt = p.closedAt;
        v.quorumVotes = p.quorumVotes;
        v.votesHigh = p.votesHigh;
        v.votesLow = p.votesLow;
        v.snapshot = p.snapshot;
        v.outcome = p.outcome;
        v.high = p.high;
        v.low = p.low;
    }

    /// @notice Whether `voter` already used their one vote.
    function hasVoted(uint256 proposalId, address voter) public view existing(proposalId) returns (bool) {
        return _proposals[proposalId].hasVoted[voter];
    }

    /// @notice Whether `voter` was on the books when the proposal was created.
    function isEligible(uint256 proposalId, address voter) public view existing(proposalId) returns (bool) {
        return _inSnapshot(_proposals[proposalId].snapshot, voter);
    }

    /// @notice What `execute` would decide right now (stored outcome once closed).
    function pendingOutcome(uint256 proposalId) public view existing(proposalId) returns (Outcome) {
        Proposal storage p = _proposals[proposalId];
        if (p.outcome != Outcome.Pending) return p.outcome;
        if (block.timestamp < p.votingEndsAt) return Outcome.Pending;
        if (p.votesHigh + p.votesLow < p.quorumVotes) return Outcome.FailedQuorum;
        if (p.votesHigh == p.votesLow) return Outcome.FailedTie;
        return p.votesHigh > p.votesLow ? Outcome.ExecutedHigh : Outcome.ExecutedLow;
    }

    function _inSnapshot(address[] storage snapshot, address voter) internal pure returns (bool) {
        uint256 n = snapshot.length;
        for (uint256 i; i < n; ++i) {
            if (snapshot[i] == voter) return true;
        }
        return false;
    }
}
