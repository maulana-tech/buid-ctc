import { Contract, JsonRpcProvider, ZeroAddress, formatUnits, isAddress } from 'ethers'

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
    market: process.env.NEXT_PUBLIC_SHARE_MARKET_ADDRESS ?? '',
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

/** Etherscan, for linking an attested entry back to the source chain it came from. */
export const SOURCE_EXPLORERS: Record<number, { name: string; url: string }> = {
    3: { name: 'Ethereum', url: 'https://etherscan.io' },
    1: { name: 'Sepolia', url: 'https://sepolia.etherscan.io' },
}

export function sourceExplorerUrl(chainKey: number, kind: 'block' | 'address' | 'tx', value: string | number) {
    const explorer = SOURCE_EXPLORERS[chainKey]
    return explorer ? `${explorer.url}/${kind}/${value}` : ''
}

/** Pool addresses, so a proof can be traced to the exact contract that emitted it. */
export const PROTOCOL_POOLS: Record<number, string> = {
    0: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    1: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
    2: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
}

export const REGISTRY_ABI = [
    'function isKnown(address) view returns (bool)',
    'function setCommitment(uint256 commitment)',
    'function commitmentOf(address) view returns (uint256)',
    'function merklePath(address user) view returns (uint256[16] siblings, uint32 index, uint256 currentRoot)',
    'function root() view returns (uint256)',
    'function isKnownRoot(uint256) view returns (bool)',
    'function nullifierDefaults(uint256) view returns (uint32)',
    'event CommitmentSet(address indexed user, uint256 commitment)',
    'function scoreOf(address) view returns (uint16)',
    'function protocolCount(address) view returns (uint8)',
    'function profileOf(address) view returns (tuple(uint32 repayments, uint32 borrows, uint32 liquidations, uint32 defaults, uint64 firstSeenBlock, uint64 lastCountedBlock, uint32 protocols))',
    'event RepaymentRecorded(address indexed user, uint16 protocolId, uint64 sourceBlock, uint16 newScore)',
    'event RepaymentSkipped(address indexed user, uint64 sourceBlock, string reason)',
    'event LiquidationRecorded(address indexed user, uint16 protocolId, uint64 sourceBlock, uint16 newScore)',
]

export const LINE_ABI = [
    'function borrowPrivate(uint256 amount, uint16 threshold, uint256 root, uint256 nullifier, bytes proof)',
    'function limitForScore(uint16 score) view returns (uint256)',
    'function privateNullifier(address) view returns (uint256)',
    'function nullifierHasLoan(uint256) view returns (bool)',
    'event BorrowedPrivately(address indexed borrower, uint256 indexed nullifier, uint16 threshold, uint256 amount)',
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
    'function totalSupply() view returns (uint256)',
    'function TERM_BLOCKS() view returns (uint64)',
    'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
    'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
    'event Repaid(address indexed borrower, uint256 amount, bool closed)',
    'event Defaulted(address indexed borrower, uint256 shortfall)',
    'event Borrowed(address indexed borrower, uint256 amount, uint16 score, uint64 dueBlock)',
]

export const MARKET_ABI = [
    'function openOffers() view returns (uint256[])',
    'function offers(uint256) view returns (tuple(address seller, uint128 shares, uint128 askAssets, bool active))',
    'function navOf(uint256) view returns (uint256)',
    'function list(uint128 shares, uint128 askAssets) returns (uint256)',
    'function cancel(uint256)',
    'function fill(uint256)',
    'function fillPartial(uint256 id, uint128 sharesToBuy)',
    'event Filled(uint256 indexed id, address indexed seller, address indexed buyer, uint128 shares, uint128 paidAssets)',
    'event PartiallyFilled(uint256 indexed id, address indexed buyer, uint128 shares, uint128 paidAssets, uint128 remainingShares)',
    'event Listed(uint256 indexed id, address indexed seller, uint128 shares, uint128 askAssets)',
    'event Cancelled(uint256 indexed id, address indexed seller)',
]

export const ASC_ABI = [
    'event HistoryProved(address indexed user, uint16 protocolId, uint8 action, uint64 sourceBlock, bytes32 queryId)',
    'function submit(uint16 protocolId, uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, tuple(bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots)',
]

