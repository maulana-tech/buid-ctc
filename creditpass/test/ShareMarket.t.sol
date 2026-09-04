// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CreditLine} from "../contracts/CreditLine.sol";
import {CreditRegistry} from "../contracts/CreditRegistry.sol";
import {ShareMarket} from "../contracts/ShareMarket.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice The market exists to solve one problem: a depositor whose capital is out on loan cannot
///         withdraw. These tests pin that it actually does, and that escrow makes every listed
///         offer real.
contract ShareMarketTest is Test {
    CreditRegistry internal registry;
    CreditLine internal line;
    ShareMarket internal market;
    MockERC20 internal token;

    address internal alice = address(0xA11CE); // borrower
    address internal lender = address(0x1E4DE2); // wants out
    address internal buyer = address(0xB0FFEE); // takes over the position

    uint64 internal constant GAP = 7200;
    uint256 internal constant LIMIT_UNIT = 100e6;
    uint256 internal constant SEED = 1_000e6;

    function setUp() public {
        registry = new CreditRegistry();
        token = new MockERC20();
        line = new CreditLine(token, registry, LIMIT_UNIT);
        market = new ShareMarket(line);

        registry.setReporter(address(this), true);
        registry.setReporter(address(line), true);

        token.mint(lender, SEED);
        vm.startPrank(lender);
        token.approve(address(line), type(uint256).max);
        line.deposit(SEED, lender);
        line.approve(address(market), type(uint256).max);
        vm.stopPrank();

        token.mint(buyer, SEED);
        vm.prank(buyer);
        token.approve(address(market), type(uint256).max);
    }

    /// Eight time-separated repayments is enough to open the credit line.
    function _creditworthy(address user) internal {
        uint64 blockNo = 1_000_000;
        for (uint256 i = 0; i < 8; i++) {
            registry.recordRepayment(user, 0, blockNo);
            blockNo += GAP + 1;
        }
    }

    /// The whole reason this contract exists.
    function test_lenderLockedOutOfWithdrawalCanStillExit() public {
        _creditworthy(alice);

        // Drain the vault to exactly the credit limit, then lend it all out.
        uint256 limit = line.creditLimit(alice);
        uint256 drain = line.totalAssets() - limit;
        vm.prank(lender);
        line.withdraw(drain, lender, lender);

        vm.prank(alice);
        line.borrow(limit);

        // Withdrawal is now impossible: the money is out on loan.
        assertEq(line.maxWithdraw(lender), 0, "precondition: lender should be stuck");

        uint128 shares = uint128(line.balanceOf(lender));
        uint128 ask = uint128(line.convertToAssets(shares) * 97 / 100); // 3% to leave early

        vm.prank(lender);
        uint256 id = market.list(shares, ask);

        uint256 lenderAssetsBefore = token.balanceOf(lender);
        vm.prank(buyer);
        market.fill(id);

        assertEq(token.balanceOf(lender) - lenderAssetsBefore, ask, "seller was paid");
        assertEq(line.balanceOf(buyer), shares, "buyer holds the position");
        assertEq(line.balanceOf(lender), 0, "seller is out");
    }

    /// Escrow is the design: a listed offer must always be fillable.
    function test_listingEscrowsSharesSoOffersAreAlwaysReal() public {
        vm.prank(lender);
        market.list(100e6, 99e6);

        assertEq(line.balanceOf(address(market)), 100e6, "shares held by the market");

        // The seller cannot move what they already offered.
        uint256 stillHeld = line.balanceOf(lender); // read before the prank: it is an external call
        vm.prank(lender);
        vm.expectRevert();
        line.transfer(buyer, stillHeld + 1);
    }

    function test_cancelReturnsTheShares() public {
        uint256 before = line.balanceOf(lender);

        vm.startPrank(lender);
        uint256 id = market.list(100e6, 99e6);
        market.cancel(id);
        vm.stopPrank();

        assertEq(line.balanceOf(lender), before);
        assertEq(market.openOffers().length, 0);
    }

    function test_onlySellerCanCancel() public {
        vm.prank(lender);
        uint256 id = market.list(100e6, 99e6);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ShareMarket.NotSeller.selector, buyer, lender));
        market.cancel(id);
    }

    function test_offerCannotBeFilledTwice() public {
        vm.prank(lender);
        uint256 id = market.list(100e6, 99e6);

        vm.prank(buyer);
        market.fill(id);

        token.mint(address(0xDEAD), SEED);
        vm.startPrank(address(0xDEAD));
        token.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(ShareMarket.OfferClosed.selector, id));
        market.fill(id);
        vm.stopPrank();
    }

    /// Self-filling would print volume while moving nothing.
    function test_sellerCannotFillTheirOwnOffer() public {
        vm.startPrank(lender);
        uint256 id = market.list(100e6, 99e6);
        token.approve(address(market), type(uint256).max);
        vm.expectRevert(ShareMarket.CannotFillOwnOffer.selector);
        market.fill(id);
        vm.stopPrank();
    }

    /// The buyer's actual question: what would the vault redeem this for?
    function test_navReportsWhatTheSharesAreWorth() public {
        vm.prank(lender);
        uint256 id = market.list(100e6, 90e6);

        assertEq(market.navOf(id), line.convertToAssets(100e6));
        assertGt(market.navOf(id), 90e6, "offered below NAV, as an early exit should be");
    }

    function test_openOffersTracksTheBook() public {
        vm.startPrank(lender);
        uint256 first = market.list(100e6, 99e6);
        market.list(50e6, 49e6);
        vm.stopPrank();

        assertEq(market.openOffers().length, 2);

        vm.prank(lender);
        market.cancel(first);
        assertEq(market.openOffers().length, 1);
    }

    function test_emptyListingRejected() public {
        vm.prank(lender);
        vm.expectRevert(ShareMarket.ZeroAmount.selector);
        market.list(0, 99e6);
    }
}
