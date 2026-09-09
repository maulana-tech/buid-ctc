/**
 * Which source-chain events count as lending history, for the proof API route.
 *
 * ponytail: copied from ../../worker/protocols.ts because the Next app cannot import outside its
 * Turbopack root. `npm run check:sigs` at the repo root verifies the worker copy against mainnet;
 * if you change one, change both.
 */
export type EventKind = 'Repay' | 'Liquidation' | 'Borrow'

/** Must match the Action enum in LendingHistoryASC.sol. */
export const ACTION_INDEX: Record<EventKind, number> = { Repay: 0, Liquidation: 1, Borrow: 2 }

type EventSpec = { signature: string; borrowerTopic: 1 | 2 | 3 }

export type Protocol = { id: number; name: string; pool: string; chainKey: number; events: Record<EventKind, EventSpec> }

const aaveV3Events: Record<EventKind, EventSpec> = {
    Repay: { signature: 'Repay(address,address,address,uint256,bool)', borrowerTopic: 2 },
    Liquidation: { signature: 'LiquidationCall(address,address,address,uint256,uint256,address,bool)', borrowerTopic: 3 },
    Borrow: { signature: 'Borrow(address,address,address,uint256,uint8,uint256,uint16)', borrowerTopic: 2 },
}

export const PROTOCOLS: Protocol[] = [
    { id: 0, name: 'Aave V3', pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', chainKey: 3, events: aaveV3Events },
    { id: 1, name: 'Spark', pool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987', chainKey: 3, events: aaveV3Events },
    {
        id: 2,
        name: 'Morpho Blue',
        pool: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
        chainKey: 3,
        events: {
            Repay: { signature: 'Repay(bytes32,address,address,uint256,uint256)', borrowerTopic: 3 },
            Liquidation: { signature: 'Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)', borrowerTopic: 3 },
            Borrow: { signature: 'Borrow(bytes32,address,address,address,uint256,uint256)', borrowerTopic: 2 },
        },
    },
]