export const ERC20_ABI = [
    // TestUSD mints freely on purpose — it is a testnet stand-in, and without a faucet nobody can
    // try supplying or repaying.
    'function mint(address,uint256)',
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
    chainKey: number
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
    loan: { principal: bigint; repaid: bigint; dueBlock: number; active: boolean; private: boolean }
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

/** Creditcoin's RPC times out at 10s; 10k blocks answers comfortably, 50k does not. */
const LOG_CHUNK = 9_000

/** Block the contracts were deployed at. Written by the deploy script; scanning below it is waste. */
const DEPLOY_BLOCK = Number(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0)

/** How far back to look when the deploy block is unknown — about a week of Creditcoin blocks. */
const DEFAULT_LOOKBACK = 50_000

/**
 * Reads logs in bounded windows, newest first.
 *
 * `queryFilter` with no range asks for block 0 to latest, which the public RPC refuses outright.
 * That failure only appears once the contracts are on a real network — locally, Anvil answers it
 * instantly and the bug stays invisible.
 */
async function queryLogsChunked(contract: Contract, filter: unknown, rpc: JsonRpcProvider) {
    const head = await rpc.getBlockNumber()
    const floor = DEPLOY_BLOCK > 0 ? DEPLOY_BLOCK : Math.max(0, head - DEFAULT_LOOKBACK)

    const collected = []
    for (let end = head; end >= floor; end -= LOG_CHUNK) {
        const start = Math.max(floor, end - LOG_CHUNK + 1)
        try {
            collected.push(...(await contract.queryFilter(filter as never, start, end)))
        } catch {
            // A window the RPC will not serve is not evidence the range is empty; skip it.
        }
        if (start === floor) break
    }
    return collected
}

/** Score bands mirror CreditLine.creditLimit — keep the two in step. */
/** Mirrors CreditRegistry's constants. The breakdown below must add up to what scoreOf() returns. */
export const SCORE = {
    base: 300,
    max: 1000,
    perRepayment: 25,
    maxCountedRepayments: 20,
    perAgeStep: 10,
    maxAgeBonus: 100,
    minBlockGap: 7200,
    blocksPerAgeStep: 7200 * 30,
    liquidation: 150,
    default: 300,
} as const

/** Score bands as CreditLine tiers them; `from` is the score that opens each band. */
export const BANDS = [
    { from: 0, label: 'No credit line', multiplier: 0 },
    { from: 500, label: 'Thin file', multiplier: 1 },
    { from: 600, label: 'Established', multiplier: 2 },
    { from: 700, label: 'Strong', multiplier: 5 },
    { from: 800, label: 'Prime', multiplier: 10 },
] as const

/**
 * The registry's formula, component by component, so the passport can say *why* a score is what
 * it is and what would move it. Kept in lockstep with CreditRegistry.scoreOf().
 */
export function scoreBreakdown(profile: Profile, known: boolean) {
    if (!known) return { base: 0, repayments: 0, age: 0, liquidations: 0, defaults: 0, total: 0, counted: 0, ageSteps: 0 }
    const counted = Math.min(profile.repayments, SCORE.maxCountedRepayments)
    const ageSteps =
        profile.lastCountedBlock > profile.firstSeenBlock ? Math.floor((profile.lastCountedBlock - profile.firstSeenBlock) / SCORE.blocksPerAgeStep) : 0
    const age = Math.min(ageSteps * SCORE.perAgeStep, SCORE.maxAgeBonus)
    const positive = SCORE.base + counted * SCORE.perRepayment + age
    const liquidations = profile.liquidations * SCORE.liquidation
    const defaults = profile.defaults * SCORE.default
    const penalty = liquidations + defaults
    const total = penalty >= positive ? 0 : Math.min(positive - penalty, SCORE.max)
    return { base: SCORE.base, repayments: counted * SCORE.perRepayment, age, liquidations, defaults, total, counted, ageSteps }
}

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
    loan: { principal: 120_000_000n, repaid: 0n, dueBlock: 4_112_900, active: true, private: false },
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
        { protocolId: 0, action: 0, sourceBlock: 21_948_306, chainKey: 3, queryId: '0x8f0ab391fcf8c145', txHash: '' },
        { protocolId: 2, action: 0, sourceBlock: 21_731_884, chainKey: 3, queryId: '0x092a78e3f7e4a61b', txHash: '' },
        { protocolId: 1, action: 2, sourceBlock: 21_502_117, chainKey: 3, queryId: '0xf53386ad295dfa9a', txHash: '' },
        { protocolId: 0, action: 0, sourceBlock: 20_884_002, chainKey: 3, queryId: '0xe413a321e8681d83', txHash: '' },
    ],
}

export function demoSnapshot(): Snapshot {
    return DEMO
}

export type Offer = {
    id: number
    seller: string
    shares: bigint
    askAssets: bigint
    nav: bigint
    /** Negative means the seller is asking below what the vault would redeem for. */
    discountBps: number
}

/** What the connected wallet can actually trade with — not the address being looked up. */
export type MarketViewer = {
    address: string
    shares: bigint
    shareValue: bigint
    assetBalance: bigint
}

export type Market = {
    offers: Offer[]
    /** Assets one whole share redeems for. The number every price on the page is judged against. */
    sharePrice: bigint
    decimals: number
    symbol: string
    viewer: MarketViewer | null
    demo: boolean
}

/**
 * The open book plus the viewer's own position.
 *
 * `viewer` is deliberately the **connected wallet**, not the address in the lookup bar. Selling and
 * buying spend the wallet's balance, so showing anyone else's position next to those buttons would
 * be quietly wrong.
 */
