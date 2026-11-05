// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Shared package-multiplier constants, importable by PayrollGovernor.
uint256 constant BPS_DENOMINATOR = 10_000;
uint256 constant MAX_RATE_BPS = 1_000_000; // hard cap: a package can never pay more than 100x base

/**
 * @title PayrollVault
 * @notice Ring-fenced stablecoin payroll vault with pull-based, per-second wage
 * streaming for an employee-governed DAO. Pay is a stablecoin (MockUSDC in this
 * repo) so a wage earned is a fixed fiat amount anyone can verify against the
 * vault balance.
 *
 * Design invariants (the product pitch, expressed in code):
 *
 * 1. RING-FENCE — tokens can only enter (deposits and one-way funding from the
 *    working-capital treasury) and can only leave to the employee who earned
 *    them: {withdraw} always pays `msg.sender`. There is no function and no
 *    approval that lets the board, the governor, or the treasury move payroll
 *    funds anywhere else.
 *
 * 2. EARNED PAY IS SACRED — vested wages (`owedUnwithdrawn`) only ever grow.
 *    Every rate change (a governance package, a board salary edit, a removal)
 *    settles all elapsed time at the OLD rate first and applies the new rate
 *    strictly from the change timestamp onward. Votes therefore change future
 *    pay only; they can never reach pay already earned.
 *
 * 3. NO OVERDRAFT — payouts are capped at the vault's liquid token balance.
 *    If the vault is underfunded, the unpaid remainder stays owed (a visible
 *    liability that is never hidden or forgiven) and {backingReport} reports
 *    the shortfall honestly instead of claiming "fully backed".
 *
 * HACKATHON SCOPE: access control is a plain immutable board address plus a
 * one-time-set governor contract; package application and solvency views
 * iterate the employee list, so gas scales with headcount; and the accounting
 * assumes an honest ERC-20 stablecoin. This is demo code, not audited
 * production code.
 */
