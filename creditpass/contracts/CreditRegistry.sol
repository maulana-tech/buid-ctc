// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoseidonT3} from "./zk/IPoseidonT3.sol";

/// @title CreditRegistry
/// @notice The public credit primitive. Holds one non-transferable credit profile per address,
///         built exclusively from cross-chain events that were cryptographically attested by the
///         Attestcoin Protocol. Any contract on Creditcoin can read a score; only registered
///         reporters (the ASC readers) can write one.
/// @dev    A profile is bound to the address that produced the history on the source chain. It is
///         deliberately non-transferable: the whole point is that a bad history cannot be discarded
///         by moving to a fresh wallet, because a fresh wallet has no history to borrow against.
contract CreditRegistry {
    struct Profile {
        uint32 repayments; // counted repayments on the source chain
        uint32 borrows; // observed borrows (tracked, not scored)
        uint32 liquidations; // times liquidated on the source chain
        uint32 defaults; // defaults on Creditcoin itself
        uint64 firstSeenBlock; // earliest source-chain block observed for this user
        uint64 lastCountedBlock; // source block of the most recent *counted* repayment
        uint32 protocols; // bitmask of protocol ids this user has been seen on
    }

    /// @notice Roughly one day of Ethereum blocks at 12s.
    /// ponytail: flat spam guard — two repayments closer together than this count once.
    /// Stops score farming via many tiny same-day borrow/repay pairs. If farming still shows
    /// up in practice, move to amount-weighted scoring (needs a price source) instead of raising this.
    uint64 public constant MIN_BLOCK_GAP = 7200;

    uint16 public constant BASE_SCORE = 300;
    uint16 public constant MAX_SCORE = 1000;
    uint32 public constant MAX_COUNTED_REPAYMENTS = 20;
    uint16 public constant POINTS_PER_REPAYMENT = 25;
    uint16 public constant PENALTY_LIQUIDATION = 150;
    uint16 public constant PENALTY_DEFAULT = 300;
    uint64 public constant BLOCKS_PER_AGE_STEP = MIN_BLOCK_GAP * 30; // ~30 days
    uint16 public constant POINTS_PER_AGE_STEP = 10;
    uint16 public constant MAX_AGE_BONUS = 100;

    // ------------------------------------------------------------ private credit
    //
    // Every profile is also a leaf in a Poseidon Merkle tree, so a user can prove "my score is at
    // least T" to a verifier without saying which address they are (see circuits/credit_threshold).
    // Leaf = H(H(address, score), commitment) where commitment = H(secret) is set once by the
    // address itself. Defaults on private loans are charged to a nullifier derived from the secret,
    // so they accumulate against the identity without ever linking it back to the address.
    //
    // ponytail: the whole tree lives in storage and every score change rewrites one path (16
    // Poseidon calls, ~450k gas). Fine at hackathon scale; move to LeanIMT with caller-supplied
    // siblings if writes ever need to be cheap.
    uint8 public constant TREE_DEPTH = 16;
    uint8 public constant ROOT_HISTORY = 32;
    uint256 internal constant FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    IPoseidonT3 public immutable POSEIDON;
    uint256[16] internal _zeros;
    mapping(uint8 => mapping(uint256 => uint256)) internal _nodes;
    mapping(address => uint32) internal _leafSlot; // index + 1, so 0 means "no leaf yet"
    uint32 public leafCount;
    uint256 public root;
    uint256[32] internal _roots;
    uint8 internal _rootCursor;
    mapping(address => uint256) public commitmentOf;
    mapping(uint256 => uint32) public nullifierDefaults;

    address public owner;
    mapping(address => bool) public reporters;
    mapping(address => Profile) private _profiles;

    event ReporterSet(address indexed reporter, bool enabled);
    event RepaymentRecorded(address indexed user, uint16 protocolId, uint64 sourceBlock, uint16 newScore);
    event RepaymentSkipped(address indexed user, uint64 sourceBlock, string reason);
    event BorrowRecorded(address indexed user, uint16 protocolId, uint64 sourceBlock);
    event LiquidationRecorded(address indexed user, uint16 protocolId, uint64 sourceBlock, uint16 newScore);
    event DefaultRecorded(address indexed user, uint16 newScore);
    event OwnershipTransferred(address indexed from, address indexed to);
    event CommitmentSet(address indexed user, uint256 commitment);
    event LeafUpdated(address indexed user, uint32 index, uint256 leaf, uint256 root);
    event NullifierDefaultRecorded(uint256 indexed nullifier, uint32 defaults);

    error NotOwner();
    error NotKnown();
    error InvalidFieldElement();
    error TreeFull();
    error NotReporter();
    error ZeroAddress();
    error ProtocolIdTooLarge(uint16 protocolId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReporter() {
        if (!reporters[msg.sender]) revert NotReporter();
        _;
    }

    constructor(IPoseidonT3 poseidon_) {
        if (address(poseidon_) == address(0)) revert ZeroAddress();
        POSEIDON = poseidon_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);

        // Empty-subtree hashes, level by level. An unset storage slot reads as 0, which is exactly
        // the empty leaf, so `_nodes` never has to be initialised.
        uint256 zero = 0;
        for (uint8 level = 0; level < TREE_DEPTH; level++) {
            _zeros[level] = zero;
            zero = POSEIDON.hash([zero, zero]);
        }
        _pushRoot(zero);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    /// @notice Register or revoke an ASC allowed to write profiles.
    function setReporter(address reporter, bool enabled) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    // ---------------------------------------------------------------- writes

    /// @notice Record a repayment proved on the source chain.
    /// @dev Silently skips (rather than reverts) when the spam guard rejects the entry, so a worker
    ///      replaying a user's whole history does not have to pre-filter — one bad entry must not
    ///      abort the batch. The skip is emitted so it stays auditable.
    function recordRepayment(address user, uint16 protocolId, uint64 sourceBlock) external onlyReporter {
        Profile storage p = _profiles[user];
        _touch(p, protocolId, sourceBlock);

        if (p.lastCountedBlock != 0 && sourceBlock <= p.lastCountedBlock + MIN_BLOCK_GAP) {
            // Also covers out-of-order arrivals: an older proof never rewrites newer state.
            emit RepaymentSkipped(user, sourceBlock, "too close to last counted repayment");
            _refreshLeaf(user);
            return;
        }

        p.repayments += 1;
        p.lastCountedBlock = sourceBlock;
        emit RepaymentRecorded(user, protocolId, sourceBlock, scoreOf(user));
        _refreshLeaf(user);
    }

    /// @notice Record a borrow proved on the source chain. Tracked for context; does not move the score.
    function recordBorrow(address user, uint16 protocolId, uint64 sourceBlock) external onlyReporter {
        Profile storage p = _profiles[user];
        _touch(p, protocolId, sourceBlock);
        p.borrows += 1;
        emit BorrowRecorded(user, protocolId, sourceBlock);
        _refreshLeaf(user);
    }

    /// @notice Record a liquidation proved on the source chain.
    /// @dev Never rate-limited. Bad news always counts; only the positive signal is guarded.
    function recordLiquidation(address user, uint16 protocolId, uint64 sourceBlock) external onlyReporter {
        Profile storage p = _profiles[user];
        _touch(p, protocolId, sourceBlock);
        p.liquidations += 1;
        emit LiquidationRecorded(user, protocolId, sourceBlock, scoreOf(user));
        _refreshLeaf(user);
    }

    /// @notice Record a default on a Creditcoin-side credit line.
    function recordDefault(address user) external onlyReporter {
        Profile storage p = _profiles[user];
        p.defaults += 1;
        emit DefaultRecorded(user, scoreOf(user));
        _refreshLeaf(user);
    }

    /// @notice Record a default on a private loan against the borrower's nullifier. The circuit
    ///         subtracts PENALTY_DEFAULT per recorded default before checking the threshold.
    function recordDefaultByNullifier(uint256 nullifier) external onlyReporter {
        uint32 defaults = ++nullifierDefaults[nullifier];
        emit NullifierDefaultRecorded(nullifier, defaults);
    }

    // --------------------------------------------------------- private credit

    /// @notice Bind a ZK commitment H(secret) to the caller's profile. Only the address itself can
    ///         do this, which is what ties the secret to the history without a signature in-circuit.
    function setCommitment(uint256 commitment) external {
        if (!isKnown(msg.sender)) revert NotKnown();
        if (commitment == 0 || commitment >= FIELD_PRIME) revert InvalidFieldElement();
        commitmentOf[msg.sender] = commitment;
        emit CommitmentSet(msg.sender, commitment);
        _refreshLeaf(msg.sender);
    }

    /// @notice True for the current root and the previous ROOT_HISTORY-1, so a proof built a
    ///         moment before someone else's update still verifies.
    function isKnownRoot(uint256 candidate) public view returns (bool) {
        if (candidate == 0) return false;
        for (uint8 i = 0; i < ROOT_HISTORY; i++) {
            if (_roots[i] == candidate) return true;
        }
        return false;
    }

    /// @notice The leaf currently stored for `user`, or 0 if it has none.
    function leafOf(address user) external view returns (uint256) {
        uint32 slot = _leafSlot[user];
        return slot == 0 ? 0 : _nodes[0][slot - 1];
    }

    /// @notice Everything the prover needs: the sibling on each level, the leaf index, and the root
    ///         those siblings hash up to. Read straight from storage, so no client-side tree.
    function merklePath(address user)
        external
        view
        returns (uint256[16] memory siblings, uint32 index, uint256 currentRoot)
    {
        uint32 slot = _leafSlot[user];
        if (slot == 0) revert NotKnown();
        index = slot - 1;
        uint256 idx = index;
        for (uint8 level = 0; level < TREE_DEPTH; level++) {
            uint256 sibling = _nodes[level][idx ^ 1];
            siblings[level] = sibling == 0 ? _zeros[level] : sibling;
            idx >>= 1;
        }
        currentRoot = root;
    }

    function _refreshLeaf(address user) private {
        uint32 slot = _leafSlot[user];
        if (slot == 0) {
            if (leafCount >= uint32(1) << TREE_DEPTH) revert TreeFull();
            slot = ++leafCount;
            _leafSlot[user] = slot;
        }
        uint32 index = slot - 1;

        uint256 leaf = POSEIDON.hash([POSEIDON.hash([uint256(uint160(user)), uint256(scoreOf(user))]), commitmentOf[user]]);

        uint256 idx = index;
        uint256 node = leaf;
        for (uint8 level = 0; level < TREE_DEPTH; level++) {
            _nodes[level][idx] = node;
            uint256 sibling = _nodes[level][idx ^ 1];
            if (sibling == 0) sibling = _zeros[level];
            node = idx & 1 == 0 ? POSEIDON.hash([node, sibling]) : POSEIDON.hash([sibling, node]);
            idx >>= 1;
        }
        _pushRoot(node);
        emit LeafUpdated(user, index, leaf, node);
    }

    function _pushRoot(uint256 newRoot) private {
        root = newRoot;
        _roots[_rootCursor] = newRoot;
        _rootCursor = (_rootCursor + 1) % ROOT_HISTORY;
    }

    function _touch(Profile storage p, uint16 protocolId, uint64 sourceBlock) private {
        if (protocolId >= 32) revert ProtocolIdTooLarge(protocolId);
        if (p.firstSeenBlock == 0 || sourceBlock < p.firstSeenBlock) {
            p.firstSeenBlock = sourceBlock;
        }
        p.protocols |= uint32(1) << protocolId;
    }

    /// @notice How many distinct protocols this address has an attested record on.
    function protocolCount(address user) external view returns (uint8 count) {
        uint32 bits = _profiles[user].protocols;
        while (bits != 0) {
            count += uint8(bits & 1);
            bits >>= 1;
        }
    }

    // ----------------------------------------------------------------- reads

    /// @notice True once any attested source-chain activity has been recorded for `user`.
    /// @dev Callers must check this: an unknown address and a ruined address both score low,
    ///      but they are not the same thing and must not be treated the same.
    function isKnown(address user) public view returns (bool) {
        return _profiles[user].firstSeenBlock != 0;
    }

    function profileOf(address user) external view returns (Profile memory) {
        return _profiles[user];
    }

    /// @notice Credit score in [0, 1000]. Returns 0 for an address with no attested history.
    function scoreOf(address user) public view returns (uint16) {
        Profile memory p = _profiles[user];
        if (p.firstSeenBlock == 0) return 0;

        uint32 counted = p.repayments > MAX_COUNTED_REPAYMENTS ? MAX_COUNTED_REPAYMENTS : p.repayments;
        uint256 positive = uint256(BASE_SCORE) + uint256(counted) * POINTS_PER_REPAYMENT + _ageBonus(p);

        uint256 penalty = uint256(p.liquidations) * PENALTY_LIQUIDATION + uint256(p.defaults) * PENALTY_DEFAULT;
        if (penalty >= positive) return 0;

        uint256 score = positive - penalty;
        return uint16(score > MAX_SCORE ? MAX_SCORE : score);
    }

    function _ageBonus(Profile memory p) private pure returns (uint256) {
        if (p.lastCountedBlock <= p.firstSeenBlock) return 0;
        uint256 bonus = (uint256(p.lastCountedBlock - p.firstSeenBlock) / BLOCKS_PER_AGE_STEP) * POINTS_PER_AGE_STEP;
        return bonus > MAX_AGE_BONUS ? MAX_AGE_BONUS : bonus;
    }
}