export async function loadMarket(viewer?: string | null): Promise<Market> {
    if (!isConfigured || !ADDRESSES.market) {
        return { ...DEMO_MARKET, viewer: viewer ? DEMO_MARKET.viewer : null }
    }

    try {
        const rpc = provider()
        const market = new Contract(ADDRESSES.market, MARKET_ABI, rpc)
        const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)

        const [ids, assetAddress] = await Promise.all([
            market.openOffers() as Promise<bigint[]>,
            line.asset() as Promise<string>,
        ])

        if (!assetAddress || !isAddress(assetAddress)) return { ...DEMO_MARKET, viewer: viewer ? DEMO_MARKET.viewer : null }

        const token = new Contract(assetAddress, ERC20_ABI, rpc)
    const [decimals, symbol] = await Promise.all([token.decimals() as Promise<bigint>, token.symbol() as Promise<string>])
    const unit = 10n ** BigInt(decimals)
    const sharePrice = (await line.convertToAssets(unit)) as bigint

    const offers = await Promise.all(
        ids.map(async (id) => {
            const [offer, nav] = await Promise.all([market.offers(id), market.navOf(id) as Promise<bigint>])
            const shares = offer[1] as bigint
            const askAssets = offer[2] as bigint
            return {
                id: Number(id),
                seller: offer[0] as string,
                shares,
                askAssets,
                nav,
                discountBps: nav === 0n ? 0 : Number(((nav - askAssets) * 10_000n) / nav),
            }
        })
    )

    let position: MarketViewer | null = null
    if (viewer) {
        const [shares, assetBalance] = await Promise.all([
            line.balanceOf(viewer) as Promise<bigint>,
            token.balanceOf(viewer) as Promise<bigint>,
        ])
        position = {
            address: viewer,
            shares,
            shareValue: (await line.convertToAssets(shares)) as bigint,
            assetBalance,
        }
    }

    return {
        offers: offers.sort((a, b) => b.discountBps - a.discountBps),
        sharePrice,
        decimals: Number(decimals),
        symbol,
        viewer: position,
        demo: false,
    }
    } catch {
        return { ...DEMO_MARKET, viewer: viewer ? DEMO_MARKET.viewer : null }
    }
}

/**
 * Turn "I want to spend X" into a plan against the book: cheapest offers first, partial on the last.
 * Every fill is at that offer's listed per-share price — nothing here is a curve.
 */
export type BuyPlan = {
    legs: { offer: Offer; shares: bigint; cost: bigint }[]
    totalShares: bigint
    totalCost: bigint
    /** Spend the book could not absorb, when the request exceeds every open offer combined. */
    unfilled: bigint
}

export function planBuy(spend: bigint, offers: Offer[]): BuyPlan {
    const legs: BuyPlan['legs'] = []
    let remaining = spend
    let totalShares = 0n
    let totalCost = 0n

    for (const offer of offers) {
        if (remaining <= 0n) break
        if (offer.shares === 0n || offer.askAssets === 0n) continue

        if (remaining >= offer.askAssets) {
            legs.push({ offer, shares: offer.shares, cost: offer.askAssets })
            remaining -= offer.askAssets
            totalShares += offer.shares
            totalCost += offer.askAssets
        } else {
            // Partial: how many shares does `remaining` buy at this offer's price, rounding the
            // share count down so the contract's round-up on cost cannot exceed what we quoted.
            const shares = (remaining * offer.shares) / offer.askAssets
            if (shares === 0n) break
            const cost = (offer.askAssets * shares + offer.shares - 1n) / offer.shares
            legs.push({ offer, shares, cost })
            remaining -= cost
            totalShares += shares
            totalCost += cost
        }
    }

    return { legs, totalShares, totalCost, unfilled: remaining > 0n ? remaining : 0n }
}

export type PricePoint = { block: number; time: number; price: bigint }
export type Trade = { block: number; time: number; shares: bigint; paid: bigint; pricePerShare: bigint; txHash: string }

export type PriceHistory = {
    /** What one share redeemed for in the vault, sampled across the window. */
    nav: PricePoint[]
    /** What buyers actually paid on the market. */
    trades: Trade[]
    decimals: number
    fromBlock: number
    toBlock: number
}

/**
 * Redemption value over time plus market trades.
 *
 * NAV is sampled with historical `eth_call`s rather than reconstructed from events: the number the
 * vault reports at a block is the number, and a public RPC serves thirty of those far more happily
 * than one unbounded log query. It only moves when a loan is repaid or defaults, so a step chart is
 * the honest shape.
 */
export async function loadPriceHistory(points = 30): Promise<PriceHistory> {
    if (!isConfigured || !ADDRESSES.market) return DEMO_HISTORY

    const rpc = provider()
    const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)
    const market = new Contract(ADDRESSES.market, MARKET_ABI, rpc)

    const head = await rpc.getBlockNumber()
    const from = DEPLOY_BLOCK > 0 ? DEPLOY_BLOCK : Math.max(0, head - DEFAULT_LOOKBACK)
    const decimals = Number(await new Contract(await line.asset(), ERC20_ABI, rpc).decimals())
    const unit = 10n ** BigInt(decimals)

    const step = Math.max(1, Math.floor((head - from) / (points - 1)))
    const blocks = Array.from({ length: points }, (_, i) => Math.min(head, from + i * step))
    if (blocks[blocks.length - 1] !== head) blocks.push(head)

    // Block timestamps come from the chain, so the time axis is real time — not block numbers
    // dressed up as dates.
    const timeOf = async (block: number) => Number((await rpc.getBlock(block))?.timestamp ?? 0)

    const nav = await Promise.all(
        blocks.map(async (block) => {
            try {
                const [price, time] = await Promise.all([
                    line.convertToAssets(unit, { blockTag: block }) as Promise<bigint>,
                    timeOf(block),
                ])
                return { block, time, price }
            } catch {
                // Before the vault existed there is no price. Skip rather than invent one.
                return null
            }
        })
    )

    const [fills, partials] = await Promise.all([
        queryLogsChunked(market, market.filters.Filled(), rpc),
        queryLogsChunked(market, market.filters.PartiallyFilled(), rpc),
    ])
    const trades: Trade[] = (
        await Promise.all(
            [...fills, ...partials].map(async (log) => {
                const args = (log as unknown as { args: unknown[] }).args
                const isPartial = (log as unknown as { fragment: { name: string } }).fragment.name === 'PartiallyFilled'
                const shares = (isPartial ? args[2] : args[3]) as bigint
                const paid = (isPartial ? args[3] : args[4]) as bigint
                return {
                    block: log.blockNumber,
                    time: await timeOf(log.blockNumber),
                    shares,
                    paid,
                    pricePerShare: shares === 0n ? 0n : (paid * unit) / shares,
                    txHash: log.transactionHash,
                }
            })
        )
    ).sort((a, b) => a.block - b.block)

    return {
        nav: nav.filter((p): p is PricePoint => p !== null),
        trades,
        decimals,
        fromBlock: from,
        toBlock: head,
    }
}

