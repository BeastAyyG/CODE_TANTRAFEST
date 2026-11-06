// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./libs/ActionDecoder.sol";
import "./ProposalRegistry.sol";

/**
 * @title IntentLockExecutor
 * @notice The hard-guarantee layer (Layer 1) of AegisDAO IntentLock.
 *
 *         Enforces cryptographic execution commitments: the exact targets,
 *         values, calldata, intent rules, disclosure, version, chain, and
 *         executor address are all bound into a single commitment hash.
 *         Changing any field causes execution to revert.
 *
 *         Design rules:
 *         - Only `call`. No `delegatecall` path exists.
 *         - intentHash == keccak256(abi.encode(rules)) verified before
 *           any rule is trusted.
 *         - nonReentrant on execute.
 *         - Timelock: block.timestamp >= eta required.
 *         - Checks-effects-interactions: state set before external calls.
 *         - Post-conditions: owners and implementations change only as a
 *           rule commits, and treasury outflow stays within the committed
 *           maxAmounts.
 *         - Guardian can only halt. It cannot execute, edit, or rotate the
 *           governor; only a passed, timelocked proposal can.
 *
 * @dev    See Section 4 of the AegisDAO blueprint.
 */
contract IntentLockExecutor is ReentrancyGuard {
    using ActionDecoder for *;

    // ──────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────

    string public constant EIP712_NAME = "AegisIntentLockExecutor";
    string public constant EIP712_VERSION = "1";

    bytes32 private constant _DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant COMMIT_TYPEHASH = keccak256(
        "Commitment(uint256 chainId,address executor,uint256 proposalId,uint256 version,bytes32 versionHash,bytes32 actionsHash,bytes32 intentHash,bytes32 disclosureHash)"
    );

    bytes32 public constant INTENT_HALT_TYPEHASH = keccak256(
        "IntentHalt(bytes32 commitment,bytes32 reportHash,string reason,uint256 nonce,uint256 deadline)"
    );

    // Getters read by the post-conditions. A target without them is skipped.
    bytes4 private constant _OWNER_SELECTOR = 0x8da5cb5b;          // owner()
    bytes4 private constant _PENDING_OWNER_SELECTOR = 0xe30c3978;  // pendingOwner()
    bytes4 private constant _IMPLEMENTATION_SELECTOR = 0x5c60da1b; // implementation()

    /// @dev Gas cap per post-condition read, so a hostile getter cannot
    ///      consume the rest of the transaction.
    uint256 private constant _READ_GAS = 50_000;

    // ──────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────

    struct Action {
        address target;
        uint256 value;
        bytes   data;
    }

    enum ProposalState {
        Empty,          // 0 — not queued
        Queued,         // 1 — waiting for timelock
        Executed,       // 2 — successfully executed
        Halted,         // 3 — cancelled by guardian
        Cancelled       // 4 — cancelled by governor
    }

    struct QueuedProposal {
        bytes32        commitment;
        uint256        proposalId;
        uint256        version;
        bytes32        versionHash;
        bytes32        intentHash;
        bytes32        disclosureHash;
        uint256        eta;            // earliest execution timestamp
        ProposalState  state;
        address        queuedBy;       // governor address that queued it
    }

    /// @dev Control state of one called contract, read before any action runs.
    struct ControlSnapshot {
        address target;
        bool    ownerReadable;
        address owner;
        bool    ownerCommitted;     // an OWNERSHIP_TRANSFER rule names this target
        address committedOwner;
        bool    implReadable;
        address implementation;
        bool    implCommitted;      // an UPGRADE rule names this target
        address committedImpl;
    }

    /// @dev Executor balance of one token named by a transfer or approve rule.
    struct OutflowBudget {
        address token;
        bool    readable;
        uint256 balanceBefore;
        uint256 allowed;            // sum of committed maxAmounts, saturating
    }

    // ──────────────────────────────────────────
    // Storage
    // ──────────────────────────────────────────

    /// @notice commitment => QueuedProposal
    mapping(bytes32 => QueuedProposal) public proposals;

    /// @notice The proposal registry for version verification.
    ProposalRegistry public immutable registry;

    /// @notice Guardian address (multisig or Sentinel key). Can halt, never execute.
    address public guardian;

    /// @notice Governor address. Only the governor can queue proposals.
    address public governor;

    /// @notice Minimum timelock delay in seconds.
    uint256 public immutable minDelay;

    /// @notice Maximum timelock delay in seconds.
    uint256 public immutable maxDelay;

    /// @notice guardian => EIP-712 nonce for signed halts
    mapping(address => uint256) public haltNonces;

    // ──────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────

    event ProposalQueued(
        bytes32 indexed commitment,
        uint256 indexed proposalId,
        uint256 eta
    );

    event ProposalExecuted(
        bytes32 indexed commitment,
        uint256 indexed proposalId
    );

    event ProposalHalted(
        bytes32 indexed commitment,
        uint256 indexed proposalId,
        bytes32 reportHash
    );

    event HaltRelayed(
        bytes32 indexed commitment,
        address indexed guardian,
        address indexed relayer,
        bytes32 reportHash,
        string reason
    );

    event ProposalCancelled(
        bytes32 indexed commitment,
        uint256 indexed proposalId
    );

    event ActionExecuted(
        bytes32 indexed commitment,
        uint256 indexed actionIndex,
        address target,
        bool    success
    );

    event GovernorChanged(
        address indexed previousGovernor,
        address indexed newGovernor
    );

    // ──────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────

    error NotGovernor(address caller);
    error NotGuardian(address caller);
    error AlreadyQueued(bytes32 commitment);
    error NotQueued(bytes32 commitment);
    error TimelockNotExpired(uint256 eta, uint256 currentTime);
    error DelayOutOfRange(uint256 delay, uint256 min, uint256 max);
    error CommitmentMismatch(bytes32 expected, bytes32 actual);
    error IntentHashMismatch(bytes32 expected, bytes32 actual);
    error VersionSuperseded(uint256 proposalId, bytes32 currentLatest, bytes32 votedVersion);
    error ProposalNotInState(ProposalState expected, ProposalState actual);
    error ActionExecutionFailed(uint256 actionIndex, address target, bytes returnData);
    error PostConditionFailed(string check, bytes data);
    error RuleLengthMismatch(uint256 actionsLength, uint256 rulesLength);
    error BadSignature();
    error SignatureExpired(uint256 deadline);
    error NonceUsed(address signer, uint256 nonce);

    // ──────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor(msg.sender);
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian(msg.sender);
        _;
    }

    // ──────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────

    constructor(
        address _registry,
        address _guardian,
        address _governor,
        uint256 _minDelay,
        uint256 _maxDelay
    ) {
        registry = ProposalRegistry(_registry);
        guardian = _guardian;
        governor = _governor;
        minDelay = _minDelay;
        maxDelay = _maxDelay;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                _DOMAIN_TYPEHASH,
                keccak256(bytes("AegisIntentLockExecutor")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ──────────────────────────────────────────
    // Queue (governor only)
    // ──────────────────────────────────────────

    /**
     * @notice Queue a passed proposal for execution after the timelock.
     *         Only callable by the governor after a vote passes.
     */
    function queue(
        uint256 proposalId,
        uint256 version,
        bytes32 versionHash,
        bytes32 actionsHash,
        bytes32 intentHash,
        bytes32 disclosureHash,
        uint256 delay
    ) external onlyGovernor returns (bytes32 commitment) {
        if (delay < minDelay || delay > maxDelay) {
            revert DelayOutOfRange(delay, minDelay, maxDelay);
        }

        commitment = _computeCommitment(
            proposalId, version, versionHash,
            actionsHash, intentHash, disclosureHash
        );

        if (proposals[commitment].state != ProposalState.Empty) {
            revert AlreadyQueued(commitment);
        }

        uint256 eta = block.timestamp + delay;

        proposals[commitment] = QueuedProposal({
            commitment: commitment,
            proposalId: proposalId,
            version: version,
            versionHash: versionHash,
            intentHash: intentHash,
            disclosureHash: disclosureHash,
            eta: eta,
            state: ProposalState.Queued,
            queuedBy: msg.sender
        });

        emit ProposalQueued(commitment, proposalId, eta);
    }

    // ──────────────────────────────────────────
    // Execute (anyone, after timelock)
    // ──────────────────────────────────────────

    /**
     * @notice Execute a queued proposal.
     *
     *         Enforcement:
     *         1. State must be Queued.
     *         2. Timelock must have expired (block.timestamp >= eta).
     *         3. Recomputed commitment must match.
     *         4. Voted version must still be the latest (not superseded).
     *         5. intentHash == keccak256(abi.encode(rules)).
     *         6. Each action enforced against its rule via ActionDecoder.
     *         7. Post-condition checks after all actions.
     *         8. nonReentrant.
     *
     * @param actions  The exact actions to execute.
     * @param rules    The committed rules (verified against intentHash).
     */
    function execute(
        uint256 proposalId,
        uint256 version,
        bytes32 versionHash,
        bytes32 disclosureHash,
        Action[] calldata actions,
        ActionDecoder.ActionRule[] calldata rules
    ) external nonReentrant {
        // ── 1. Recompute commitment ──
        bytes32 actionsHash = _hashActions(actions);
        bytes32 intentHash = ActionDecoder.hashRules(rules);

        bytes32 commitment = _computeCommitment(
            proposalId, version, versionHash,
            actionsHash, intentHash, disclosureHash
        );

        // ── 2. Verify state ──
        QueuedProposal storage prop = proposals[commitment];
        if (prop.state != ProposalState.Queued) {
            revert ProposalNotInState(ProposalState.Queued, prop.state);
        }

        // ── 3. Timelock ──
        if (block.timestamp < prop.eta) {
            revert TimelockNotExpired(prop.eta, block.timestamp);
        }

        // ── 4. Version supersession check ──
        bytes32 currentLatest = registry.latestVersionHash(proposalId);
        if (currentLatest != versionHash) {
            revert VersionSuperseded(proposalId, currentLatest, versionHash);
        }

        // ── 5. Intent hash verification ──
        //    Already verified by recomputing commitment above.
        //    The commitment includes intentHash, and we recomputed
        //    intentHash = keccak256(abi.encode(rules)).
        //    If the rules differ, commitment won't match.

        // ── 6. Rule count sanity ──
        //    Count top-level rules (exclude child rules of multicalls)
        uint256 topLevelRules = _countTopLevelRules(rules);
        if (actions.length != topLevelRules) {
            revert RuleLengthMismatch(actions.length, topLevelRules);
        }

        // ── EFFECTS BEFORE INTERACTIONS ──
        prop.state = ProposalState.Executed;

        // Read-only snapshot the post-conditions compare against.
        (ControlSnapshot[] memory controls, OutflowBudget[] memory budgets) =
            _snapshotPostState(actions, rules);

        // ── 7. Execute and enforce each action ──
        uint256 ruleIdx = 0;
        for (uint256 i; i < actions.length; ++i) {
            // Enforce rule
            uint256 nextIdx = ActionDecoder.enforce(
                actions[i].target,
                actions[i].data,
                rules[ruleIdx],
                0,           // depth = 0 (top level)
                rules,
                ruleIdx + 1  // child offset starts after this rule
            );

            // Execute via call (NEVER delegatecall)
            (bool success, bytes memory returnData) = actions[i].target.call{
                value: actions[i].value
            }(actions[i].data);

            if (!success) {
                revert ActionExecutionFailed(i, actions[i].target, returnData);
            }

            emit ActionExecuted(commitment, i, actions[i].target, success);

            // Advance rule index past this rule and its children
            ruleIdx = nextIdx;
            if (rules[ruleIdx - 1].kind == ActionDecoder.ActionKind.MULTICALL) {
                // nextIdx already accounts for children
            }
            // For non-multicall, nextIdx == ruleIdx (no change needed)
            // The enforce function returns the next unused index
        }

        // ── 8. Post-condition checks ──
        _postConditionChecks(actions, rules, controls, budgets);

        emit ProposalExecuted(commitment, proposalId);
    }

    // ──────────────────────────────────────────
    // Guardian — halt only, never execute
    // ──────────────────────────────────────────

    /**
     * @notice Guardian halts a queued proposal during the timelock.
     *         Guardian CANNOT execute, edit, or substitute anything.
     *         Halts are logged on-chain with a violation report hash
     *         and can be challenged or overridden by a DAO vote.
     *
     * @param commitment The commitment hash of the proposal to halt.
     * @param reportHash Hash of the violation report (off-chain evidence).
     */
    function halt(
        bytes32 commitment,
        bytes32 reportHash
    ) external onlyGuardian {
        QueuedProposal storage prop = proposals[commitment];
        if (prop.state != ProposalState.Queued) {
            revert ProposalNotInState(ProposalState.Queued, prop.state);
        }

        prop.state = ProposalState.Halted;

        emit ProposalHalted(commitment, prop.proposalId, reportHash);
    }

    /**
     * @notice Guardian halts a queued proposal with an EIP-712 signature.
     *         A relayer submits the transaction; the guardian key never leaves
     *         the signing device. Halt only: this function cannot execute,
     *         edit, or substitute an action.
     */
    function haltBySig(
        bytes32 commitment,
        bytes32 reportHash,
        string calldata reason,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) {
            revert SignatureExpired(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(
                INTENT_HALT_TYPEHASH,
                commitment,
                reportHash,
                keccak256(bytes(reason)),
                nonce,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        (address signer, ECDSA.RecoverError err, bytes32 errArg) =
            ECDSA.tryRecoverCalldata(digest, signature);
        errArg; // unused; the signature error code is sufficient

        if (err != ECDSA.RecoverError.NoError || signer == address(0)) {
            revert BadSignature();
        }
        if (signer != guardian) {
            revert NotGuardian(signer);
        }
        if (nonce != haltNonces[signer]) {
            revert NonceUsed(signer, nonce);
        }

        QueuedProposal storage prop = proposals[commitment];
        if (prop.state != ProposalState.Queued) {
            revert ProposalNotInState(ProposalState.Queued, prop.state);
        }

        haltNonces[signer] = nonce + 1;
        prop.state = ProposalState.Halted;

        emit ProposalHalted(commitment, prop.proposalId, reportHash);
        emit HaltRelayed(commitment, signer, msg.sender, reportHash, reason);
    }

    /**
     * @notice Governor can cancel a queued proposal (e.g., after a halt
     *         is challenged and the DAO votes to cancel).
     */
    function cancel(bytes32 commitment) external onlyGovernor {
        QueuedProposal storage prop = proposals[commitment];
        if (prop.state != ProposalState.Queued && prop.state != ProposalState.Halted) {
            revert ProposalNotInState(ProposalState.Queued, prop.state);
        }

        prop.state = ProposalState.Cancelled;

        emit ProposalCancelled(commitment, prop.proposalId);
    }

    /**
     * @notice Rotate the governor. Callable by the current governor or by the
     *         executor itself, so once IntentGovernor is installed a rotation
     *         must be a passed, timelocked proposal. The guardian cannot.
     */
    function setGovernor(address newGovernor) external {
        if (msg.sender != governor && msg.sender != address(this)) {
            revert NotGovernor(msg.sender);
        }
        emit GovernorChanged(governor, newGovernor);
        governor = newGovernor;
    }

    // ──────────────────────────────────────────
    // Views
    // ──────────────────────────────────────────

    function getProposal(bytes32 commitment) external view returns (QueuedProposal memory) {
        return proposals[commitment];
    }

    function getState(bytes32 commitment) external view returns (ProposalState) {
        return proposals[commitment].state;
    }

    // ──────────────────────────────────────────
    // Internal — commitment computation
    // ──────────────────────────────────────────

    function _computeCommitment(
        uint256 proposalId,
        uint256 version,
        bytes32 versionHash,
        bytes32 actionsHash,
        bytes32 intentHash,
        bytes32 disclosureHash
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                COMMIT_TYPEHASH,
                block.chainid,
                address(this),
                proposalId,
                version,
                versionHash,
                actionsHash,
                intentHash,
                disclosureHash
            )
        );
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function _hashActions(Action[] calldata actions) internal pure returns (bytes32) {
        bytes32[] memory leaves = new bytes32[](actions.length);
        for (uint256 i; i < actions.length; ++i) {
            leaves[i] = keccak256(
                abi.encode(
                    actions[i].target,
                    actions[i].value,
                    keccak256(actions[i].data)
                )
            );
        }
        return keccak256(abi.encodePacked(leaves));
    }

    // ──────────────────────────────────────────
    // Internal — count top-level rules
    // ──────────────────────────────────────────

    /**
     * @dev Count top-level rules, skipping child rules of MULTICALL actions.
     */
    function _countTopLevelRules(
        ActionDecoder.ActionRule[] calldata rules
    ) internal pure returns (uint256 count) {
        uint256 i = 0;
        while (i < rules.length) {
            count++;
            if (rules[i].kind == ActionDecoder.ActionKind.MULTICALL) {
                i += 1 + rules[i].childCount; // skip parent + children
            } else {
                i += 1;
            }
        }
    }

    // ──────────────────────────────────────────
    // Internal — post-condition checks
    // ──────────────────────────────────────────

    /**
     * @dev Read what the post-conditions compare against, before any action
     *      runs. Never reverts: unreadable getters are skipped and malformed
     *      rule sets are left for ActionDecoder to reject with its own error.
     *
     *      Multicall children run on the multicall target itself, so their
     *      ownership and upgrade rules apply to that target. Child transfers
     *      move the multicall contract's funds, not the executor's, so only
     *      top-level transfer and approve rules feed the outflow budget.
     */
    function _snapshotPostState(
        Action[] calldata actions,
        ActionDecoder.ActionRule[] calldata rules
    ) internal view returns (ControlSnapshot[] memory controls, OutflowBudget[] memory budgets) {
        controls = new ControlSnapshot[](actions.length);
        budgets = new OutflowBudget[](actions.length);

        uint256 ruleIdx;
        for (uint256 i; i < actions.length && ruleIdx < rules.length; ++i) {
            ActionDecoder.ActionRule calldata rule = rules[ruleIdx];
            uint256 span = rule.kind == ActionDecoder.ActionKind.MULTICALL
                ? 1 + uint256(rule.childCount)
                : 1;
            address target = actions[i].target;

            // address(0) marks an unused slot, so it is never recorded.
            if (target != address(0)) {
                ControlSnapshot memory control = controls[_controlSlot(controls, target)];
                if (control.target == address(0)) {
                    control.target = target;
                    (control.ownerReadable, control.owner) = _readAddress(target, _OWNER_SELECTOR);
                    (control.implReadable, control.implementation) =
                        _readAddress(target, _IMPLEMENTATION_SELECTOR);
                }
                for (uint256 k; k < span && ruleIdx + k < rules.length; ++k) {
                    _commitControl(control, rules[ruleIdx + k]);
                }
            }

            if (
                (rule.kind == ActionDecoder.ActionKind.ERC20_TRANSFER ||
                    rule.kind == ActionDecoder.ActionKind.ERC20_APPROVE) &&
                rule.target != address(0)
            ) {
                OutflowBudget memory budget = budgets[_budgetSlot(budgets, rule.target)];
                if (budget.token == address(0)) {
                    budget.token = rule.target;
                    (budget.readable, budget.balanceBefore) = _readBalance(rule.target);
                }
                budget.allowed = _saturatingAdd(budget.allowed, rule.maxAmount);
            }

            ruleIdx += span;
        }
    }

    /**
     * @dev Post-condition checks run after all actions execute. Any failure
     *      reverts the whole transaction.
     *
     *      - ERC-20 allowance does not exceed the committed ceiling.
     *      - owner() and implementation() of every called contract are
     *        unchanged, or equal what an OWNERSHIP_TRANSFER / UPGRADE rule
     *        committed (pendingOwner() is accepted for two-step ownership).
     *      - The executor's outflow of each token named by a transfer or
     *        approve rule is at most the sum of those rules' maxAmounts.
     *
     *      Owner and implementation are checked where the target exposes the
     *      getter; tokens no rule names are not tracked here.
     */
    function _postConditionChecks(
        Action[] calldata actions,
        ActionDecoder.ActionRule[] calldata rules,
        ControlSnapshot[] memory controls,
        OutflowBudget[] memory budgets
    ) internal view {
        uint256 ruleIdx = 0;
        for (uint256 i; i < actions.length; ++i) {
            ActionDecoder.ActionRule calldata rule = rules[ruleIdx];

            if (rule.kind == ActionDecoder.ActionKind.ERC20_APPROVE) {
                // Check allowance hasn't exceeded the committed ceiling
                // The spender is rule.counterparty, token is rule.target
                uint256 allowance = IERC20(rule.target).allowance(
                    address(this),
                    rule.counterparty
                );
                if (allowance > rule.maxAmount) {
                    revert PostConditionFailed(
                        "allowance exceeds committed ceiling",
                        abi.encode(rule.target, rule.counterparty, allowance, rule.maxAmount)
                    );
                }
            }

            // Advance past multicall children
            if (rule.kind == ActionDecoder.ActionKind.MULTICALL) {
                ruleIdx += 1 + rule.childCount;
            } else {
                ruleIdx += 1;
            }
        }

        for (uint256 i; i < controls.length; ++i) {
            if (controls[i].target == address(0)) continue;
            _checkOwner(controls[i]);
            _checkImplementation(controls[i]);
        }

        for (uint256 i; i < budgets.length; ++i) {
            OutflowBudget memory budget = budgets[i];
            if (budget.token == address(0) || !budget.readable) continue;

            (bool readable, uint256 balanceAfter) = _readBalance(budget.token);
            if (!readable) {
                revert PostConditionFailed(
                    "treasury balance unreadable after execution",
                    abi.encode(budget.token)
                );
            }
            if (balanceAfter >= budget.balanceBefore) continue;

            uint256 outflow = budget.balanceBefore - balanceAfter;
            if (outflow > budget.allowed) {
                revert PostConditionFailed(
                    "treasury outflow exceeds committed budget",
                    abi.encode(budget.token, outflow, budget.allowed)
                );
            }
        }
    }

    function _checkOwner(ControlSnapshot memory control) private view {
        (bool readable, address ownerAfter) = _readAddress(control.target, _OWNER_SELECTOR);
        if (!readable) return;

        if (control.ownerCommitted) {
            if (ownerAfter == control.committedOwner) return;
            (bool pendingReadable, address pending) =
                _readAddress(control.target, _PENDING_OWNER_SELECTOR);
            if (pendingReadable && pending == control.committedOwner) return;
            revert PostConditionFailed(
                "owner is not the committed owner",
                abi.encode(control.target, control.committedOwner, ownerAfter)
            );
        }

        if (control.ownerReadable && ownerAfter != control.owner) {
            revert PostConditionFailed(
                "owner changed without a committed rule",
                abi.encode(control.target, control.owner, ownerAfter)
            );
        }
    }

    function _checkImplementation(ControlSnapshot memory control) private view {
        (bool readable, address implAfter) =
            _readAddress(control.target, _IMPLEMENTATION_SELECTOR);
        if (!readable) return;

        if (control.implCommitted) {
            if (implAfter != control.committedImpl) {
                revert PostConditionFailed(
                    "implementation is not the committed implementation",
                    abi.encode(control.target, control.committedImpl, implAfter)
                );
            }
            return;
        }

        if (control.implReadable && implAfter != control.implementation) {
            revert PostConditionFailed(
                "implementation changed without a committed rule",
                abi.encode(control.target, control.implementation, implAfter)
            );
        }
    }

    function _commitControl(
        ControlSnapshot memory control,
        ActionDecoder.ActionRule calldata rule
    ) private pure {
        if (rule.kind == ActionDecoder.ActionKind.OWNERSHIP_TRANSFER) {
            control.ownerCommitted = true;
            control.committedOwner = rule.counterparty;
        } else if (rule.kind == ActionDecoder.ActionKind.UPGRADE) {
            control.implCommitted = true;
            control.committedImpl = rule.counterparty;
        }
    }

    /// @dev Index of `target`, or of the first unused slot. Arrays are sized
    ///      to the action count, so a slot always exists.
    function _controlSlot(
        ControlSnapshot[] memory controls,
        address target
    ) private pure returns (uint256 i) {
        for (; i < controls.length; ++i) {
            if (controls[i].target == target || controls[i].target == address(0)) return i;
        }
    }

    function _budgetSlot(
        OutflowBudget[] memory budgets,
        address token
    ) private pure returns (uint256 i) {
        for (; i < budgets.length; ++i) {
            if (budgets[i].token == token || budgets[i].token == address(0)) return i;
        }
    }

    function _readAddress(address target, bytes4 selector) private view returns (bool, address) {
        (bool ok, uint256 word) = _readWord(target, abi.encodeWithSelector(selector));
        if (!ok || word > type(uint160).max) return (false, address(0));
        return (true, address(uint160(word)));
    }

    function _readBalance(address token) private view returns (bool, uint256) {
        return _readWord(token, abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
    }

    function _readWord(address target, bytes memory callData) private view returns (bool, uint256) {
        if (target.code.length == 0) return (false, 0);
        (bool success, bytes memory ret) = target.staticcall{gas: _READ_GAS}(callData);
        if (!success || ret.length < 32) return (false, 0);
        return (true, abi.decode(ret, (uint256)));
    }

    function _saturatingAdd(uint256 a, uint256 b) private pure returns (uint256) {
        unchecked {
            uint256 c = a + b;
            return c < a ? type(uint256).max : c;
        }
    }

    // ──────────────────────────────────────────
    // Receive ETH (for proposals that need treasury)
    // ──────────────────────────────────────────

    receive() external payable {}
}
