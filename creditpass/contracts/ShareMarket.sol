// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {CreditLine} from "./CreditLine.sol";

/// @title ShareMarket
/// @notice A secondary market for CreditLine vault shares.
/// @dev    This exists because of a real limit in the vault, not to have a swap: `maxWithdraw` is
///         capped by available liquidity, so a depositor whose capital is out on loan cannot leave
///         until borrowers repay. Here they can sell the position instead, and the buyer takes over
///         both the yield and the credit risk.
///
///         It is an escrowed order book, not an AMM. A constant-product pool would need liquidity
///         providers, a curve, and an oracle-ish notion of fair value for an asset whose NAV the
///         vault already reports exactly. Offers priced against a known NAV need none of that.
contract ShareMarket {
    using SafeERC20 for IERC20;

    struct Offer {
        address seller;
        uint128 shares;
        uint128 askAssets;
        bool active;
    }

    CreditLine public immutable VAULT;
    IERC20 public immutable SHARE;
    IERC20 public immutable ASSET;

    Offer[] private _offers;

    event Listed(uint256 indexed id, address indexed seller, uint128 shares, uint128 askAssets);
    event Cancelled(uint256 indexed id, address indexed seller);
    event Filled(uint256 indexed id, address indexed seller, address indexed buyer, uint128 shares, uint128 paidAssets);
    event PartiallyFilled(uint256 indexed id, address indexed buyer, uint128 shares, uint128 paidAssets, uint128 remainingShares);

    error ZeroAmount();
    error NoSuchOffer(uint256 id);
    error OfferClosed(uint256 id);
    error NotSeller(address caller, address seller);
    error CannotFillOwnOffer();
    error ExceedsOffer(uint128 requested, uint128 available);

    constructor(CreditLine vault) {
        VAULT = vault;
        SHARE = IERC20(address(vault));
        ASSET = IERC20(vault.asset());
    }

    /// @notice Offer `shares` for `askAssets`. The shares move into escrow immediately.
    /// @dev Escrow is the point: without it a seller could list and then move the shares elsewhere,
    ///      and every offer on the book would be a maybe. Listed means fillable.
    function list(uint128 shares, uint128 askAssets) external returns (uint256 id) {
        if (shares == 0 || askAssets == 0) revert ZeroAmount();

        SHARE.safeTransferFrom(msg.sender, address(this), shares);

        id = _offers.length;
        _offers.push(Offer({seller: msg.sender, shares: shares, askAssets: askAssets, active: true}));

        emit Listed(id, msg.sender, shares, askAssets);
    }

    function cancel(uint256 id) external {
        Offer storage offer = _at(id);
        if (!offer.active) revert OfferClosed(id);
        if (offer.seller != msg.sender) revert NotSeller(msg.sender, offer.seller);

        offer.active = false;
        SHARE.safeTransfer(offer.seller, offer.shares);

        emit Cancelled(id, offer.seller);
    }

    /// @notice Buy the whole offer: assets to the seller, escrowed shares to you.
    function fill(uint256 id) external {
        Offer storage offer = _at(id);
        if (!offer.active) revert OfferClosed(id);
        // Self-filling would look like volume while moving nothing. Cancel instead.
        if (offer.seller == msg.sender) revert CannotFillOwnOffer();

        uint128 shares = offer.shares;
        uint128 paid = offer.askAssets;
        offer.active = false;
        offer.shares = 0;
        offer.askAssets = 0;

        ASSET.safeTransferFrom(msg.sender, offer.seller, paid);
        SHARE.safeTransfer(msg.sender, shares);

        emit Filled(id, offer.seller, msg.sender, shares, paid);
    }

    /// @notice Buy part of an offer at its listed per-share price.
    /// @dev The buyer pays pro-rata, rounded up so a seller never receives less per share than they
    ///      asked for. The remainder stays on the book at the same price. A swap-style "you pay X"
    ///      input is only honest if a buyer can take exactly X worth, which whole-offer fills forbid.
    function fillPartial(uint256 id, uint128 sharesToBuy) external {
        Offer storage offer = _at(id);
        if (!offer.active) revert OfferClosed(id);
        if (offer.seller == msg.sender) revert CannotFillOwnOffer();
        if (sharesToBuy == 0) revert ZeroAmount();
        if (sharesToBuy > offer.shares) revert ExceedsOffer(sharesToBuy, offer.shares);

        uint128 paid = uint128((uint256(offer.askAssets) * sharesToBuy + offer.shares - 1) / offer.shares);

        offer.shares -= sharesToBuy;
        offer.askAssets -= paid;
        if (offer.shares == 0) offer.active = false;

        ASSET.safeTransferFrom(msg.sender, offer.seller, paid);
        SHARE.safeTransfer(msg.sender, sharesToBuy);

        if (offer.active) {
            emit PartiallyFilled(id, msg.sender, sharesToBuy, paid, offer.shares);
        } else {
            emit Filled(id, offer.seller, msg.sender, sharesToBuy, paid);
        }
    }

    // ------------------------------------------------------------------ reads

    function offerCount() external view returns (uint256) {
        return _offers.length;
    }

    function offers(uint256 id) external view returns (Offer memory) {
        return _at(id);
    }

    /// @notice What the vault says the offered shares are currently worth.
    /// @dev The comparison a buyer actually needs: pay `askAssets`, receive something the vault
    ///      would redeem for this. A market discount is the price of leaving early.
    function navOf(uint256 id) external view returns (uint256) {
        return VAULT.convertToAssets(_at(id).shares);
    }

    function openOffers() external view returns (uint256[] memory ids) {
        uint256 open = 0;
        for (uint256 i = 0; i < _offers.length; i++) {
            if (_offers[i].active) open++;
        }

        ids = new uint256[](open);
        uint256 cursor = 0;
        for (uint256 i = 0; i < _offers.length; i++) {
            if (_offers[i].active) ids[cursor++] = i;
        }
    }

    function _at(uint256 id) private view returns (Offer storage) {
        if (id >= _offers.length) revert NoSuchOffer(id);
        return _offers[id];
    }
}
