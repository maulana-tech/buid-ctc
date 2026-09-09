// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {CreditRegistry} from "./CreditRegistry.sol";
import {IHonkVerifier} from "./zk/IHonkVerifier.sol";

/// @title CreditLine
/// @notice An ERC4626 vault that lends without collateral. Depositors supply the asset and earn the
///         interest borrowers pay; borrowers draw against a credit score built from attested
///         cross-chain history. There is no collateral anywhere in this contract — the borrower's
///         exposure is a score bound to an address whose history they cannot recreate.
/// @dev    ERC4626 is used rather than hand-rolled shares because share maths is exactly where this
///         kind of contract goes wrong, and OpenZeppelin has already got the rounding right.
contract CreditLine is ERC4626 {
    using SafeERC20 for IERC20;
    using Math for uint256;

    struct Loan {
        uint128 principal;
        uint128 repaid;
        uint64 startBlock;
        uint64 dueBlock;
        bool active;
    }

    /// @dev Creditcoin targets ~15s blocks.
    uint64 public constant BLOCKS_PER_YEAR = 2_102_400;
    uint64 public constant TERM_BLOCKS = BLOCKS_PER_YEAR / 12; // ~30 days
    uint256 public constant BORROW_APR_BPS = 1000; // 10% simple, accrued per block
    uint16 public constant MIN_SCORE = 500;

    CreditRegistry public immutable REGISTRY;
    /// @notice UltraHonk verifier for circuits/credit_threshold — the private borrow path.
    IHonkVerifier public immutable VERIFIER;

    address public admin;

    /// @notice Base unit of a credit limit, in asset decimals. Admin-tunable.
    /// @dev Deliberately a knob: the right limit depends on the asset's decimals, its price, and
    ///      how much real loss the operator will accept while the score model is still being
    ///      calibrated against live repayment behaviour.
    uint256 public limitUnit;

    /// @notice Principal currently lent out. Counted as an asset of the vault at face value.
    /// @dev ponytail: accrued-but-unpaid interest is deliberately excluded from totalAssets, so the
    ///      share price steps up when a loan is repaid rather than drifting up continuously. It
    ///      never overstates the vault, but it does mean a depositor who joins just before a large
    ///      repayment captures interest they did not fund. Move to a per-block index if that
    ///      becomes worth defending against.
    uint256 public totalPrincipal;

    mapping(address => Loan) public loans;

    /// @notice For a loan drawn with a ZK proof: the nullifier it is charged to. 0 for public loans.
    mapping(address => uint256) public privateNullifier;
    /// @notice One open loan per identity, whichever wallet drew it.
    mapping(uint256 => bool) public nullifierHasLoan;

    event LimitUnitSet(uint256 limitUnit);
    event Borrowed(address indexed borrower, uint256 amount, uint16 score, uint64 dueBlock);
    event Repaid(address indexed borrower, uint256 amount, bool closed);
    event Defaulted(address indexed borrower, uint256 shortfall);
    event BorrowedPrivately(address indexed borrower, uint256 indexed nullifier, uint16 threshold, uint256 amount);
    event AdminTransferred(address indexed from, address indexed to);

    error NotAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error NoCreditHistory();
    error ScoreTooLow(uint16 score, uint16 required);
    error LoanAlreadyOpen();
    error NoActiveLoan();
    error ExceedsCreditLimit(uint256 requested, uint256 limit);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error NotYetDue(uint64 nowBlock, uint64 dueBlock);
    error LoanFullyRepaid();
    error UnknownRoot(uint256 root);
    error NullifierBusy(uint256 nullifier);
    error InvalidProof();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(IERC20 asset_, CreditRegistry registry_, IHonkVerifier verifier_, uint256 limitUnit_)
        ERC20("CreditPass Vault Share", "cpUSD")
        ERC4626(asset_)
    {
        if (address(registry_) == address(0) || address(verifier_) == address(0)) revert ZeroAddress();
        REGISTRY = registry_;
        VERIFIER = verifier_;
        limitUnit = limitUnit_;
        admin = msg.sender;
        emit AdminTransferred(address(0), msg.sender);
        emit LimitUnitSet(limitUnit_);
    }

    function transferAdmin(address to) external onlyAdmin {
        if (to == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, to);
        admin = to;
    }

    function setLimitUnit(uint256 newLimitUnit) external onlyAdmin {
        limitUnit = newLimitUnit;
        emit LimitUnitSet(newLimitUnit);
    }

    // ---------------------------------------------------------- vault accounting

    /// @notice Idle cash plus principal out on loan. A default writes principal off, so depositors
    ///         carry the credit risk — which is the honest arrangement when there is no collateral.
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalPrincipal;
    }

    /// @notice Cash available to be borrowed or withdrawn right now.
    function availableLiquidity() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Share of supplied assets currently lent out, in basis points.
    function utilisationBps() public view returns (uint256) {
        uint256 assets = totalAssets();
        return assets == 0 ? 0 : (totalPrincipal * 10_000) / assets;
    }

    /// @notice What a depositor earns, in basis points: the borrow rate scaled by utilisation.
    ///         Idle cash earns nothing, so an empty vault pays nothing.
    function supplyAprBps() external view returns (uint256) {
        return (BORROW_APR_BPS * utilisationBps()) / 10_000;
    }

    /// @dev Lent-out principal cannot be withdrawn. Capping here turns a confusing balance revert
    ///      into an honest limit the UI can show.
    function maxWithdraw(address shareOwner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(shareOwner), availableLiquidity());
    }

    function maxRedeem(address shareOwner) public view override returns (uint256) {
        uint256 cashShares = _convertToShares(availableLiquidity(), Math.Rounding.Floor);
        return Math.min(super.maxRedeem(shareOwner), cashShares);
    }

    // ------------------------------------------------------------------- reads

    /// @notice How much `user` may borrow, derived purely from attested history.
    function creditLimit(address user) public view returns (uint256) {
        if (!REGISTRY.isKnown(user)) return 0;
        return limitForScore(REGISTRY.scoreOf(user));
    }

    /// @notice The tier table. Public so a private borrower can see what a threshold is worth.
    function limitForScore(uint16 score) public view returns (uint256) {
        if (score < MIN_SCORE) return 0;
        if (score < 600) return limitUnit;
        if (score < 700) return limitUnit * 2;
        if (score < 800) return limitUnit * 5;
        return limitUnit * 10;
    }

    /// @notice Principal plus simple interest accrued to the current block.
    function amountOwed(address borrower) public view returns (uint256) {
        Loan memory loan = loans[borrower];
        if (!loan.active) return 0;
        uint256 elapsed = block.number - loan.startBlock;
        uint256 interest = (uint256(loan.principal) * BORROW_APR_BPS * elapsed) / (uint256(BLOCKS_PER_YEAR) * 10_000);
        uint256 total = uint256(loan.principal) + interest;
        return total > loan.repaid ? total - loan.repaid : 0;
    }

    // ----------------------------------------------------------------- borrowing

    function borrow(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (loans[msg.sender].active) revert LoanAlreadyOpen();

        if (!REGISTRY.isKnown(msg.sender)) revert NoCreditHistory();
        uint16 score = REGISTRY.scoreOf(msg.sender);
        if (score < MIN_SCORE) revert ScoreTooLow(score, MIN_SCORE);

        uint256 limit = creditLimit(msg.sender);
        if (amount > limit) revert ExceedsCreditLimit(amount, limit);

        uint256 liquidity = availableLiquidity();
        if (amount > liquidity) revert InsufficientLiquidity(amount, liquidity);

        uint64 dueBlock = uint64(block.number) + TERM_BLOCKS;
        loans[msg.sender] = Loan({
            principal: uint128(amount),
            repaid: 0,
            startBlock: uint64(block.number),
            dueBlock: dueBlock,
            active: true
        });
        totalPrincipal += amount;

        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, score, dueBlock);
    }

    /// @notice Borrow from any wallet by proving, in zero knowledge, that some registry profile
    ///         scores at least `threshold` after the defaults already charged to `nullifier`.
    /// @dev    The public inputs are exactly the circuit's: root, threshold, nullifier defaults,
    ///         nullifier. The contract supplies the defaults count itself so the prover cannot
    ///         understate it, and accepts any recent root so a proof is not invalidated by an
    ///         unrelated update that landed in the meantime. The limit is the tier the threshold
    ///         falls in — prove a lower band than you hold and you borrow less, which is the point
    ///         of selective disclosure.
    function borrowPrivate(uint256 amount, uint16 threshold, uint256 root, uint256 nullifier, bytes calldata proof) external {
        if (amount == 0) revert ZeroAmount();
        if (loans[msg.sender].active) revert LoanAlreadyOpen();
        if (nullifierHasLoan[nullifier]) revert NullifierBusy(nullifier);
        if (threshold < MIN_SCORE) revert ScoreTooLow(threshold, MIN_SCORE);
        if (!REGISTRY.isKnownRoot(root)) revert UnknownRoot(root);

        uint32 defaults = REGISTRY.nullifierDefaults(nullifier);
        if (defaults > type(uint8).max) revert ScoreTooLow(0, threshold);

        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(root);
        inputs[1] = bytes32(uint256(threshold));
        inputs[2] = bytes32(uint256(defaults));
        inputs[3] = bytes32(nullifier);
        // The Honk verifier reverts with its own errors on a malformed or mismatched proof rather
        // than returning false; either way the answer here is the same.
        try VERIFIER.verify(proof, inputs) returns (bool ok) {
            if (!ok) revert InvalidProof();
        } catch {
            revert InvalidProof();
        }

        uint256 limit = limitForScore(threshold);
        if (amount > limit) revert ExceedsCreditLimit(amount, limit);

        uint256 liquidity = availableLiquidity();
        if (amount > liquidity) revert InsufficientLiquidity(amount, liquidity);

        uint64 dueBlock = uint64(block.number) + TERM_BLOCKS;
        loans[msg.sender] = Loan({
            principal: uint128(amount),
            repaid: 0,
            startBlock: uint64(block.number),
            dueBlock: dueBlock,
            active: true
        });
        privateNullifier[msg.sender] = nullifier;
        nullifierHasLoan[nullifier] = true;
        totalPrincipal += amount;

        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount, threshold, dueBlock);
        emit BorrowedPrivately(msg.sender, nullifier, threshold, amount);
    }

    function repay(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Loan storage loan = loans[msg.sender];
        if (!loan.active) revert NoActiveLoan();

        uint256 owed = amountOwed(msg.sender);
        if (owed == 0) revert LoanFullyRepaid();

        // Never take more than is owed — an overpayment would otherwise be unrecoverable.
        uint256 pay = amount > owed ? owed : amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), pay);

        loan.repaid += uint128(pay);
        bool closed = pay == owed;
        if (closed) {
            totalPrincipal -= loan.principal;
            loan.active = false;
            _releaseNullifier(msg.sender);
        }
        emit Repaid(msg.sender, pay, closed);
    }

    /// @notice Close an overdue loan and report the default to the registry.
    /// @dev Permissionless on purpose: the score is a public good, so anyone may push the bad news
    ///      on-chain. The `dueBlock` check is what keeps that from being abusable.
    function markDefault(address borrower) external {
        Loan storage loan = loans[borrower];
        if (!loan.active) revert NoActiveLoan();
        if (block.number < loan.dueBlock) revert NotYetDue(uint64(block.number), loan.dueBlock);

        uint256 shortfall = amountOwed(borrower);
        totalPrincipal -= loan.principal;
        loan.active = false;

        uint256 nullifier = privateNullifier[borrower];
        if (nullifier != 0) {
            // The wallet is a throwaway; the identity behind the proof is what carries the mark.
            REGISTRY.recordDefaultByNullifier(nullifier);
            _releaseNullifier(borrower);
        } else {
            REGISTRY.recordDefault(borrower);
        }
        emit Defaulted(borrower, shortfall);
    }

    function _releaseNullifier(address borrower) private {
        uint256 nullifier = privateNullifier[borrower];
        if (nullifier == 0) return;
        nullifierHasLoan[nullifier] = false;
        privateNullifier[borrower] = 0;
    }
}
