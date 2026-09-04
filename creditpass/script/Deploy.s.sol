// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {CreditRegistry} from "../contracts/CreditRegistry.sol";
import {LendingHistoryASC} from "../contracts/LendingHistoryASC.sol";
import {CreditLine} from "../contracts/CreditLine.sol";
import {TestUSD} from "../contracts/TestUSD.sol";

/// @notice Deploys the stack and wires reporter permissions. Protocol sources are registered
///         separately by `npm run register:protocols`, which reads the same table the worker and
///         the signature check use — one place for the event data, no drift.
/// forge script script/Deploy.s.sol --rpc-url $CREDITCOIN_RPC_URL --broadcast --private-key $CREDITCOIN_WALLET_PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        uint256 limitUnit = vm.envOr("LIMIT_UNIT", uint256(100e6)); // 100 tUSD per tier step
        uint256 seed = vm.envOr("VAULT_SEED", uint256(1_000_000e6));

        vm.startBroadcast();

        CreditRegistry registry = new CreditRegistry();
        LendingHistoryASC asc = new LendingHistoryASC(registry);

        TestUSD usd = new TestUSD();
        CreditLine line = new CreditLine(usd, registry, limitUnit);

        // Only these two may write credit profiles.
        registry.setReporter(address(asc), true);
        registry.setReporter(address(line), true);

        // Seed the vault so there is something to borrow. These are ordinary ERC4626 shares —
        // the deployer is a depositor like anyone else, with no special withdrawal rights.
        usd.mint(msg.sender, seed);
        usd.approve(address(line), seed);
        line.deposit(seed, msg.sender);

        vm.stopBroadcast();

        console.log("CREDIT_REGISTRY_ADDRESS=%s", address(registry));
        console.log("LENDING_HISTORY_ASC_ADDRESS=%s", address(asc));
        console.log("CREDIT_LINE_ADDRESS=%s", address(line));
        console.log("TEST_USD_ADDRESS=%s", address(usd));
    }
}
