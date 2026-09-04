import { Contract, JsonRpcProvider, formatUnits } from 'ethers'

export const RPC_URL = process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL ?? 'https://rpc.cc3-testnet.creditcoin.network'
export const EXPLORER = process.env.NEXT_PUBLIC_CREDITCOIN_EXPLORER ?? 'https://creditcoin-testnet.blockscout.com'

/** Official Creditcoin ecosystem destinations, verified from creditcoin.org. */
export const ECOSYSTEM = {
    explorer: EXPLORER,
    penguinSwap: 'https://penguinswap.org',
    penguinBase: 'https://penguinbase.com',
    creditWallet: 'https://creditcoin.org/Credit-Wallet',
    attestcoinDocs: 'https://docs.attestcoin.org/',
} as const

/** Blockscout paths. Returns an empty string when no explorer is configured, so callers can skip the link. */
export function explorerUrl(kind: 'address' | 'tx' | 'token' | 'block', value: string | number) {
    return EXPLORER ? `${EXPLORER}/${kind}/${value}` : ''
}

export const ADDRESSES = {
    registry: process.env.NEXT_PUBLIC_CREDIT_REGISTRY_ADDRESS ?? '',
    asc: process.env.NEXT_PUBLIC_LENDING_HISTORY_ASC_ADDRESS ?? '',
    line: process.env.NEXT_PUBLIC_CREDIT_LINE_ADDRESS ?? '',
}

/** Until the contracts are deployed there is nothing to read, and the dashboard says so. */
export const isConfigured = Boolean(ADDRESSES.registry && ADDRESSES.line)

/**
 * Display names only. The authoritative table — pool addresses, event signatures, topic indexes —
 * lives in worker/protocols.ts and is written on-chain from there; this map exists so the UI can
 * label an id without reaching outside the Next app.
 */
export const PROTOCOL_NAMES: Record<number, string> = {
    0: 'Aave V3',
    1: 'Spark',
    2: 'Morpho Blue',
}

export const REGISTRY_ABI = [
    'function isKnown(address) view returns (bool)',
    'function scoreOf(address) view returns (uint16)',
    'function protocolCount(address) view returns (uint8)',
    'function profileOf(address) view returns (tuple(uint32 repayments, uint32 borrows, uint32 liquidations, uint32 defaults, uint64 firstSeenBlock, uint64 lastCountedBlock, uint32 protocols))',
]

export const LINE_ABI = [
    'function asset() view returns (address)',
    'function MIN_SCORE() view returns (uint16)',
    'function BORROW_APR_BPS() view returns (uint256)',
    'function creditLimit(address) view returns (uint256)',
    'function amountOwed(address) view returns (uint256)',
    'function loans(address) view returns (uint128 principal, uint128 repaid, uint64 startBlock, uint64 dueBlock, bool active)',
    'function totalAssets() view returns (uint256)',
    'function totalPrincipal() view returns (uint256)',
    'function availableLiquidity() view returns (uint256)',
    'function utilisationBps() view returns (uint256)',
    'function supplyAprBps() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function convertToAssets(uint256) view returns (uint256)',
    'function maxWithdraw(address) view returns (uint256)',
    'function borrow(uint256)',
    'function repay(uint256)',
    'function deposit(uint256 assets, address receiver) returns (uint256)',
    'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
]

export const ASC_ABI = [
    'event HistoryProved(address indexed user, uint16 protocolId, uint8 action, uint64 sourceBlock, bytes32 queryId)',
]

export const ERC20_ABI = [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function balanceOf(address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
]

export const ACTION_LABELS = ['Repay', 'Liquidation', 'Borrow'] as const

export type Profile = {
    repayments: number
    borrows: number
    liquidations: number
    defaults: number
    firstSeenBlock: number
    lastCountedBlock: number
    protocolCount: number
}

export type HistoryEntry = {
    protocolId: number
    action: number
    sourceBlock: number
    queryId: string
    /** The Creditcoin transaction that carried the proof — links straight into the explorer. */
    txHash: string
}

export type Snapshot = {
    demo: boolean
    known: boolean
    score: number
    minScore: number
    profile: Profile
    limit: bigint
    owed: bigint
    loan: { principal: bigint; repaid: bigint; dueBlock: number; active: boolean }
    vault: {
        totalAssets: bigint
        totalPrincipal: bigint
        availableLiquidity: bigint
        utilisationBps: number
        supplyAprBps: number
        borrowAprBps: number
        shares: bigint
        shareValue: bigint
        maxWithdraw: bigint
    }
    asset: { address: string; symbol: string; decimals: number; balance: bigint }
    history: HistoryEntry[]
    /** Set when the chain answered but the history log query did not. */
    historyError?: string
}

export function provider() {
    return new JsonRpcProvider(RPC_URL)
}

/** Score bands mirror CreditLine.creditLimit — keep the two in step. */
export function tierOf(score: number, minScore: number) {
    if (score < minScore) return { label: 'No credit line', multiplier: 0 }
    if (score < 600) return { label: 'Thin file', multiplier: 1 }
    if (score < 700) return { label: 'Established', multiplier: 2 }
    if (score < 800) return { label: 'Strong', multiplier: 5 }
    return { label: 'Prime', multiplier: 10 }
}

export function formatAmount(value: bigint, decimals: number, maximumFractionDigits = 2) {
    return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits })
}

export function formatPercent(bps: number) {
    return `${(bps / 100).toFixed(2)}%`
}

export function shorten(value: string) {
    return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}

/** ~30 days of Ethereum blocks, used to describe how long a file has been open. */
const BLOCKS_PER_MONTH = 7200 * 30