const DEMO_HISTORY: PriceHistory = {
    decimals: 6,
    fromBlock: 5_400_000,
    toBlock: 5_444_000,
    nav: Array.from({ length: 30 }, (_, i) => ({
        block: 5_400_000 + i * 1_500,
        time: 1_756_000_000 + i * 22_500, // ~15s blocks, ~6h apart
        price: 1_000_000n + BigInt([0, 0, 0, 4, 4, 4, 4, 9, 9, 9, 9, 9, 14, 14, 14, 14, 14, 14, 14, 19, 19, 19, 19, 19, 19, 19, 26, 26, 26, 26][i]) * 1_000n,
    })),
    trades: [
        { block: 5_412_000, time: 1_756_180_000, shares: 25_000_000_000n, paid: 24_350_000_000n, pricePerShare: 974_000n, txHash: '' },
        { block: 5_431_500, time: 1_756_472_500, shares: 5_000_000_000n, paid: 5_045_000_000n, pricePerShare: 1_009_000n, txHash: '' },
    ],
}

/** The connected wallet's vault position, with what it has actually earned. */
export type VaultPosition = {
    address: string
    shares: bigint
    shareValue: bigint
    /** Assets put in minus assets taken out, from the vault's own Deposit/Withdraw events. */
    netDeposited: bigint
    /**
     * Weighted average share price this wallet deposited at, from its Deposit events. Null when it
     * never deposited — shares bought on the market have an entry price the vault never saw.
     */
    entryPrice: bigint | null
    /**
     * shares × (current share price − entry price). Per share held, not cash-flow based, so shares
     * moved into market escrow or sold do not show up as a loss. Negative only after a default has
     * been written off against depositors. Null when the entry price is unknown.
     */
    earned: bigint | null
    maxWithdraw: bigint
    assetBalance: bigint
    deposits: number
    withdrawals: number
}

/**
 * Cost basis comes from the vault's ERC4626 events rather than a stored number: the vault does not
 * keep one per depositor, and an off-chain ledger would be one more thing to trust. Shares bought
 * on the market show up here as value without a deposit — which is correct, the buyer paid the
 * seller, not the vault.
 */
export async function loadVaultPosition(address: string): Promise<VaultPosition> {
    if (!isConfigured) return DEMO_POSITION

    try {
        const rpc = provider()
        const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)
        const assetAddress = await line.asset() as string
        if (!assetAddress || !isAddress(assetAddress)) return DEMO_POSITION
        const token = new Contract(assetAddress, ERC20_ABI, rpc)

        const [shares, maxWithdraw, assetBalance, depositLogs, withdrawLogs] = await Promise.all([
            line.balanceOf(address) as Promise<bigint>,
            line.maxWithdraw(address) as Promise<bigint>,
            token.balanceOf(address) as Promise<bigint>,
            queryLogsChunked(line, line.filters.Deposit(null, address), rpc),
            queryLogsChunked(line, line.filters.Withdraw(null, null, address), rpc),
        ])
        const shareValue = (await line.convertToAssets(shares)) as bigint

        const sum = (logs: unknown[], index: number) =>
            logs.reduce<bigint>((acc, log) => acc + ((log as { args: unknown[] }).args[index] as bigint), 0n)
        const assetsIn = sum(depositLogs, 2)
        const sharesIn = sum(depositLogs, 3)
        const netDeposited = assetsIn - sum(withdrawLogs, 3)

        const decimals = BigInt(await token.decimals())
        const unit = 10n ** decimals
        const entryPrice = sharesIn > 0n ? (assetsIn * unit) / sharesIn : null
        const earned = entryPrice === null ? null : shareValue - (shares * entryPrice) / unit

        return {
            address,
            shares,
            shareValue,
            netDeposited,
            entryPrice,
            earned,
            maxWithdraw,
            assetBalance,
            deposits: depositLogs.length,
            withdrawals: withdrawLogs.length,
        }
    } catch {
        return DEMO_POSITION
    }
}

const DEMO_POSITION: VaultPosition = {
    address: '0x0000000000000000000000000000000000000000',
    shares: 25_000_000_000n,
    shareValue: 25_650_000_000n,
    netDeposited: 25_000_000_000n,
    entryPrice: 1_000_000n,
    earned: 650_000_000n,
    maxWithdraw: 25_650_000_000n,
    assetBalance: 4_200_000_000n,
    deposits: 2,
    withdrawals: 0,
}

/** Vault-level history: what one share redeemed for, and how much the vault held, over the window. */
export type VaultHistory = {
    points: { time: number; block: number; sharePrice: bigint; totalAssets: bigint; utilisationBps: number }[]
    events: { time: number; kind: 'repaid' | 'defaulted'; amount: bigint; txHash: string }[]
    decimals: number
}

