// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

import {CreditRegistry} from "../contracts/CreditRegistry.sol";
import {Zk} from "./harness/Zk.sol";
import {CreditLine} from "../contracts/CreditLine.sol";
import {LendingHistoryASC} from "../contracts/LendingHistoryASC.sol";
import {LendingHistoryASCHarness} from "./harness/LendingHistoryASCHarness.sol";
import {MockERC20} from "./MockERC20.sol";

contract CreditPassTest is Test {
    CreditRegistry internal registry;
    LendingHistoryASCHarness internal asc;
    CreditLine internal line;
    MockERC20 internal token;

    // Verified against live mainnet logs by `npm run check:sigs`.
    address internal constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address internal constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant FAKE_POOL = address(0xBAD);
    uint64 internal constant CHAIN_KEY = 3; // Ethereum mainnet as seen from Creditcoin testnet

    uint16 internal constant AAVE = 0;
    uint16 internal constant MORPHO_ID = 2;

    bytes32 internal constant AAVE_REPAY_SIG = keccak256("Repay(address,address,address,uint256,bool)");
    bytes32 internal constant MORPHO_REPAY_SIG = keccak256("Repay(bytes32,address,address,uint256,uint256)");

    address internal alice = address(0xA11CE);
    address internal lender = address(0x1E4DE2);
    address internal bob = address(0xB0B);
    address internal reporter = address(this);

    uint64 internal constant GAP = 7200;
    uint256 internal constant LIMIT_UNIT = 100e6; // 100 mUSD
    uint256 internal constant SEED = 500_000e6;

    function setUp() public {
        registry = new CreditRegistry(Zk.deployPoseidon());
        asc = new LendingHistoryASCHarness(registry);

        asc.registerSource(AAVE, "Aave V3", AAVE_POOL, CHAIN_KEY);
        asc.setEventSpec(AAVE, LendingHistoryASC.Action.Repay, AAVE_REPAY_SIG, 2);
        asc.registerSource(MORPHO_ID, "Morpho Blue", MORPHO, CHAIN_KEY);
        asc.setEventSpec(MORPHO_ID, LendingHistoryASC.Action.Repay, MORPHO_REPAY_SIG, 3);

        token = new MockERC20();
        line = new CreditLine(token, registry, Zk.deployVerifier(), LIMIT_UNIT);

        registry.setReporter(reporter, true);
        registry.setReporter(address(line), true);

        token.mint(lender, SEED);
        vm.startPrank(lender);
        token.approve(address(line), type(uint256).max);
        line.deposit(SEED, lender);
        vm.stopPrank();
    }

    // ------------------------------------------------------- registry: scoring

    function test_unknownAddressScoresZeroAndIsNotKnown() public view {
        assertFalse(registry.isKnown(alice));
        assertEq(registry.scoreOf(alice), 0);
    }

    function test_repaymentsRaiseScore() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        assertTrue(registry.isKnown(alice));
        assertEq(registry.scoreOf(alice), 325); // 300 base + 25, no age span yet
    }

    /// The spam guard is the whole defence against farming a score with same-day micro-loans.
    function test_sameDayRepaymentsCountOnce() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        registry.recordRepayment(alice, AAVE, 1_000_000 + 10);
        registry.recordRepayment(alice, AAVE, 1_000_000 + GAP); // exactly at the gap: still too close
        assertEq(registry.profileOf(alice).repayments, 1);

        registry.recordRepayment(alice, AAVE, 1_000_000 + GAP + 1);
        assertEq(registry.profileOf(alice).repayments, 2);
    }

    function test_outOfOrderProofNeverRewritesNewerState() public {
        registry.recordRepayment(alice, AAVE, 2_000_000);
        registry.recordRepayment(alice, AAVE, 1_000_000);
        assertEq(registry.profileOf(alice).repayments, 1);
        assertEq(registry.profileOf(alice).firstSeenBlock, 1_000_000); // window still widens
    }

    function test_repaymentsAreCappedAndAgeBonusApplies() public {
        _buildHistory(alice, 25);
        assertEq(registry.profileOf(alice).repayments, 25);
        assertEq(registry.scoreOf(alice), 800); // 300 + 500 capped, no full 30-day step yet
    }

    function test_liquidationsCutScoreAndAreNeverRateLimited() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        registry.recordLiquidation(alice, AAVE, 1_000_001);
        registry.recordLiquidation(alice, AAVE, 1_000_002); // same day, both still count
        assertEq(registry.profileOf(alice).liquidations, 2);
        assertEq(registry.scoreOf(alice), 25);
    }

    function test_scoreFloorsAtZeroInsteadOfUnderflowing() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        registry.recordLiquidation(alice, AAVE, 1_000_001);
        registry.recordLiquidation(alice, AAVE, 1_000_002);
        registry.recordLiquidation(alice, AAVE, 1_000_003);
        assertEq(registry.scoreOf(alice), 0);
    }

    function test_onlyReportersCanWrite() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(CreditRegistry.NotReporter.selector);
        registry.recordRepayment(alice, AAVE, 1_000_000);
    }

    // -------------------------------------------------- registry: multi-protocol

    function test_protocolCountTracksDistinctSources() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        assertEq(registry.protocolCount(alice), 1);

        registry.recordRepayment(alice, MORPHO_ID, 1_000_000 + GAP + 1);
        assertEq(registry.protocolCount(alice), 2);

        // Same protocol again must not double-count.
        registry.recordRepayment(alice, AAVE, 1_000_000 + 2 * (GAP + 1));
        assertEq(registry.protocolCount(alice), 2);
    }

    /// The spam guard is global, not per-protocol, and that is deliberate: otherwise a farmer
    /// cycles Aave, Spark and Morpho in one afternoon and books three repayments for a day's work.
    /// The protocol is still recorded — we did observe activity there — but it does not earn points.
    function test_spamGuardAppliesAcrossProtocolsNotJustWithinOne() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        registry.recordRepayment(alice, MORPHO_ID, 1_000_050); // same day, different protocol

        assertEq(registry.profileOf(alice).repayments, 1, "second same-day repayment should not count");
        assertEq(registry.protocolCount(alice), 2, "but both protocols were seen");

        registry.recordRepayment(alice, MORPHO_ID, 1_000_000 + GAP + 1);
        assertEq(registry.profileOf(alice).repayments, 2);
    }

    /// Breadth alone must not move the score — only time-separated repayments do.
    function test_scoreCountsRepaymentsNotProtocols() public {
        registry.recordRepayment(alice, AAVE, 1_000_000);
        uint16 oneProtocol = registry.scoreOf(alice);

        registry.recordRepayment(bob, AAVE, 1_000_000);
        registry.recordRepayment(bob, 1, 1_000_010);
        registry.recordRepayment(bob, MORPHO_ID, 1_000_020);

        assertEq(registry.protocolCount(bob), 3);
        assertEq(registry.scoreOf(bob), oneProtocol, "three protocols in one day is still one repayment");
    }

    function test_protocolIdMustFitTheBitmask() public {
        vm.expectRevert(abi.encodeWithSelector(CreditRegistry.ProtocolIdTooLarge.selector, uint16(32)));
        registry.recordRepayment(alice, 32, 1_000_000);
    }

    // ------------------------------------------------- ASC: decoding & binding

    function test_aaveRepayLogYieldsBorrowerNotRepayer() public view {
        EvmV1Decoder.LogEntry[] memory logs = _log(AAVE_POOL, AAVE_REPAY_SIG, alice, 2);
        assertEq(asc.exposeBorrowerFromLogs(logs, AAVE_POOL, _spec(AAVE_REPAY_SIG, 2)), alice);
    }

    /// Morpho puts the borrower one topic further along than Aave — the whole reason the topic
    /// index is configuration rather than a constant.
    function test_morphoRepayLogUsesADifferentTopicIndex() public view {
        EvmV1Decoder.LogEntry[] memory logs = _log(MORPHO, MORPHO_REPAY_SIG, alice, 3);
        assertEq(asc.exposeBorrowerFromLogs(logs, MORPHO, _spec(MORPHO_REPAY_SIG, 3)), alice);
    }

    /// Without the emitter check, anyone could deploy a contract emitting a well-formed Repay
    /// event for someone else's address and mint themselves a credit history.
    function test_rejectsLogFromNonCanonicalPool() public {
        EvmV1Decoder.LogEntry[] memory logs = _log(FAKE_POOL, AAVE_REPAY_SIG, alice, 2);
        vm.expectRevert(abi.encodeWithSelector(LendingHistoryASC.WrongEmitter.selector, FAKE_POOL, AAVE_POOL));
        asc.exposeBorrowerFromLogs(logs, AAVE_POOL, _spec(AAVE_REPAY_SIG, 2));
    }

    function test_truncatedTopicsRejected() public {
        EvmV1Decoder.LogEntry[] memory logs = _log(AAVE_POOL, AAVE_REPAY_SIG, alice, 2);
        logs[0].topics = new bytes32[](2);
        logs[0].topics[0] = AAVE_REPAY_SIG;
        vm.expectRevert(LendingHistoryASC.MalformedLog.selector);
        asc.exposeBorrowerFromLogs(logs, AAVE_POOL, _spec(AAVE_REPAY_SIG, 2));
    }

    function test_submitRejectsUnknownProtocol() public {
        vm.expectRevert(abi.encodeWithSelector(LendingHistoryASC.UnknownProtocol.selector, uint16(9)));
        asc.submit(9, LendingHistoryASC.Action.Repay, CHAIN_KEY, 1, hex"00", bytes32(0), _noSiblings(), bytes32(0), new bytes32[](0));
    }

    /// A proof from another attested chain — where the attacker may control the emitting address —
    /// must not satisfy the emitter check.
    function test_submitRejectsWrongChainKey() public {
        vm.expectRevert(abi.encodeWithSelector(LendingHistoryASC.WrongSourceChain.selector, uint64(1), CHAIN_KEY));
        asc.submit(AAVE, LendingHistoryASC.Action.Repay, 1, 1, hex"00", bytes32(0), _noSiblings(), bytes32(0), new bytes32[](0));
    }

    function test_submitRejectsUnconfiguredAction() public {
        vm.expectRevert(abi.encodeWithSelector(LendingHistoryASC.ActionNotConfigured.selector, AAVE, uint8(2)));
        asc.submit(AAVE, LendingHistoryASC.Action.Borrow, CHAIN_KEY, 1, hex"00", bytes32(0), _noSiblings(), bytes32(0), new bytes32[](0));
    }

    /// execute() must be unreachable without the context submit() installs.
    function test_directExecuteWithoutSubmitIsRejected() public {
        vm.expectRevert();
        asc.execute(0, CHAIN_KEY, 1_000_000, hex"00", bytes32(0), _noSiblings(), bytes32(0), new bytes32[](0));
    }

    // ---------------------------------------------------------- vault: lenders

    function test_depositMintsSharesOneForOneOnAnEmptyVault() public view {
        assertEq(line.balanceOf(lender), SEED);
        assertEq(line.totalAssets(), SEED);
    }

    function test_withdrawReturnsAssets() public {
        vm.prank(lender);
        line.withdraw(1000e6, lender, lender);
        assertEq(token.balanceOf(lender), 1000e6);
    }

    /// Principal that is out on loan is not withdrawable, and the cap says so instead of reverting
    /// with an opaque balance error.
    function test_maxWithdrawIsCappedByAvailableLiquidity() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);

        uint256 drain = line.totalAssets() - limit; // read before the prank: it is an external call
        vm.prank(lender);
        line.withdraw(drain, lender, lender); // leave exactly the limit behind

        vm.prank(alice);
        line.borrow(limit);

        assertEq(line.availableLiquidity(), 0);
        assertEq(line.maxWithdraw(lender), 0);
    }

    function test_borrowingDoesNotChangeTotalAssets() public {
        _buildHistory(alice, 8);
        uint256 before = line.totalAssets();

        uint256 limit = line.creditLimit(alice);
        vm.prank(alice);
        line.borrow(limit);

        assertEq(line.totalAssets(), before);
        assertEq(line.totalPrincipal(), limit);
    }

    /// The yield: interest paid by a borrower raises the value of every share.
    function test_repaidInterestRaisesSharePrice() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        uint256 sharesBefore = line.convertToAssets(1e6);

        vm.prank(alice);
        line.borrow(limit);

        vm.roll(block.number + line.BLOCKS_PER_YEAR() / 4); // a quarter of a year
        uint256 owed = line.amountOwed(alice);
        assertGt(owed, limit);

        token.mint(alice, owed);
        vm.startPrank(alice);
        token.approve(address(line), owed);
        line.repay(owed);
        vm.stopPrank();

        assertGt(line.convertToAssets(1e6), sharesBefore);
        assertEq(line.totalPrincipal(), 0);
    }

    function test_utilisationAndSupplyRateTrackLending() public {
        assertEq(line.utilisationBps(), 0);
        assertEq(line.supplyAprBps(), 0); // idle cash earns nothing

        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        vm.prank(alice);
        line.borrow(limit);

        assertEq(line.utilisationBps(), (limit * 10_000) / line.totalAssets());
        assertEq(line.supplyAprBps(), (line.BORROW_APR_BPS() * line.utilisationBps()) / 10_000);
    }

    /// No collateral means depositors carry the credit risk. A default must actually cost them.
    function test_defaultWritesPrincipalOffAgainstDepositors() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        uint256 assetsBefore = line.totalAssets();

        vm.prank(alice);
        line.borrow(limit);

        vm.roll(block.number + line.TERM_BLOCKS() + 1);
        line.markDefault(alice);

        assertEq(line.totalAssets(), assetsBefore - limit);
        assertEq(registry.profileOf(alice).defaults, 1);
        assertEq(line.creditLimit(alice), 0);
    }

    // --------------------------------------------------------- vault: borrowers

    function test_noHistoryCannotBorrow() public {
        vm.prank(alice);
        vm.expectRevert(CreditLine.NoCreditHistory.selector);
        line.borrow(1e6);
    }

    function test_lowScoreCannotBorrow() public {
        registry.recordRepayment(alice, AAVE, 1_000_000); // 325 < 500
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.ScoreTooLow.selector, uint16(325), uint16(500)));
        line.borrow(1e6);
    }

    function test_cannotBorrowAboveTheLimit() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.ExceedsCreditLimit.selector, limit + 1, limit));
        line.borrow(limit + 1);
    }

    function test_overpaymentIsClampedToAmountOwed() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        vm.prank(alice);
        line.borrow(limit);

        uint256 owed = line.amountOwed(alice);
        token.mint(alice, owed * 2);
        vm.startPrank(alice);
        token.approve(address(line), type(uint256).max);
        uint256 before = token.balanceOf(alice);
        line.repay(owed * 2);
        vm.stopPrank();
        assertEq(before - token.balanceOf(alice), owed);
    }

    function test_defaultCannotBeMarkedEarly() public {
        _buildHistory(alice, 8);
        uint256 limit = line.creditLimit(alice);
        vm.prank(alice);
        line.borrow(limit);

        vm.expectRevert();
        line.markDefault(alice);
    }

    // ------------------------------------------------------------- helpers

    function _buildHistory(address user, uint256 repayments) internal {
        uint64 blockNo = 1_000_000;
        for (uint256 i = 0; i < repayments; i++) {
            registry.recordRepayment(user, AAVE, blockNo);
            blockNo += GAP + 1;
        }
    }

    function _spec(bytes32 topic0, uint8 borrowerTopic) internal pure returns (LendingHistoryASC.EventSpec memory) {
        return LendingHistoryASC.EventSpec({topic0: topic0, borrowerTopic: borrowerTopic, enabled: true});
    }

    function _noSiblings() internal pure returns (INativeQueryVerifier.MerkleProofEntry[] memory) {
        return new INativeQueryVerifier.MerkleProofEntry[](0);
    }

    /// A four-topic log with `borrower` placed at `borrowerTopic`, the rest filled with noise.
    function _log(address emitter, bytes32 topic0, address borrower, uint8 borrowerTopic)
        internal
        pure
        returns (EvmV1Decoder.LogEntry[] memory logs)
    {
        logs = new EvmV1Decoder.LogEntry[](1);
        logs[0].address_ = emitter;
        logs[0].topics = new bytes32[](4);
        logs[0].topics[0] = topic0;
        for (uint8 i = 1; i < 4; i++) {
            logs[0].topics[i] = bytes32(uint256(uint160(address(uint160(0x1111 * i)))));
        }
        logs[0].topics[borrowerTopic] = bytes32(uint256(uint160(borrower)));
        logs[0].data = abi.encode(uint256(1000), false);
    }
}