export function historySpan(profile: Profile) {
    if (!profile.firstSeenBlock || profile.lastCountedBlock <= profile.firstSeenBlock) return '—'
    const months = (profile.lastCountedBlock - profile.firstSeenBlock) / BLOCKS_PER_MONTH
    return months < 1 ? '< 1 month' : `${Math.floor(months)} months`
}

const DEMO: Snapshot = {
    demo: true,
    known: true,
    score: 742,
    minScore: 500,
    profile: {
        repayments: 14,
        borrows: 17,
        liquidations: 0,
        defaults: 0,
        firstSeenBlock: 19_204_881,
        lastCountedBlock: 21_948_306,
        protocolCount: 3,
    },
    limit: 500_000_000n,
    owed: 121_400_000n,
    loan: { principal: 120_000_000n, repaid: 0n, dueBlock: 4_112_900, active: true },
    vault: {
        totalAssets: 1_000_000_000_000n,
        totalPrincipal: 412_000_000_000n,
        availableLiquidity: 588_000_000_000n,
        utilisationBps: 4120,
        supplyAprBps: 412,
        borrowAprBps: 1000,
        shares: 25_000_000_000n,
        shareValue: 25_640_000_000n,
        maxWithdraw: 25_640_000_000n,
    },
    asset: { address: '0x0000000000000000000000000000000000000000', symbol: 'tUSD', decimals: 6, balance: 4_200_000_000n },
    history: [
        { protocolId: 0, action: 0, sourceBlock: 21_948_306, queryId: '0x8f0ab391fcf8c145', txHash: '' },
        { protocolId: 2, action: 0, sourceBlock: 21_731_884, queryId: '0x092a78e3f7e4a61b', txHash: '' },
        { protocolId: 1, action: 2, sourceBlock: 21_502_117, queryId: '0xf53386ad295dfa9a', txHash: '' },
        { protocolId: 0, action: 0, sourceBlock: 20_884_002, queryId: '0xe413a321e8681d83', txHash: '' },
    ],
}

export function demoSnapshot(): Snapshot {
    return DEMO
}

export async function loadSnapshot(address: string): Promise<Snapshot> {
    if (!isConfigured) return DEMO

    const rpc = provider()
    const registry = new Contract(ADDRESSES.registry, REGISTRY_ABI, rpc)
    const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)

    const [known, score, rawProfile, protocolCount, minScore, limit, owed, rawLoan, assetAddress] = await Promise.all([
        registry.isKnown(address) as Promise<boolean>,
        registry.scoreOf(address) as Promise<bigint>,
        registry.profileOf(address),
        registry.protocolCount(address) as Promise<bigint>,
        line.MIN_SCORE() as Promise<bigint>,
        line.creditLimit(address) as Promise<bigint>,
        line.amountOwed(address) as Promise<bigint>,
        line.loans(address),
        line.asset() as Promise<string>,
    ])

    const [totalAssets, totalPrincipal, availableLiquidity, utilisationBps, supplyAprBps, borrowAprBps, shares, maxWithdraw] =
        await Promise.all([
            line.totalAssets() as Promise<bigint>,
            line.totalPrincipal() as Promise<bigint>,
            line.availableLiquidity() as Promise<bigint>,
            line.utilisationBps() as Promise<bigint>,
            line.supplyAprBps() as Promise<bigint>,
            line.BORROW_APR_BPS() as Promise<bigint>,
            line.balanceOf(address) as Promise<bigint>,
            line.maxWithdraw(address) as Promise<bigint>,
        ])

    const token = new Contract(assetAddress, ERC20_ABI, rpc)
    const [decimals, symbol, balance, shareValue] = await Promise.all([
        token.decimals() as Promise<bigint>,
        token.symbol() as Promise<string>,
        token.balanceOf(address) as Promise<bigint>,
        line.convertToAssets(shares) as Promise<bigint>,
    ])

    let history: HistoryEntry[] = []
    let historyError: string | undefined
    if (ADDRESSES.asc) {
        try {
            const asc = new Contract(ADDRESSES.asc, ASC_ABI, rpc)
            const logs = await asc.queryFilter(asc.filters.HistoryProved(address))
            history = logs
                .map((log) => {
                    const args = (log as unknown as { args: [string, bigint, bigint, bigint, string] }).args
                    return {
                        protocolId: Number(args[1]),
                        action: Number(args[2]),
                        sourceBlock: Number(args[3]),
                        queryId: args[4],
                        txHash: log.transactionHash,
                    }
                })
                .sort((a, b) => b.sourceBlock - a.sourceBlock)
        } catch (error) {
            // Public RPCs commonly cap eth_getLogs ranges. The score is still correct without this.
            historyError = error instanceof Error ? error.message : String(error)
        }
    }

    return {
        demo: false,
        known,
        score: Number(score),
        minScore: Number(minScore),
        profile: {
            repayments: Number(rawProfile[0]),
            borrows: Number(rawProfile[1]),
            liquidations: Number(rawProfile[2]),
            defaults: Number(rawProfile[3]),
            firstSeenBlock: Number(rawProfile[4]),
            lastCountedBlock: Number(rawProfile[5]),
            protocolCount: Number(protocolCount),
        },
        limit,
        owed,
        loan: {
            principal: rawLoan[0] as bigint,
            repaid: rawLoan[1] as bigint,
            dueBlock: Number(rawLoan[3]),
            active: rawLoan[4] as boolean,
        },
        vault: {
            totalAssets,
            totalPrincipal,
            availableLiquidity,
            utilisationBps: Number(utilisationBps),
            supplyAprBps: Number(supplyAprBps),
            borrowAprBps: Number(borrowAprBps),
            shares,
            shareValue,
            maxWithdraw,
        },
        asset: { address: assetAddress, symbol, decimals: Number(decimals), balance },
        history,
        historyError,
    }
}
