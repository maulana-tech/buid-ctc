// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LendingHistoryASC} from "../../contracts/LendingHistoryASC.sol";
import {CreditRegistry} from "../../contracts/CreditRegistry.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @dev Exposes the internal log decoder so emitter binding and per-protocol topic indexing can be
///      tested without constructing RLP transactions or a live block-prover precompile.
contract LendingHistoryASCHarness is LendingHistoryASC {
    constructor(CreditRegistry registry_) LendingHistoryASC(registry_) {}

    function exposeBorrowerFromLogs(EvmV1Decoder.LogEntry[] memory logs, address pool, EventSpec memory spec)
        external
        pure
        returns (address)
    {
        return _borrowerFromLogs(logs, pool, spec);
    }
}
