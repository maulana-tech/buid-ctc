// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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

    error NotOwner();
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

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
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
            return;
        }

        p.repayments += 1;
        p.lastCountedBlock = sourceBlock;
        emit RepaymentRecorded(user, protocolId, sourceBlock, scoreOf(user));
    }

    /// @notice Record a borrow proved on the source chain. Tracked for context; does not move the score.
    function recordBorrow(address user, uint16 protocolId, uint64 sourceBlock) external onlyReporter {
        Profile storage p = _profiles[user];
        _touch(p, protocolId, sourceBlock);
        p.borrows += 1;
        emit BorrowRecorded(user, protocolId, sourceBlock);
    }

    /// @notice Record a liquidation proved on the source chain.
    /// @dev Never rate-limited. Bad news always counts; only the positive signal is guarded.
    function recordLiquidation(address user, uint16 protocolId, uint64 sourceBlock) external onlyReporter {
        Profile storage p = _profiles[user];
        _touch(p, protocolId, sourceBlock);
        p.liquidations += 1;
        emit LiquidationRecorded(user, protocolId, sourceBlock, scoreOf(user));
    }

    /// @notice Record a default on a Creditcoin-side credit line.
    function recordDefault(address user) external onlyReporter {
        Profile storage p = _profiles[user];
        p.defaults += 1;
        emit DefaultRecorded(user, scoreOf(user));
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
