// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

import {CreditRegistry} from "../contracts/CreditRegistry.sol";
import {LendingHistoryASC} from "../contracts/LendingHistoryASC.sol";
import {MockNativeQueryVerifier} from "./mocks/MockNativeQueryVerifier.sol";

/// @notice Replays real Ethereum mainnet transactions through the real decoder.
/// @dev    The rest of the suite builds synthetic `LogEntry` structs, which means
///         `EvmV1Decoder.decodeReceiptFields` never sees actual RLP. These fixtures close that gap:
///         genuine Aave V3, Spark and Morpho Blue transactions, with genuine proofs fetched from the
///         live Proof Builder, and only the `0xFD2` precompile mocked — it is a runtime precompile
///         with no bytecode, so it cannot be forked or deployed into a test.
///
///         Regenerate the fixtures with `npm run make:fixtures`.
contract RealProofTest is Test {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;

    CreditRegistry internal registry;
    LendingHistoryASC internal asc;
    MockNativeQueryVerifier internal verifier;

    struct Fixture {
        uint16 protocolId;
        uint8 action;
        address pool;
        uint64 chainKey;
        uint64 blockHeight;
        address expectedBorrower;
        bytes txBytes;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    function setUp() public {
        verifier = new MockNativeQueryVerifier();
        vm.etch(PRECOMPILE, address(verifier).code);

        registry = new CreditRegistry();
        asc = new LendingHistoryASC(registry);
        registry.setReporter(address(asc), true);
    }

    function _load(string memory name) internal view returns (Fixture memory f) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/", name, ".json"));

        f.protocolId = uint16(vm.parseJsonUint(json, ".protocolId"));
        f.action = uint8(vm.parseJsonUint(json, ".action"));
        f.pool = vm.parseJsonAddress(json, ".pool");
        f.chainKey = uint64(vm.parseJsonUint(json, ".chainKey"));
        f.blockHeight = uint64(vm.parseJsonUint(json, ".blockHeight"));
        f.expectedBorrower = vm.parseJsonAddress(json, ".expectedBorrower");
        f.txBytes = vm.parseJsonBytes(json, ".txBytes");
        f.merkleRoot = vm.parseJsonBytes32(json, ".merkleRoot");
        f.lowerEndpointDigest = vm.parseJsonBytes32(json, ".lowerEndpointDigest");
        f.continuityRoots = vm.parseJsonBytes32Array(json, ".continuityRoots");
        f.siblings = abi.decode(vm.parseJson(json, ".siblings"), (INativeQueryVerifier.MerkleProofEntry[]));
    }

    function _register(Fixture memory f, bytes32 topic0, uint8 borrowerTopic) internal {
        asc.registerSource(f.protocolId, "fixture", f.pool, f.chainKey);
        asc.setEventSpec(f.protocolId, LendingHistoryASC.Action(f.action), topic0, borrowerTopic);
    }

    function _submit(Fixture memory f) internal {
        asc.submit(
            f.protocolId,
            LendingHistoryASC.Action(f.action),
            f.chainKey,
            f.blockHeight,
            f.txBytes,
            f.merkleRoot,
            f.siblings,
            f.lowerEndpointDigest,
            f.continuityRoots
        );
    }

    // Signature strings verified against live mainnet logs by `npm run check:sigs`.
    bytes32 internal constant AAVE_REPAY = keccak256("Repay(address,address,address,uint256,bool)");
    bytes32 internal constant MORPHO_REPAY = keccak256("Repay(bytes32,address,address,uint256,uint256)");

    function test_aaveRepayProofCreditsTheRealBorrower() public {
        Fixture memory f = _load("aave-v3-repay");
        _register(f, AAVE_REPAY, 2);
        _submit(f);

        assertTrue(registry.isKnown(f.expectedBorrower), "borrower not recorded");
        assertEq(registry.profileOf(f.expectedBorrower).repayments, 1);
        assertEq(registry.profileOf(f.expectedBorrower).firstSeenBlock, f.blockHeight);
    }

    /// Spark is an Aave V3 fork: same event shape, different pool. Proves the source table works.
    function test_sparkRepayProofCreditsTheRealBorrower() public {
        Fixture memory f = _load("spark-repay");
        _register(f, AAVE_REPAY, 2);
        _submit(f);

        assertTrue(registry.isKnown(f.expectedBorrower), "borrower not recorded");
        assertEq(registry.profileOf(f.expectedBorrower).repayments, 1);
    }

    /// Morpho carries the borrower one topic further along. If the index were hardcoded to Aave's,
    /// this test would credit the wrong address — which is the whole point of it being data.
    function test_morphoRepayProofUsesTheDifferentTopicIndex() public {
        Fixture memory f = _load("morpho-blue-repay");
        _register(f, MORPHO_REPAY, 3);
        _submit(f);

        assertTrue(registry.isKnown(f.expectedBorrower), "borrower not recorded");
        assertEq(registry.profileOf(f.expectedBorrower).repayments, 1);
    }

    /// The dedupe is the only thing stopping one repayment being counted a hundred times.
    function test_sameProofCannotBeSubmittedTwice() public {
        Fixture memory f = _load("aave-v3-repay");
        _register(f, AAVE_REPAY, 2);
        _submit(f);

        vm.expectRevert("Query already processed");
        _submit(f);
    }

    /// A proof the precompile rejects must not reach the registry at all.
    function test_rejectedProofWritesNothing() public {
        Fixture memory f = _load("aave-v3-repay");
        _register(f, AAVE_REPAY, 2);

        MockNativeQueryVerifier(PRECOMPILE).setAccept(false);
        vm.expectRevert("Proof of inclusion verification failed");
        _submit(f);

        assertFalse(registry.isKnown(f.expectedBorrower));
    }

    /// Real transaction, real proof, but the emitter registered for this protocol is someone else.
    function test_realProofFromTheWrongPoolIsRejected() public {
        Fixture memory f = _load("aave-v3-repay");
        address impostor = address(0xBAD);
        asc.registerSource(f.protocolId, "fixture", impostor, f.chainKey);
        asc.setEventSpec(f.protocolId, LendingHistoryASC.Action(f.action), AAVE_REPAY, 2);

        vm.expectRevert(abi.encodeWithSelector(LendingHistoryASC.WrongEmitter.selector, f.pool, impostor));
        _submit(f);
    }

    /// Looking for an event the transaction does not contain must fail loudly, not silently pass.
    function test_wrongEventSignatureFindsNothing() public {
        Fixture memory f = _load("aave-v3-repay");
        _register(f, keccak256("NotAnEvent(address)"), 2);

        vm.expectRevert(LendingHistoryASC.NoMatchingEvent.selector);
        _submit(f);
    }

    /// Three protocols, one borrower each, all from real chain data.
    function test_allThreeFixturesDecodeEndToEnd() public {
        string[3] memory names = ["aave-v3-repay", "spark-repay", "morpho-blue-repay"];
        bytes32[3] memory topics = [AAVE_REPAY, AAVE_REPAY, MORPHO_REPAY];
        uint8[3] memory indexes = [2, 2, 3];

        for (uint256 i = 0; i < names.length; i++) {
            Fixture memory f = _load(names[i]);
            _register(f, topics[i], indexes[i]);
            _submit(f);
            assertTrue(registry.isKnown(f.expectedBorrower), names[i]);
        }
    }
}