export async function loadVaultHistory(samples = 40): Promise<VaultHistory> {
    if (!isConfigured) return DEMO_VAULT_HISTORY

    try {
        const rpc = provider()
        const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)
        const assetAddress = await line.asset() as string
        if (!assetAddress || !isAddress(assetAddress)) return DEMO_VAULT_HISTORY
        const decimals = Number(await new Contract(assetAddress, ERC20_ABI, rpc).decimals())
    const unit = 10n ** BigInt(decimals)

    const head = await rpc.getBlockNumber()
    const from = DEPLOY_BLOCK > 0 ? DEPLOY_BLOCK : Math.max(0, head - DEFAULT_LOOKBACK)
    const step = Math.max(1, Math.floor((head - from) / (samples - 1)))
    const blocks = Array.from({ length: samples }, (_, i) => Math.min(head, from + i * step))
    if (blocks[blocks.length - 1] !== head) blocks.push(head)

    const points = (
        await Promise.all(
            blocks.map(async (block) => {
                try {
                    const [sharePrice, totalAssets, utilisationBps, blk] = await Promise.all([
                        line.convertToAssets(unit, { blockTag: block }) as Promise<bigint>,
                        line.totalAssets({ blockTag: block }) as Promise<bigint>,
                        line.utilisationBps({ blockTag: block }) as Promise<bigint>,
                        rpc.getBlock(block),
                    ])
                    return { time: Number(blk?.timestamp ?? 0), block, sharePrice, totalAssets, utilisationBps: Number(utilisationBps) }
                } catch {
                    return null
                }
            })
        )
    ).filter((p): p is NonNullable<typeof p> => p !== null)

    const [repaid, defaulted] = await Promise.all([
        queryLogsChunked(line, line.filters.Repaid(), rpc),
        queryLogsChunked(line, line.filters.Defaulted(), rpc),
    ])
    const events = await Promise.all(
        [
            ...repaid.map((l) => ({ log: l, kind: 'repaid' as const })),
            ...defaulted.map((l) => ({ log: l, kind: 'defaulted' as const })),
        ].map(async ({ log, kind }) => ({
            time: Number((await rpc.getBlock(log.blockNumber))?.timestamp ?? 0),
            kind,
            amount: (log as unknown as { args: unknown[] }).args[1] as bigint,
            txHash: log.transactionHash,
        }))
    )

    return { points, events: events.sort((a, b) => a.time - b.time), decimals }
    } catch {
        return DEMO_VAULT_HISTORY
    }
}

const DEMO_VAULT_HISTORY: VaultHistory = {
    decimals: 6,
    points: Array.from({ length: 40 }, (_, i) => ({
        time: 1_756_000_000 + i * 21_600,
        block: 5_400_000 + i * 1_440,
        sharePrice: 1_000_000n + BigInt(Math.floor(i * i * 16)) ,
        totalAssets: 1_000_000_000_000n + BigInt(i) * 12_500_000_000n,
        utilisationBps: Math.min(6000, 800 + i * 140),
    })),
    events: [
        { time: 1_756_216_000, kind: 'repaid', amount: 120_000_000n, txHash: '' },
        { time: 1_756_540_000, kind: 'repaid', amount: 310_000_000n, txHash: '' },
    ],
}

export type ActivityKind =
    | 'proved'
    | 'deposit'
    | 'withdraw'
    | 'borrow'
    | 'repay'
    | 'default'
    | 'listed'
    | 'cancelled'
    | 'sold'
    | 'bought'

export type Activity = {
    kind: ActivityKind
    time: number
    block: number
    txHash: string
    /** Primary amount in asset units, or shares for market/vault share events. */
    amount: bigint
    /** What the amount is denominated in. */
    unit: 'asset' | 'shares'
    detail: string
}

export type Portfolio = {
    headBlock: number
    activity: Activity[]
}

/**
 * Everything the wallet has done across the registry, the vault and the market, as one timeline.
 *
 * Merged from each contract's own events rather than a stored per-user log: the contracts do not
 * keep one, and an off-chain ledger would be one more thing to trust. Newest first.
 */
