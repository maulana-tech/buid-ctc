'use client'

import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { ArrowDown, Loader2 } from 'lucide-react'

import { AmountPanel, Faucet, Loading, Notice, Row, Stat, Summary, parseSafe, plain, useApp } from '@/components/app-shell'
import { SharePriceChart } from '@/components/share-price-chart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    ADDRESSES,
    ERC20_ABI,
    LINE_ABI,
    MARKET_ABI,
    formatAmount,
    formatPercent,
    loadDirectory,
    loadMarket,
    loadPriceHistory,
    planBuy,
    shorten,
    type DirectoryEntry,
    type Market,
    type Offer,
    type PriceHistory,
} from '@/lib/creditpass'
import { ensureCreditcoinNetwork } from '@/lib/wallet'

/**
 * Secondary market for vault shares, laid out as a swap.
 *
 * Left: what a share is worth and what it has traded for. Right: the trade itself — pay tUSD to
 * take shares off the book at the cheapest listed prices, or flip it and list shares for tUSD.
 * Underneath it is an escrowed order book, not a pool; every price on the page is a listed price.
 */
export default function SwapPage() {
    const { provider, wallet, refresh } = useApp()
    const [market, setMarket] = useState<Market | null>(null)
    const [history, setHistory] = useState<PriceHistory | null>(null)
    const [book, setBook] = useState<DirectoryEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const reload = useCallback(() => {
        loadMarket(wallet)
            .then(setMarket)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        loadPriceHistory(60)
            .then(setHistory)
            .catch(() => setHistory(null))
    }, [wallet])

    useEffect(reload, [reload])
    useEffect(() => {
        loadDirectory()
            .then(setBook)
            .catch(() => setBook([]))
    }, [])

    if (!market) return <Loading what="the book" />

    const { decimals, symbol, sharePrice, viewer } = market

    const signer = async () => {
        if (!provider) throw new Error('Connect a wallet first.')
        await ensureCreditcoinNetwork(provider)
        return new BrowserProvider(provider).getSigner()
    }

    const act = async (key: string, run: () => Promise<void>) => {
        setError(null)
        setBusy(key)
        try {
            await run()
            reload()
            refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(null)
        }
    }

    const buy = (plan: ReturnType<typeof planBuy>) =>
        act('buy', async () => {
            const s = await signer()
            const line = new Contract(ADDRESSES.line, LINE_ABI, s)
            const asset = new Contract(await line.asset(), ERC20_ABI, s)
            const marketW = new Contract(ADDRESSES.market, MARKET_ABI, s)
            // One approval for the whole plan, then a fill per leg. The market pulls payment.
            await (await asset.approve(ADDRESSES.market, plan.totalCost)).wait()
            for (const leg of plan.legs) {
                if (leg.shares === leg.offer.shares) await (await marketW.fill(leg.offer.id)).wait()
                else await (await marketW.fillPartial(leg.offer.id, leg.shares)).wait()
            }
        })

    const list = (shares: bigint, ask: bigint) =>
        act('list', async () => {
            const s = await signer()
            await (await new Contract(ADDRESSES.line, LINE_ABI, s).approve(ADDRESSES.market, shares)).wait()
            await (await new Contract(ADDRESSES.market, MARKET_ABI, s).list(shares, ask)).wait()
        })

    const cancel = (offer: Offer) =>
        act(`cancel-${offer.id}`, async () => {
            const s = await signer()
            await (await new Contract(ADDRESSES.market, MARKET_ABI, s).cancel(offer.id)).wait()
        })

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
                <Card className="p-6">
                    {history ? (
                        <SharePriceChart
                            history={history}
                            symbol={symbol}
                        />
                    ) : (
                        <Loading what="price history" />
                    )}
                </Card>

                <Card className="p-6">
                    <div className="flex items-baseline justify-between">
                        <div className="font-medium">Order book</div>
                        <div className="text-muted-foreground text-xs">
                            {market.offers.length} open · {formatAmount(market.offers.reduce((s, o) => s + o.shares, 0n), decimals)} shares escrowed
                        </div>
                    </div>
                    {error && <Notice tone="warn">{error}</Notice>}
                    {market.offers.length === 0 ? (
                        <p className="text-muted-foreground py-6 text-sm">No open offers. Flip the swap to sell and list the first one.</p>
                    ) : (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-125 text-sm">
                                <thead className="text-muted-foreground text-left text-xs">
                                    <tr className="*:pb-2 *:font-normal">
                                        <th>Seller</th>
                                        <th className="text-right">Shares</th>
                                        <th className="text-right">Per share</th>
                                        <th className="text-right">Discount</th>
                                        <th className="text-right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {market.offers.map((offer) => {
                                        const mine = viewer?.address.toLowerCase() === offer.seller.toLowerCase()
                                        const perShare = offer.shares === 0n ? 0n : (offer.askAssets * 10n ** BigInt(decimals)) / offer.shares
                                        return (
                                            <tr
                                                key={offer.id}
                                                className="*:py-2.5 tabular-nums">
                                                <td className="text-muted-foreground font-mono text-xs">{mine ? 'You' : shorten(offer.seller)}</td>
                                                <td className="text-right">{formatAmount(offer.shares, decimals)}</td>
                                                <td className="text-right font-medium">{formatAmount(perShare, decimals, 4)}</td>
                                                <td className={`text-right ${offer.discountBps > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {(offer.discountBps / 100).toFixed(2)}%
                                                </td>
                                                <td className="text-right">
                                                    {mine && (
                                                        <Button
                                                            size="xs"
                                                            variant="outline"
                                                            disabled={market.demo || busy !== null}
                                                            onClick={() => cancel(offer)}>
                                                            {busy === `cancel-${offer.id}` ? <Loader2 className="animate-spin" /> : null}
                                                            Cancel
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <CreditQuality book={book} />
            </div>

            <div className="lg:col-span-2">
                <SwapCard
                    market={market}
                    connected={Boolean(wallet)}
                    busy={busy}
                    onBuy={buy}
                    onList={list}
                />
            </div>
        </div>
    )
}

/**
 * The trade itself. Buy mode spends tUSD against the cheapest listed offers, partial on the last
 * one, so "you pay X" means exactly X. Sell mode lists shares at a price you set against
 * redemption value.
 */
function SwapCard({
    market,
    connected,
    busy,
    onBuy,
    onList,
}: {
    market: Market
    connected: boolean
    busy: string | null
    onBuy: (plan: ReturnType<typeof planBuy>) => void
    onList: (shares: bigint, ask: bigint) => void
}) {
    const [mode, setMode] = useState<'buy' | 'sell'>('buy')
    const [payInput, setPay] = useState('')
    const [discountBps, setDiscount] = useState(100)

    const { decimals, symbol, sharePrice, viewer, offers, demo } = market
    const unit = 10n ** BigInt(decimals)
    const pay = parseSafe(payInput, decimals)

    // Buy: tUSD in, shares out, priced by the book.
    const plan = mode === 'buy' && pay ? planBuy(pay, offers) : null
    // Sell: shares in, tUSD out, priced against redemption value less the chosen discount.
    const sellNav = mode === 'sell' && pay ? (pay * sharePrice) / unit : null
    const sellAsk = sellNav === null ? null : (sellNav * BigInt(10_000 - discountBps)) / 10_000n

    const receive = mode === 'buy' ? (plan?.totalShares ?? 0n) : (sellAsk ?? 0n)
    const payBalance = viewer ? (mode === 'buy' ? viewer.assetBalance : viewer.shares) : null
    const insufficient = payBalance !== null && pay !== null && pay > payBalance

    const problem = !connected
        ? 'Connect a wallet to trade.'
        : demo
          ? 'Demo — trading is disabled until the contracts are deployed.'
          : pay === null || pay === 0n
            ? null
            : insufficient
              ? `You hold ${formatAmount(payBalance!, decimals)} ${mode === 'buy' ? symbol : 'shares'}.`
              : mode === 'buy' && plan && plan.totalShares === 0n
                ? 'Nothing on the book at that size.'
                : mode === 'buy' && plan && plan.unfilled > 0n
                  ? `The book only absorbs ${formatAmount(plan.totalCost, decimals)} ${symbol}; the rest stays with you.`
                  : null

    const canSubmit = connected && !demo && pay !== null && pay > 0n && !insufficient && busy === null && (mode === 'sell' || (plan !== null && plan.totalShares > 0n))

    const flip = () => {
        setMode((m) => (m === 'buy' ? 'sell' : 'buy'))
        setPay('')
    }

    const effectivePerShare =
        mode === 'buy' && plan && plan.totalShares > 0n ? (plan.totalCost * unit) / plan.totalShares : sellAsk && pay ? (sellAsk * unit) / pay : null

    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <div className="text-lg font-semibold tracking-tight">Swap</div>
                <div className="text-muted-foreground text-xs">
                    1 share = {formatAmount(sharePrice, decimals, 4)} {symbol}
                </div>
            </div>

            <div className="relative mt-4 space-y-1">
                <AmountPanel
                    label="You pay"
                    token={mode === 'buy' ? symbol : 'cpUSD'}
                    value={payInput}
                    onChange={setPay}
                    balance={payBalance}
                    decimals={decimals}
                    onMax={payBalance !== null && payBalance > 0n ? () => setPay(plain(payBalance, decimals)) : undefined}
                />

                <button
                    type="button"
                    onClick={flip}
                    aria-label="Flip direction"
                    className="bg-background ring-border hover:bg-muted absolute left-1/2 top-1/2 z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-4 duration-200">
                    <ArrowDown className={`size-4 duration-300 ${mode === 'sell' ? 'rotate-180' : ''}`} />
                </button>

                <AmountPanel
                    label="You receive"
                    token={mode === 'buy' ? 'cpUSD' : symbol}
                    value={receive > 0n ? plain(receive, decimals) : ''}
                    decimals={decimals}
                    balance={viewer ? (mode === 'buy' ? viewer.shares : viewer.assetBalance) : null}
                    tone="output"
                />
            </div>

            {mode === 'sell' && (
                <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Below redemption value</span>
                    <div className="flex gap-1">
                        {[50, 100, 300].map((bps) => (
                            <button
                                key={bps}
                                type="button"
                                onClick={() => setDiscount(bps)}
                                className={`rounded-full px-2.5 py-1 duration-150 ${discountBps === bps ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                {bps / 100}%
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {pay !== null && pay > 0n && (
                <Summary>
                    {effectivePerShare !== null && (
                        <Row
                            label="Effective price"
                            value={`${formatAmount(effectivePerShare, decimals, 4)} ${symbol} / share`}
                        />
                    )}
                    {mode === 'buy' && plan && plan.totalShares > 0n && (
                        <>
                            <Row
                                label="Filled from"
                                value={`${plan.legs.length} ${plan.legs.length === 1 ? 'offer' : 'offers'}`}
                            />
                            <Row
                                label="vs redemption"
                                value={`${((Number(((plan.totalShares * sharePrice) / unit - plan.totalCost) * 10_000n) / Number((plan.totalShares * sharePrice) / unit || 1n)) / 100).toFixed(2)}% below`}
                                strong
                            />
                        </>
                    )}
                    {mode === 'sell' && sellNav !== null && (
                        <Row
                            label="Redeems for"
                            value={`${formatAmount(sellNav, decimals)} ${symbol}`}
                        />
                    )}
                </Summary>
            )}

            <Button
                size="lg"
                className="mt-4 h-12 w-full text-base"
                disabled={!canSubmit}
                onClick={() => (mode === 'buy' ? onBuy(plan!) : onList(pay!, sellAsk!))}>
                {busy === 'buy' || busy === 'list' ? <Loader2 className="animate-spin" /> : null}
                {!connected ? 'Connect wallet' : mode === 'buy' ? 'Buy shares' : 'List for sale'}
            </Button>

            <p className="text-muted-foreground mt-3 min-h-4 text-xs">
                {problem ??
                    (mode === 'buy'
                        ? 'Fills the cheapest listed offers first, partially on the last. Every price is a listed price.'
                        : 'Listing escrows the shares. Cancel any time from the order book to get them back.')}
            </p>

            {viewer && mode === 'buy' && (
                <div className="mt-4 border-t pt-4">
                    <Faucet />
                </div>
            )}
        </Card>
    )
}

function CreditQuality({ book }: { book: DirectoryEntry[] | null }) {
    const { snapshot } = useApp()
    if (!snapshot) return null

    const borrowers = book?.filter((entry) => entry.score >= 500) ?? []
    const averageScore = borrowers.length > 0 ? Math.round(borrowers.reduce((sum, e) => sum + e.score, 0) / borrowers.length) : 0

    return (
        <Card className="p-6">
            <div className="font-medium">What a share is a claim on</div>
            <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                Uncollateralised loans to borrowers whose repayment history was proved on Creditcoin through the Attestcoin Protocol. That
                proof is the only reason the claim can be judged at all.
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <Stat
                    label="Utilisation"
                    value={formatPercent(snapshot.vault.utilisationBps)}
                />
                <Stat
                    label="Lent out"
                    value={`${formatAmount(snapshot.vault.totalPrincipal, snapshot.asset.decimals)} ${snapshot.asset.symbol}`}
                />
                <Stat
                    label="Eligible borrowers"
                    value={book === null ? '…' : borrowers.length}
                />
                <Stat
                    label="Avg borrower score"
                    value={averageScore || '—'}
                    bad={averageScore > 0 && averageScore < 600}
                />
            </dl>
        </Card>
    )
}
