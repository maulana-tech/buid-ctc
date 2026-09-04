/**
 * The one source of truth for which lending protocols CreditPass reads.
 *
 * `register-protocols.ts` writes this table into LendingHistoryASC, `check-sigs.ts` verifies it
 * against live mainnet logs, and the worker scans with it. Keeping it in one place is what stops
 * the contract's idea of an event drifting from the chain's.
 *
 * Compound V3 is deliberately absent: repaying in Comet is a `Supply` of the base asset, which is
 * indistinguishable from an ordinary supply without reading debt state.
 */

export type EventKind = 'Repay' | 'Liquidation' | 'Borrow'

/** Must match the Action enum in LendingHistoryASC.sol. */
export const ACTION_INDEX: Record<EventKind, number> = { Repay: 0, Liquidation: 1, Borrow: 2 }

export type EventSpec = {
    /** Solidity signature exactly as the protocol declares it (enums become uint8, Id becomes bytes32). */
    signature: string
    /** Index into topics[] holding the address whose credit record this is. */
    borrowerTopic: 1 | 2 | 3
    /** Roughly how many blocks back you need to look to expect at least one, for the signature check. */
    lookback: number
}

export type Protocol = {
    /** Must stay below 32 — CreditRegistry packs it into a bitmask. */
    id: number
    name: string
    pool: string
    chainKey: number
    events: Record<EventKind, EventSpec>
}

/** Aave V3 and its forks share event shapes; only the pool address differs. */
const aaveV3Events: Record<EventKind, EventSpec> = {
    // Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)
    Repay: { signature: 'Repay(address,address,address,uint256,bool)', borrowerTopic: 2, lookback: 20_000 },
    // LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, ...)
    Liquidation: {
        signature: 'LiquidationCall(address,address,address,uint256,uint256,address,bool)',
        borrowerTopic: 3,
        lookback: 120_000,
    },
    // Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)
    Borrow: { signature: 'Borrow(address,address,address,uint256,uint8,uint256,uint16)', borrowerTopic: 2, lookback: 20_000 },
}

export const PROTOCOLS: Protocol[] = [
    {
        id: 0,
        name: 'Aave V3',
        pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
        chainKey: 3,
        events: aaveV3Events,
    },
    {
        id: 1,
        name: 'Spark',
        pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
        chainKey: 3,
        events: aaveV3Events,
    },
    {
        id: 2,
        name: 'Morpho Blue',
        pool: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
        chainKey: 3,
        events: {
            // Repay(Id indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)
            Repay: { signature: 'Repay(bytes32,address,address,uint256,uint256)', borrowerTopic: 3, lookback: 40_000 },
            // Liquidate(Id indexed id, address indexed caller, address indexed borrower, ...)
            Liquidation: {
                signature: 'Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)',
                borrowerTopic: 3,
                lookback: 200_000,
            },
            // Borrow(Id indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)
            Borrow: { signature: 'Borrow(bytes32,address,address,address,uint256,uint256)', borrowerTopic: 2, lookback: 40_000 },
        },
    },
]

export const EVENT_KINDS: EventKind[] = ['Repay', 'Liquidation', 'Borrow']
