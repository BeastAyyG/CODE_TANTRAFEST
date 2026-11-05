// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title WorkingCapitalVault
 * @notice The company treasury: holds operating funds the board may spend on
 * anything the business needs — EXCEPT it can never take payroll money back.
 *
 * Funding payroll is an explicit, one-way transfer into the ring-fenced
 * PayrollVault. Once tokens leave this vault for payroll they are employee
 * wages: the PayrollVault has no function that returns funds, and this vault
 * has no function that pulls them, so "fund payroll" is irreversible by
 * construction. The board can still spend freely for company purposes via
 * {spendTo}; those outflows can never dip into earned or committed wages.
 */
contract WorkingCapitalVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable board;

    /// @notice The one destination treated as payroll funding (one-way).
    address public immutable payrollVault;

    event Deposited(address indexed from, uint256 amount);
    event Spent(address indexed to, uint256 amount);
    event PayrollFunded(uint256 amount);

    error NotBoard(address caller);
    error ZeroAddress();
    error ZeroAmount();
    error ZeroRecipient();

    modifier onlyBoard() {
        if (msg.sender != board) revert NotBoard(msg.sender);
        _;
    }

    constructor(IERC20 token_, address board_, address payrollVault_) {
        if (address(token_) == address(0) || board_ == address(0) || payrollVault_ == address(0)) {
            revert ZeroAddress();
        }
        token = token_;
        board = board_;
        payrollVault = payrollVault_;
    }

    /// @notice Operating funds in (from company revenue, investors, etc.).
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Liquid working-capital balance.
    function liquidWorkingBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Pay a company expense from working capital. Payroll is untouched.
    function spendTo(address recipient, uint256 amount) external onlyBoard {
        if (recipient == address(0)) revert ZeroRecipient();
        if (amount == 0) revert ZeroAmount();
        token.safeTransfer(recipient, amount);
        emit Spent(recipient, amount);
    }

    /**
     * @notice Explicitly fund the ring-fenced payroll vault. One-way and
     * irreversible: the PayrollVault exposes no withdrawal path back to this
     * contract, the board, or anyone but earning employees.
     */
    function fundPayroll(uint256 amount) external onlyBoard {
        if (amount == 0) revert ZeroAmount();
        token.safeTransfer(payrollVault, amount);
        emit PayrollFunded(amount);
    }
}