contract PayrollVault {
    using SafeERC20 for IERC20;

    /// @notice Per-employee wage stream. Rates are token base units (MockUSDC
    /// has 6 decimals) per second.
    struct Stream {
        uint256 baseRatePerSecond; // board-set base salary stream
        uint256 ratePerSecond;     // effective stream = base * packageRateBps / BPS_DENOMINATOR
        uint256 owedUnwithdrawn;   // vested but not yet withdrawn — can only grow
        uint256 lastAccrualTime;   // everything before this instant is already inside owedUnwithdrawn
    }

    /// @notice Public solvency snapshot. `accruedBacked` and `runwayBacked` are
    /// deliberately separate: covering only accrued wages must never be
    /// reported as "fully backed".
    struct BackingReport {
        uint256 liquidBalance;     // tokens actually held by this vault
        uint256 vestedUnwithdrawn; // accrued but unwithdrawn wages as of now
        uint256 futureRunway;      // committed future pay at current rates over `horizonSeconds`
        uint256 totalObligation;   // vestedUnwithdrawn + futureRunway
        bool accruedBacked;        // liquid covers every vested-but-unwithdrawn wage
        bool runwayBacked;         // liquid ALSO covers the committed future runway
        bool fullyBacked;          // accruedBacked && runwayBacked — true only when both hold
        uint256 accruedShortfall;  // shortfall against vested wages (0 when covered)
        uint256 runwayShortfall;   // shortfall against vested + runway (0 when covered)
    }

    // ──────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────

    IERC20 public immutable token;
    address public immutable board;

    /// @notice Governance contract allowed to apply voted packages. Set once
    /// by the board after deployment (avoids a constructor deployment cycle).
    address public governor;

    mapping(address => Stream) private _streams;
    address[] private _allEmployees; // every address ever hired, in hire order
    mapping(address => bool) private _everHired;
    mapping(address => bool) public isActiveEmployee;

    /// @notice Current company-wide package multiplier in basis points
    /// (10_000 = 100% of every employee's base rate).
    uint256 public packageRateBps;

    // ──────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────

    event EmployeeHired(address indexed employee, uint256 baseRatePerSecond);
    event EmployeeRemoved(address indexed employee);
    event BaseRateChanged(address indexed employee, uint256 oldBaseRatePerSecond, uint256 newBaseRatePerSecond);
    event PackageApplied(uint256 oldRateBps, uint256 newRateBps, uint256 effectiveFrom);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawal(address indexed employee, uint256 requested, uint256 paid);

    // ──────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────

    error NotBoard(address caller);
    error NotGovernor(address caller);
    error NotEmployee(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error ZeroRate();
    error RateTooHigh(uint256 rateBps);
    error UnknownEmployee(address employee);
    error AlreadyActiveEmployee(address employee);
    error GovernorAlreadySet();
    error ExceedsAccrued(uint256 requested, uint256 accrued);
    error NothingToWithdraw();
    error InsufficientBacking(uint256 available);

    modifier onlyBoard() {
        if (msg.sender != board) revert NotBoard(msg.sender);
        _;
    }

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor(msg.sender);
        _;
    }

    constructor(IERC20 token_, address board_, uint256 initialPackageBps_) {
        if (address(token_) == address(0) || board_ == address(0)) revert ZeroAddress();
        if (initialPackageBps_ == 0 || initialPackageBps_ > MAX_RATE_BPS) revert RateTooHigh(initialPackageBps_);
        token = token_;
        board = board_;
        governor = address(0);
        packageRateBps = initialPackageBps_;
    }

    /// @notice Hard cap on package multipliers (ABI-exposed for integrations).
    function maxRateBps() external pure returns (uint256) {
        return MAX_RATE_BPS;
    }

    // ──────────────────────────────────────────
    // Setup
    // ──────────────────────────────────────────

    /**
     * @notice Wire the governance contract (once). Kept out of the constructor
     * because the governor needs the vault address at its own deployment.
     */
    function setGovernor(address governor_) external onlyBoard {
        if (governor != address(0)) revert GovernorAlreadySet();
        if (governor_ == address(0)) revert ZeroAddress();
        governor = governor_;
    }

    // ──────────────────────────────────────────
    // Views: streams and solvency
    // ──────────────────────────────────────────

    /// @notice Tokens actually held by the vault (the liquid payroll pool).
    function liquidPayrollBalance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Vested wages for `employee` as of now, including time accrued
    /// since their last settlement. Returns 0 for addresses never hired.
    function accruedOf(address employee) public view returns (uint256) {
        if (!_everHired[employee]) return 0;
        return _settledOwed(_streams[employee]);
    }

    /// @notice What `employee` could pull right now: accrued wages capped by
    /// the liquid pool. Under a funded vault this equals accruedOf.
    function withdrawableOf(address employee) public view returns (uint256) {
        uint256 accrued = accruedOf(employee);
        uint256 liquid = liquidPayrollBalance();
        return accrued <= liquid ? accrued : liquid;
    }

    /// @notice Employee's effective pay stream right now (token units/second).
    function effectiveRateOf(address employee) public view returns (uint256) {
        return _streams[employee].ratePerSecond;
    }

    /// @notice Employee's board-set base stream (before the package multiplier).
    function baseRateOf(address employee) public view returns (uint256) {
        return _streams[employee].baseRatePerSecond;
    }

    /// @notice Every address ever hired, in hire order (removed ones included).
    function allEmployees() public view returns (address[] memory) {
        return _allEmployees;
    }

    /// @notice Currently accruing employees — this is the voter snapshot source.
    function activeEmployees() public view returns (address[] memory) {
        uint256 n = _allEmployees.length;
        uint256 count;
        for (uint256 i; i < n; ++i) {
            if (isActiveEmployee[_allEmployees[i]]) ++count;
        }
        address[] memory active = new address[](count);
        uint256 j;
        for (uint256 i; i < n; ++i) {
            if (isActiveEmployee[_allEmployees[i]]) active[j++] = _allEmployees[i];
        }
        return active;
    }

    /// @notice Sum of vested but unwithdrawn wages across every employee,
    /// computed live so it is never stale.
    function totalVestedUnwithdrawn() public view returns (uint256) {
        uint256 total;
        uint256 n = _allEmployees.length;
        for (uint256 i; i < n; ++i) {
            total += accruedOf(_allEmployees[i]);
        }
        return total;
    }

    /// @notice Committed future pay at current rates over `horizonSeconds`.
    function futureCommittedRunway(uint64 horizonSeconds) public view returns (uint256) {
        uint256 total;
        uint256 n = _allEmployees.length;
        for (uint256 i; i < n; ++i) {
            total += _streams[_allEmployees[i]].ratePerSecond * horizonSeconds;
        }
        return total;
    }

    /// @notice The honest solvency view: liquid payroll balance vs everything
    /// owed now plus the committed future runway. See BackingReport.
    function backingReport(uint64 horizonSeconds) public view returns (BackingReport memory report) {
        uint256 vested = totalVestedUnwithdrawn();
        uint256 runway = futureCommittedRunway(horizonSeconds);
        uint256 liquid = liquidPayrollBalance();
        report.liquidBalance = liquid;
        report.vestedUnwithdrawn = vested;
        report.futureRunway = runway;
        report.totalObligation = vested + runway;
        report.accruedBacked = liquid >= vested;
        report.runwayBacked = liquid >= vested + runway;
        report.fullyBacked = report.accruedBacked && report.runwayBacked;
        report.accruedShortfall = vested > liquid ? vested - liquid : 0;
        report.runwayShortfall = vested + runway > liquid ? vested + runway - liquid : 0;
    }

    /// @notice True only when every vested-but-unwithdrawn wage is covered.
    function isAccruedBacked() public view returns (bool) {
        return liquidPayrollBalance() >= totalVestedUnwithdrawn();
    }

    /// @notice True only when vested wages AND the committed future runway are
    /// both covered. Covering accrued wages alone does not satisfy this.
    function isRunwayBacked(uint64 horizonSeconds) public view returns (bool) {
        return liquidPayrollBalance() >= totalVestedUnwithdrawn() + futureCommittedRunway(horizonSeconds);
    }

    // ──────────────────────────────────────────
    // Employee (pull-based payout)
    // ──────────────────────────────────────────

    /**
     * @notice Withdraw up to `amount` of vested wages. Always pays the caller —
     * nobody can direct another employee's pay. If the vault is underfunded
     * the payout is capped at the liquid balance and the remainder stays owed.
     * @return paid Amount actually transferred (may be < requested when underfunded).
     */
    function withdraw(uint256 amount) external returns (uint256 paid) {
        if (!_everHired[msg.sender]) revert NotEmployee(msg.sender);
        Stream storage s = _streams[msg.sender];
        _settle(s);
        if (amount == 0) revert NothingToWithdraw();
        if (amount > s.owedUnwithdrawn) revert ExceedsAccrued(amount, s.owedUnwithdrawn);
        return _payout(s, amount);
    }

    /**
     * @notice Withdraw all vested wages (capped by the liquid balance).
     * @return paid Amount actually transferred.
     */
    function withdrawAll() external returns (uint256 paid) {
        if (!_everHired[msg.sender]) revert NotEmployee(msg.sender);
        Stream storage s = _streams[msg.sender];
        _settle(s);
        if (s.owedUnwithdrawn == 0) revert NothingToWithdraw();
        return _payout(s, s.owedUnwithdrawn);
    }

    // ──────────────────────────────────────────
    // Funding (inbound only — the ring fence)
    // ──────────────────────────────────────────

    /**
     * @notice Pull `amount` payroll backing tokens from the caller. The only
     * inbound gate besides direct transfers; nothing here can send funds back
     * out except to earning employees.
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    // ──────────────────────────────────────────
    // Board: employee registry and base rates
    // ──────────────────────────────────────────

    /**
     * @notice Hire `employee` at `baseRatePerSecond` (before the package
     * multiplier). Accrual starts at the hire timestamp, never earlier.
     * Re-hiring a removed employee reactivates them with the new base rate.
     */
    function hire(address employee, uint256 baseRatePerSecond) external onlyBoard {
        if (employee == address(0)) revert ZeroAddress();
        if (baseRatePerSecond == 0) revert ZeroRate();
        if (isActiveEmployee[employee]) revert AlreadyActiveEmployee(employee);
        Stream storage s = _streams[employee];
        _settle(s); // no-op accrual, but pins lastAccrualTime below anyway
        if (!_everHired[employee]) {
            _everHired[employee] = true;
            _allEmployees.push(employee);
        }
        isActiveEmployee[employee] = true;
        s.baseRatePerSecond = baseRatePerSecond;
        s.ratePerSecond = (baseRatePerSecond * packageRateBps) / BPS_DENOMINATOR;
        s.lastAccrualTime = block.timestamp;
        emit EmployeeHired(employee, baseRatePerSecond);
    }

    /**
     * @notice Change an employee's base rate. Time already elapsed is settled
     * at the old rate first, so the change is strictly future-only.
     */
    function setBaseRate(address employee, uint256 newBaseRatePerSecond) external onlyBoard {
        if (!isActiveEmployee[employee]) revert UnknownEmployee(employee);
        if (newBaseRatePerSecond == 0) revert ZeroRate();
        Stream storage s = _streams[employee];
        _settle(s);
        uint256 old = s.baseRatePerSecond;
        s.baseRatePerSecond = newBaseRatePerSecond;
        s.ratePerSecond = (newBaseRatePerSecond * packageRateBps) / BPS_DENOMINATOR;
        emit BaseRateChanged(employee, old, newBaseRatePerSecond);
    }

    /**
     * @notice Stop an employee's stream. Wages earned up to now are settled at
     * the current rate and stay withdrawable forever; the future rate is 0.
     */
    function removeEmployee(address employee) external onlyBoard {
        if (!isActiveEmployee[employee]) revert UnknownEmployee(employee);
        Stream storage s = _streams[employee];
        _settle(s);
        isActiveEmployee[employee] = false;
        s.ratePerSecond = 0;
        emit EmployeeRemoved(employee);
    }

    // ──────────────────────────────────────────
    // Governance execution
    // ──────────────────────────────────────────

    /**
     * @notice Apply a voted company package multiplier to every employee's
     * future pay. All time before `effectiveFrom` (= execution timestamp) is
     * settled at the old rate, so a vote can never re-rate pay already earned.
     * Only the PayrollGovernor may call this, and only as part of executing a
     * passed proposal.
     */
    function applyPackage(uint256 newRateBps) external onlyGovernor {
        if (newRateBps == 0 || newRateBps > MAX_RATE_BPS) revert RateTooHigh(newRateBps);
        uint256 oldRateBps = packageRateBps;
        uint256 effectiveFrom = block.timestamp;
        address[] memory list = _allEmployees;
        uint256 n = list.length;
        for (uint256 i; i < n; ++i) {
            Stream storage s = _streams[list[i]];
            _settle(s);
            s.ratePerSecond = isActiveEmployee[list[i]]
                ? (s.baseRatePerSecond * newRateBps) / BPS_DENOMINATOR
                : 0;
            s.lastAccrualTime = effectiveFrom;
        }
        packageRateBps = newRateBps;
        emit PackageApplied(oldRateBps, newRateBps, effectiveFrom);
    }

    // ──────────────────────────────────────────
    // Internals
    // ──────────────────────────────────────────

    function _settledOwed(Stream storage s) internal view returns (uint256) {
        if (block.timestamp <= s.lastAccrualTime || s.ratePerSecond == 0) {
            return s.owedUnwithdrawn;
        }
        return s.owedUnwithdrawn + (block.timestamp - s.lastAccrualTime) * s.ratePerSecond;
    }

    function _settle(Stream storage s) internal {
        if (block.timestamp > s.lastAccrualTime && s.ratePerSecond > 0) {
            s.owedUnwithdrawn += (block.timestamp - s.lastAccrualTime) * s.ratePerSecond;
        }
        s.lastAccrualTime = block.timestamp;
    }

    /// @dev Payout is capped at the liquid pool, so the vault can never
    /// overdraw. Effects run before the external token transfer.
    function _payout(Stream storage s, uint256 amount) internal returns (uint256 paid) {
        uint256 liquid = token.balanceOf(address(this));
        paid = amount <= liquid ? amount : liquid;
        if (paid == 0) revert InsufficientBacking(liquid);
        s.owedUnwithdrawn -= paid;
        token.safeTransfer(msg.sender, paid);
        emit Withdrawal(msg.sender, amount, paid);
    }
}
