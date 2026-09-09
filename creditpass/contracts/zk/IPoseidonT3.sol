// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev poseidon-solidity's PoseidonT3 is a library with a public function, so it is deployed once
///      and called through this interface rather than linked into every contract that hashes.
interface IPoseidonT3 {
    function hash(uint256[2] memory input) external pure returns (uint256);
}