export async function loadPortfolio(wallet: string): Promise<Portfolio> {
    if (!isConfigured) return DEMO_PORTFOLIO

    try {
        const rpc = provider()
        const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)
        const market = new Contract(ADDRESSES.market, MARKET_ABI, rpc)
        const asc = new Contract(ADDRESSES.asc, ASC_ABI, rpc)

    const [headBlock, deposits, withdrawals, borrows, repays, defaults, listed, cancelled, sold, boughtWhole, boughtPart, proved] =
        await Promise.all([
            rpc.getBlockNumber(),
            queryLogsChunked(line, line.filters.Deposit(null, wallet), rpc),
            queryLogsChunked(line, line.filters.Withdraw(null, null, wallet), rpc),
            queryLogsChunked(line, line.filters.Borrowed(wallet), rpc),
            queryLogsChunked(line, line.filters.Repaid(wallet), rpc),
            queryLogsChunked(line, line.filters.Defaulted(wallet), rpc),
            ADDRESSES.market ? queryLogsChunked(market, market.filters.Listed(null, wallet), rpc) : [],
            ADDRESSES.market ? queryLogsChunked(market, market.filters.Cancelled(null, wallet), rpc) : [],
            ADDRESSES.market ? queryLogsChunked(market, market.filters.Filled(null, wallet), rpc) : [],
            ADDRESSES.market ? queryLogsChunked(market, market.filters.Filled(null, null, wallet), rpc) : [],
            ADDRESSES.market ? queryLogsChunked(market, market.filters.PartiallyFilled(null, wallet), rpc) : [],
            ADDRESSES.asc ? queryLogsChunked(asc, asc.filters.HistoryProved(wallet), rpc) : [],
        ])

    type Log = { args: unknown[]; blockNumber: number; transactionHash: string }

    // PartiallyFilled indexes the buyer, not the seller, so a seller's partial sales are found
    // through the ids of their own offers. Few offers per wallet, so one query each is fine.
    const myOfferIds = listed.map((l) => (l as unknown as Log).args[0] as bigint)
    const soldPart = (
        await Promise.all(myOfferIds.map((id) => queryLogsChunked(market, market.filters.PartiallyFilled(id), rpc)))
    ).flat()

    const item = (log: unknown, kind: ActivityKind, amount: bigint, unit: Activity['unit'], detail: string) => {
        const l = log as Log
        return { kind, block: l.blockNumber, txHash: l.transactionHash, amount, unit, detail, time: 0 }
    }
    const a = (log: unknown, i: number) => (log as Log).args[i]

    const items: Activity[] = [
        ...deposits.map((l) => item(l, 'deposit', a(l, 2) as bigint, 'asset', `${formatAmount(a(l, 3) as bigint, 6)} shares minted`)),
        ...withdrawals.map((l) => item(l, 'withdraw', a(l, 3) as bigint, 'asset', `${formatAmount(a(l, 4) as bigint, 6)} shares burned`)),
        ...borrows.map((l) => item(l, 'borrow', a(l, 1) as bigint, 'asset', `score ${a(l, 2)} · due at block #${Number(a(l, 3)).toLocaleString()}`)),
        ...repays.map((l) => item(l, 'repay', a(l, 1) as bigint, 'asset', (a(l, 2) as boolean) ? 'loan closed' : 'partial repayment')),
        ...defaults.map((l) => item(l, 'default', a(l, 1) as bigint, 'asset', 'written off against depositors · −300 points')),
        ...listed.map((l) => item(l, 'listed', a(l, 2) as bigint, 'shares', `asking ${formatAmount(a(l, 3) as bigint, 6)} · offer #${a(l, 0)}`)),
        ...cancelled.map((l) => item(l, 'cancelled', 0n, 'shares', `offer #${a(l, 0)} — shares returned from escrow`)),
        ...sold.map((l) => item(l, 'sold', a(l, 3) as bigint, 'shares', `received ${formatAmount(a(l, 4) as bigint, 6)} from ${shorten(a(l, 2) as string)}`)),
        ...soldPart.map((l) => item(l, 'sold', a(l, 2) as bigint, 'shares', `received ${formatAmount(a(l, 3) as bigint, 6)} from ${shorten(a(l, 1) as string)} · partial, ${formatAmount(a(l, 4) as bigint, 6)} left on offer #${a(l, 0)}`)),
        ...boughtWhole.map((l) => item(l, 'bought', a(l, 3) as bigint, 'shares', `paid ${formatAmount(a(l, 4) as bigint, 6)} · offer #${a(l, 0)}`)),
        ...boughtPart.map((l) => item(l, 'bought', a(l, 2) as bigint, 'shares', `paid ${formatAmount(a(l, 3) as bigint, 6)} · partial, offer #${a(l, 0)}`)),
        ...proved.map((l) =>
            item(l, 'proved', 0n, 'asset', `${PROTOCOL_NAMES[Number(a(l, 1))] ?? 'protocol'} ${ACTION_LABELS[Number(a(l, 2))] ?? ''} · Ethereum block #${Number(a(l, 3)).toLocaleString()}`)
        ),
    ]

    // One timestamp fetch per distinct block, not per event.
    const blocks = [...new Set(items.map((i) => i.block))]
    const times = new Map(
        await Promise.all(blocks.map(async (b) => [b, Number((await rpc.getBlock(b))?.timestamp ?? 0)] as const))
    )
    for (const i of items) i.time = times.get(i.block) ?? 0

    return { headBlock, activity: items.sort((x, y) => y.block - x.block) }
    } catch {
        return DEMO_PORTFOLIO
    }
}

const DEMO_PORTFOLIO: Portfolio = {
    headBlock: 5_445_000,
    activity: [
        { kind: 'repay', time: 1_756_540_000, block: 5_444_100, txHash: '', amount: 120_000_000n, unit: 'asset', detail: 'partial repayment' },
        { kind: 'listed', time: 1_756_480_000, block: 5_440_200, txHash: '', amount: 25_000_000_000n, unit: 'shares', detail: 'asking 24,870 · offer #0' },
        { kind: 'borrow', time: 1_756_300_000, block: 5_428_000, txHash: '', amount: 120_000_000n, unit: 'asset', detail: 'score 742 · due at block #4,112,900' },
        { kind: 'deposit', time: 1_756_100_000, block: 5_414_000, txHash: '', amount: 25_000_000_000n, unit: 'asset', detail: '25,000 shares minted' },
        { kind: 'proved', time: 1_756_000_000, block: 5_407_000, txHash: '', amount: 0n, unit: 'asset', detail: 'Aave V3 Repay · Ethereum block #21,948,306' },
        { kind: 'proved', time: 1_755_990_000, block: 5_406_300, txHash: '', amount: 0n, unit: 'asset', detail: 'Morpho Blue Repay · Ethereum block #21,731,884' },
    ],
}

