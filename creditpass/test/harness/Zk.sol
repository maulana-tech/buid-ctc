// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";

import {IHonkVerifier} from "../../contracts/zk/IHonkVerifier.sol";
import {IPoseidonT3} from "../../contracts/zk/IPoseidonT3.sol";

/// @dev Deploys the two contracts the ZK path needs from the `zk` profile's artifacts (out-zk/).
///      The Honk verifier will not compile with via_ir at all, and PoseidonT3 compiled with it is
///      29KB — over EIP-170 — versus 16KB without; so both come from the profile without it.
library Zk {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function deployPoseidon() internal returns (IPoseidonT3) {
        return IPoseidonT3(_deploy("out-zk/PoseidonT3.sol/PoseidonT3.json"));
    }

    function deployVerifier() internal returns (IHonkVerifier) {
        return IHonkVerifier(_deploy("out-zk/HonkVerifier.sol/HonkVerifier.json"));
    }

    function _deploy(string memory path) private returns (address addr) {
        bytes memory code = vm.parseJsonBytes(vm.readFile(path), ".bytecode.object");
        assembly ("memory-safe") {
            addr := create(0, add(code, 0x20), mload(code))
        }
        require(addr != address(0), string.concat("deploy failed: ", path));
    }
}
