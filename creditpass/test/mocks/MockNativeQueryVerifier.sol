// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

/// @notice Stands in for the `0xFD2` precompile, which is a pallet-evm runtime precompile with no
///         bytecode and therefore cannot be forked or deployed locally.
/// @dev    Only the cryptographic check is faked. Everything downstream — RLP receipt decoding, log
///         selection, emitter binding, topic indexing — runs for real against real mainnet
///         transaction bytes. `accept` lets a test make verification fail on demand.
contract MockNativeQueryVerifier {
    /// @dev Stored inverted on purpose. `vm.etch` copies bytecode but not storage, so an etched
    ///      mock starts with every slot at zero — a `accept = true` initialiser would silently
    ///      become false and every proof would be rejected. Zero must mean "working".
    bool public rejectProofs;

    function setAccept(bool value) external {
        rejectProofs = !value;
    }

    function verifyAndEmit(
        uint64,
        uint64,
        bytes calldata,
        INativeQueryVerifier.MerkleProof calldata,
        INativeQueryVerifier.ContinuityProof calldata
    ) external view returns (bool) {
        return !rejectProofs;
    }

    /// @dev The real precompile derives the index from the sibling path. Mirroring that shape is
    ///      enough for the query-id dedupe to behave: same proof in, same index out.
    function calculateTxIndex(INativeQueryVerifier.MerkleProof calldata merkleProof) external pure returns (uint64) {
        uint64 index = 0;
        for (uint256 i = merkleProof.siblings.length; i > 0; i--) {
            index = (index << 1) | (merkleProof.siblings[i - 1].isLeft ? 1 : 0);
        }
        return index;
    }
}