const DEMO_MARKET: Market = {
    sharePrice: 1_026_000n,
    decimals: 6,
    symbol: 'tUSD',
    demo: true,
    viewer: { address: '0x0000000000000000000000000000000000000000', shares: 25_000_000_000n, shareValue: 25_650_000_000n, assetBalance: 4_200_000_000n },
    offers: [
    {
        id: 0,
        seller: '0x7a3f4d1c2b9e8a5f6c0d3e2b1a9f8c7d6e5b4a30',
        shares: 25_000_000_000n,
        askAssets: 24_870_000_000n,
        nav: 25_640_000_000n,
        discountBps: 300,
    },
    {
        id: 1,
        seller: '0x3078a7b42dc121faea89e3cdac74f0b2f54546f7',
        shares: 5_000_000_000n,
        askAssets: 5_100_000_000n,
        nav: 5_128_000_000n,
        discountBps: 55,
    },
    ],
}

/** What /api/proof returns: the detected event plus the Attestcoin proof, ready for ASC.submit(). */
export type ProofPayload = {
    txHash: string
    protocolId: number
    protocolName: string
    action: number
    actionName: string
    borrower: string
    chainKey: number
    sourceBlock: number
    txBytes: string
    merkleRoot: string
    siblings: { hash: string; isLeft: boolean }[]
    lowerEndpointDigest: string
    continuityRoots: string[]
}

export async function fetchProof(txHash: string): Promise<ProofPayload> {
    const res = await fetch('/api/proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash }) })
    const body = (await res.json()) as ProofPayload & { error?: string }
    if (!res.ok) throw new Error(body.error ?? `Proof service answered ${res.status}`)
    return body
}

export type ProofOutcome = {
    txHash: string
    user: string
    /** Null when the action was not a repayment (borrows and liquidations are never rate-limited). */
    counted: boolean | null
    skipReason?: string
    scoreAfter: number | null
}

/**
 * Submit a proof from the connected wallet and read back what the registry did with it.
 * Gas estimation through pallet-evm sometimes fails on precompile calls even when the call would
 * succeed, so a failed estimate falls back to a formula rather than aborting.
 */
export async function submitProof(signer: import('ethers').Signer, p: ProofPayload): Promise<ProofOutcome> {
    const asc = new Contract(ADDRESSES.asc, ASC_ABI, signer)
    const registry = new Contract(ADDRESSES.registry, REGISTRY_ABI, signer)
    const args = [p.protocolId, p.action, p.chainKey, p.sourceBlock, p.txBytes, p.merkleRoot, p.siblings, p.lowerEndpointDigest, p.continuityRoots]

    let gasLimit: bigint
    try {
        gasLimit = ((await asc.submit.estimateGas(...args)) * 135n) / 100n
    } catch {
        gasLimit = BigInt(400_000 + p.continuityRoots.length * 5_000)
    }
    const tx = await asc.submit(...args, { gasLimit })
    const receipt = await tx.wait()

    let user = p.borrower
    let counted: boolean | null = p.action === 0 ? false : null
    let skipReason: string | undefined
    for (const log of receipt.logs as { topics: readonly string[]; data: string }[]) {
        try {
            const parsed = asc.interface.parseLog({ topics: [...log.topics], data: log.data }) ?? registry.interface.parseLog({ topics: [...log.topics], data: log.data })
            if (parsed?.name === 'HistoryProved') user = parsed.args[0] as string
            if (parsed?.name === 'RepaymentRecorded') counted = true
            if (parsed?.name === 'RepaymentSkipped') skipReason = parsed.args[2] as string
        } catch {
            // Precompile logs are not ours to decode.
        }
    }
    const scoreAfter = Number(await registry.scoreOf(user))
    return { txHash: tx.hash, user, counted, skipReason, scoreAfter }
}

/** Everything the private-credit page needs about one identity, read for the scored address. */
export type PrivateCredit = {
    known: boolean
    score: number
    /** Commitment currently on chain for the address; 0 when none. */
    commitment: bigint
    index: number
    siblings: bigint[]
    root: bigint
    defaults: number
    hasLoan: boolean
    /** Credit limit each band would grant, keyed by threshold. */
    limits: Record<number, bigint>
    minScore: number
}

export const BAND_THRESHOLDS = [500, 600, 700, 800] as const

export async function loadPrivateCredit(address: string, nullifier: bigint): Promise<PrivateCredit> {
    const rpc = provider()
    const registry = new Contract(ADDRESSES.registry, REGISTRY_ABI, rpc)
    const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)
    // A registry deployed before private credit has no commitmentOf(); say so instead of dumping
    // a CALL_EXCEPTION on the page.
    const commitment = (await (registry.commitmentOf(address) as Promise<bigint>).catch(() => null)) as bigint | null
    if (commitment === null) throw new Error('The deployed contracts predate private credit. Redeploy with `npm run deploy:testnet`.')
    const [known, score, defaults, hasLoan, minScore, ...limits] = await Promise.all([
        registry.isKnown(address) as Promise<boolean>,
        registry.scoreOf(address) as Promise<bigint>,
        registry.nullifierDefaults(nullifier) as Promise<bigint>,
        line.nullifierHasLoan(nullifier) as Promise<boolean>,
        line.MIN_SCORE() as Promise<bigint>,
        ...BAND_THRESHOLDS.map((t) => line.limitForScore(t) as Promise<bigint>),
    ])
    let index = 0
    let siblings: bigint[] = []
    let root = 0n
    if (known) {
        const path = (await registry.merklePath(address)) as [bigint[], bigint, bigint]
        siblings = [...path[0]]
        index = Number(path[1])
        root = path[2]
    }
    return {
        known,
        score: Number(score),
        commitment,
        index,
        siblings,
        root,
        defaults: Number(defaults),
        hasLoan,
        minScore: Number(minScore),
        limits: Object.fromEntries(BAND_THRESHOLDS.map((t, i) => [t, limits[i] as bigint])),
    }
}

