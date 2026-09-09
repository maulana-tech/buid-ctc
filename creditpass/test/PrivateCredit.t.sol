// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CreditRegistry} from "../contracts/CreditRegistry.sol";
import {CreditLine} from "../contracts/CreditLine.sol";
import {Zk} from "./harness/Zk.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice The private borrow path, end to end, against a real UltraHonk proof.
///
/// The fixture in test/fixtures/zk-threshold.json was produced by script/make-zk-fixture.ts from
/// the same scenario this setUp builds. The first assertion is that the contract's Poseidon tree
/// arrives at the same root JavaScript did — that is the cross-check that the Solidity hashing,
/// the leaf layout and the circuit all agree. Everything after that is the credit line's own logic.
contract PrivateCreditTest is Test {
    CreditRegistry internal registry;
    CreditLine internal line;
    MockERC20 internal token;

    address internal alice;
    address internal bob;
    address internal fresh = address(0xF4E5);
    address internal lender = address(0x1E4DE2);

    uint256 internal commitment;
    uint256 internal nullifier;
    uint256 internal fixtureRoot;
    uint16 internal threshold;
    bytes internal proof;

    uint64 internal constant GAP = 7201;
    uint256 internal constant LIMIT_UNIT = 100e6;

    function setUp() public {
        string memory json = vm.readFile("test/fixtures/zk-threshold.json");
        alice = vm.parseJsonAddress(json, ".alice");
        bob = vm.parseJsonAddress(json, ".bob");
        commitment = uint256(vm.parseJsonBytes32(json, ".commitment"));
        nullifier = uint256(vm.parseJsonBytes32(json, ".nullifier"));
        fixtureRoot = uint256(vm.parseJsonBytes32(json, ".root"));
        threshold = uint16(vm.parseJsonUint(json, ".threshold"));
        proof = vm.parseJsonBytes(json, ".proof");

        registry = new CreditRegistry(Zk.deployPoseidon());
        token = new MockERC20();
        line = new CreditLine(token, registry, Zk.deployVerifier(), LIMIT_UNIT);
        registry.setReporter(address(this), true);
        registry.setReporter(address(line), true);

        token.mint(lender, 1_000_000e6);
        vm.startPrank(lender);
        token.approve(address(line), type(uint256).max);
        line.deposit(1_000_000e6, lender);
        vm.stopPrank();

        // Eight counted repayments a day apart: 300 + 8 × 25 = 500, no tenure bonus yet.
        for (uint64 k = 0; k < 8; k++) {
            registry.recordRepayment(alice, 0, 1_000_000 + k * GAP);
        }
        registry.recordRepayment(bob, 0, 1_000_000);
        assertEq(registry.scoreOf(alice), vm.parseJsonUint(json, ".aliceScore"));
        assertEq(registry.scoreOf(bob), vm.parseJsonUint(json, ".bobScore"));

        vm.prank(alice);
        registry.setCommitment(commitment);
    }

    // ------------------------------------------------------------------ tree

    function test_contractTreeMatchesJavaScriptTree() public view {
        assertEq(registry.root(), fixtureRoot, "Solidity Poseidon tree differs from the JS one");
        (uint256[16] memory siblings, uint32 index, uint256 root) = registry.merklePath(alice);
        assertEq(index, 0);
        assertEq(root, fixtureRoot);
        assertEq(siblings[0], registry.leafOf(bob), "Alice's first sibling should be Bob's leaf");
        assertTrue(registry.isKnownRoot(fixtureRoot));
        assertFalse(registry.isKnownRoot(fixtureRoot ^ 1));
    }

    function test_commitmentRequiresKnownAddressAndFieldElement() public {
        vm.prank(fresh);
        vm.expectRevert(CreditRegistry.NotKnown.selector);
        registry.setCommitment(commitment);

        vm.prank(alice);
        vm.expectRevert(CreditRegistry.InvalidFieldElement.selector);
        registry.setCommitment(type(uint256).max);
    }

    // ---------------------------------------------------------------- borrow

    function test_freshWalletBorrowsWithProof() public {
        vm.prank(fresh);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);

        assertEq(token.balanceOf(fresh), LIMIT_UNIT);
        (,,,, bool active) = line.loans(fresh);
        assertTrue(active);
        assertEq(line.privateNullifier(fresh), nullifier);
        assertTrue(line.nullifierHasLoan(nullifier));
        assertEq(line.totalPrincipal(), LIMIT_UNIT);
        // Nothing on chain names Alice.
        (,,,, bool aliceActive) = line.loans(alice);
        assertFalse(aliceActive);
    }

    function test_thresholdIsTheLimit() public {
        vm.prank(fresh);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.ExceedsCreditLimit.selector, LIMIT_UNIT + 1, LIMIT_UNIT));
        line.borrowPrivate(LIMIT_UNIT + 1, threshold, fixtureRoot, nullifier, proof);
    }

    function test_proofIsBoundToItsPublicInputs() public {
        // Same proof, higher threshold: the verifier must say no.
        vm.prank(fresh);
        vm.expectRevert(CreditLine.InvalidProof.selector);
        line.borrowPrivate(LIMIT_UNIT, 600, fixtureRoot, nullifier, proof);

        // Same proof, different nullifier.
        vm.prank(fresh);
        vm.expectRevert(CreditLine.InvalidProof.selector);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier ^ 1, proof);
    }

    function test_tamperedProofRejected() public {
        bytes memory bad = proof;
        bad[100] ^= 0x01;
        vm.prank(fresh);
        vm.expectRevert(CreditLine.InvalidProof.selector);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, bad);
    }

    function test_unknownRootRejected() public {
        vm.prank(fresh);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.UnknownRoot.selector, fixtureRoot ^ 1));
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot ^ 1, nullifier, proof);
    }

    function test_oneLoanPerIdentity() public {
        vm.prank(fresh);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);

        address second = address(0xF4E6);
        vm.prank(second);
        vm.expectRevert(abi.encodeWithSelector(CreditLine.NullifierBusy.selector, nullifier));
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);
    }

    function test_recentRootStaysValidAfterUnrelatedUpdate() public {
        // Bob's next repayment moves the root; Alice's proof against the old root still verifies.
        registry.recordRepayment(bob, 0, 1_000_000 + GAP);
        assertTrue(registry.root() != fixtureRoot);
        vm.prank(fresh);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);
        assertEq(token.balanceOf(fresh), LIMIT_UNIT);
    }

    // ---------------------------------------------------------- repay/default

    function test_repayReleasesTheIdentity() public {
        vm.prank(fresh);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);

        vm.roll(block.number + 100);
        uint256 owed = line.amountOwed(fresh);
        token.mint(fresh, owed);
        vm.startPrank(fresh);
        token.approve(address(line), owed);
        line.repay(owed);
        vm.stopPrank();

        assertFalse(line.nullifierHasLoan(nullifier));
        assertEq(line.privateNullifier(fresh), 0);

        // The identity can borrow again, from yet another wallet, with the same proof.
        address third = address(0xF4E7);
        vm.prank(third);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);
        assertEq(token.balanceOf(third), LIMIT_UNIT);
    }

    function test_defaultIsChargedToTheNullifierNotTheAddress() public {
        vm.prank(fresh);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);

        (,,, uint64 dueBlock,) = line.loans(fresh);
        vm.roll(dueBlock);
        line.markDefault(fresh);

        assertEq(registry.nullifierDefaults(nullifier), 1);
        assertEq(registry.profileOf(alice).defaults, 0, "the address must not be linked to the default");
        assertEq(registry.scoreOf(alice), 500, "public score untouched");
        assertFalse(line.nullifierHasLoan(nullifier));

        // The old proof carried defaults = 0 as a public input; the contract now supplies 1.
        address second = address(0xF4E6);
        vm.prank(second);
        vm.expectRevert(CreditLine.InvalidProof.selector);
        line.borrowPrivate(LIMIT_UNIT, threshold, fixtureRoot, nullifier, proof);
    }
}
