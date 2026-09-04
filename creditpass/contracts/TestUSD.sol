// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Freely mintable 6-decimal stand-in for a stablecoin. Testnet only — there is no access
///         control on `mint` and there is not meant to be.
contract TestUSD is ERC20 {
    constructor() ERC20("Test USD", "tUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