export type DirectoryEntry = {
    address: string
    score: number
    repayments: number
    liquidations: number
    protocolCount: number
}

/**
 * Every address the registry has scored, newest activity first.
 *
 * Read from events rather than a contract-side index: an on-chain array would cost every writer gas
 * forever to serve a page nobody has to trust. The registry stays a lookup; discovery lives here.
 */
export async function loadDirectory(limit = 50): Promise<DirectoryEntry[]> {
    if (!isConfigured) return DEMO_DIRECTORY

    try {
        const rpc = provider()
        const registry = new Contract(ADDRESSES.registry, REGISTRY_ABI, rpc)

    const [repayments, liquidations] = await Promise.all([
        queryLogsChunked(registry, registry.filters.RepaymentRecorded(), rpc),
        queryLogsChunked(registry, registry.filters.LiquidationRecorded(), rpc),
    ])

    const seen = new Map<string, number>()
    for (const log of [...repayments, ...liquidations]) {
        const user = (log as unknown as { args: [string] }).args[0]
        seen.set(user, Math.max(seen.get(user) ?? 0, log.blockNumber))
    }

    const addresses = [...seen.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([address]) => address)

    return Promise.all(
        addresses.map(async (address) => {
            const [score, profile, protocolCount] = await Promise.all([
                registry.scoreOf(address) as Promise<bigint>,
                registry.profileOf(address),
                registry.protocolCount(address) as Promise<bigint>,
            ])
            return {
                address,
                score: Number(score),
                repayments: Number(profile[0]),
                liquidations: Number(profile[2]),
                protocolCount: Number(protocolCount),
            }
        })
    )
    } catch {
        return DEMO_DIRECTORY
    }
}

const DEMO_DIRECTORY: DirectoryEntry[] = [
    { address: '0x7a3f4d1c2b9e8a5f6c0d3e2b1a9f8c7d6e5b4a30', score: 742, repayments: 14, liquidations: 0, protocolCount: 3 },
    { address: '0x3078a7b42dc121faea89e3cdac74f0b2f54546f7', score: 615, repayments: 11, liquidations: 0, protocolCount: 2 },
    { address: '0x8297492d220371015398fd063382e827cf741070', score: 540, repayments: 9, liquidations: 1, protocolCount: 1 },
    { address: '0x3b7e7b3a5d441860713431fbc42fe33db4345752', score: 325, repayments: 1, liquidations: 0, protocolCount: 1 },
]

export async function loadSnapshot(address: string): Promise<Snapshot> {
    if (!isConfigured) return DEMO

    const rpc = provider()
    const registry = new Contract(ADDRESSES.registry, REGISTRY_ABI, rpc)
    const line = new Contract(ADDRESSES.line, LINE_ABI, rpc)

    let known: boolean
    let score: bigint
    let rawProfile: [bigint, bigint, bigint, bigint, bigint, bigint]
    let protocolCount: bigint
    let minScore: bigint
    let limit: bigint
    let owed: bigint
    let rawLoan: readonly unknown[]
    let assetAddress: string
    let totalAssets: bigint
    let totalPrincipal: bigint
    let availableLiquidity: bigint
    let utilisationBps: bigint
    let supplyAprBps: bigint
    let borrowAprBps: bigint
    let shares: bigint
    let maxWithdraw: bigint
    let privateNullifier = 0n

    try {
        ;[known, score, rawProfile, protocolCount, minScore, limit, owed, rawLoan, assetAddress] = await Promise.all([
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
        privateNullifier = (await line.privateNullifier(address).catch(() => 0n)) as bigint

        if (!assetAddress || !isAddress(assetAddress)) return DEMO

        ;[totalAssets, totalPrincipal, availableLiquidity, utilisationBps, supplyAprBps, borrowAprBps, shares, maxWithdraw] =
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
    } catch {
        return DEMO
    }

    const token = new Contract(assetAddress, ERC20_ABI, rpc)
    const [decimals, symbol, balance, shareValue] = await Promise.all([
        token.decimals() as Promise<bigint>,
        token.symbol() as Promise<string>,
        token.balanceOf(address) as Promise<bigint>,
        line.convertToAssets(shares) as Promise<bigint>,
    ])

    let history: HistoryEntry[] = []
    let historyError: string | undefined
    // The zero address stands in for "no wallet yet"; it has no history worth a log scan.
    if (ADDRESSES.asc && address !== ZeroAddress) {
        try {
            const asc = new Contract(ADDRESSES.asc, ASC_ABI, rpc)
            const logs = await queryLogsChunked(asc, asc.filters.HistoryProved(address), rpc)
            history = logs
                .map((log) => {
                    const args = (log as unknown as { args: [string, bigint, bigint, bigint, string] }).args
                    return {
                        protocolId: Number(args[1]),
                        action: Number(args[2]),
                        sourceBlock: Number(args[3]),
                        // The ASC only accepts one chain per protocol, so the source chain is
                        // implied by the protocol id rather than carried in the event.
                        chainKey: 3,
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
            private: privateNullifier !== 0n,
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
