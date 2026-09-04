'use client'

import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract, parseUnits } from 'ethers'
import { Loader2 } from 'lucide-react'

import { Notice, Row, Stat, useApp } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    ADDRESSES,
    LINE_ABI,
    MARKET_ABI,
    formatAmount,
    formatPercent,
    loadDirectory,
    loadOffers,
    shorten,
    type DirectoryEntry,
    type Offer,
} from '@/lib/creditpass'
import { ensureCreditcoinNetwork } from '@/lib/wallet'

/**
 * Secondary market for vault shares.
 *
 * The vault caps withdrawal by available liquidity, so a depositor whose capital is out on loan is
 * stuck until borrowers repay. Selling the position is the way out — the buyer takes over the yield
 * and the credit risk, and the discount is the price of leaving early.
 */
export default function SwapPage() {
    const { snapshot, provider, wallet, refresh } = useApp()
    const [offers, setOffers] = useState<Offer[] | null>(null)
    const [book, setBook] = useState<DirectoryEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const reload = useCallback(() => {
        loadOffers()
            .then(setOffers)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }, [])

    useEffect(reload, [reload])

    // The credit quality of the loan book is what a share is actually a claim on.
    useEffect(() => {
        loadDirectory().then(setBook).catch(() => setBook([]))
    }, [])

    if (!snapshot) return null
    const { decimals, symbol } = snapshot.asset

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

    const buy = (offer: Offer) =>
        act(`fill-${offer.id}`, async () => {
            const s = await signer()
            // The market pulls the payment, so it needs an allowance first.
            const asset = new Contract(snapshot.asset.address, ['function approve(address,uint256)'], s)
            await (await asset.approve(ADDRESSES.market, offer.askAssets)).wait()
            await (await new Contract(ADDRESSES.market, MARKET_ABI, s).fill(offer.id)).wait()
        })

    const cancel = (offer: Offer) =>
        act(`cancel-${offer.id}`, async () => {
            const s = await signer()
            await (await new Contract(ADDRESSES.market, MARKET_ABI, s).cancel(offer.id)).wait()
        })

    const best = offers?.[0]

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
                <Card className="p-6">
                    <div className="text-muted-foreground text-sm">Share market</div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{offers?.length ?? '—'}</span>
                        <span className="text-muted-foreground">open {offers?.length === 1 ? 'offer' : 'offers'}</span>
                    </div>
                    <p className="text-muted-foreground mt-3 max-w-2xl text-balance text-sm">
                        Withdrawal is capped by what the vault has on hand, so a depositor whose capital is out on loan cannot leave. Selling the
                        position can. The buyer inherits both the yield and the credit risk, and the discount is what leaving early costs.
                    </p>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                        <Stat
                            label="Best discount"
                            value={best ? `${(best.discountBps / 100).toFixed(2)}%` : '—'}
                            hint="below what the vault would redeem"
                        />
                        <Stat
                            label="Withdrawable now"
                            value={`${formatAmount(snapshot.vault.maxWithdraw, decimals)} ${symbol}`}
                        />
                        <Stat
                            label="Your position"
                            value={`${formatAmount(snapshot.vault.shareValue, decimals)} ${symbol}`}
                        />
                    </dl>
                </Card>

                <CreditQuality
                    book={book}
                    utilisationBps={snapshot.vault.utilisationBps}
                    lentOut={formatAmount(snapshot.vault.totalPrincipal, decimals)}
                    symbol={symbol}
                />

                <Card className="p-6">
                    <div className="font-medium">Open offers</div>
                    {error && <Notice tone="warn">{error}</Notice>}

                    {!offers ? (
                        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                            <Loader2 className="size-4 animate-spin" /> Reading the book…
                        </div>
                    ) : offers.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-sm">No open offers. List one on the right.</p>
                    ) : (
                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full min-w-150 text-sm">
                                <thead className="text-muted-foreground text-left text-xs">
                                    <tr className="*:pb-3 *:font-normal">
                                        <th>Seller</th>
                                        <th>Shares</th>
                                        <th>Vault value</th>
                                        <th>Asking</th>
                                        <th>Discount</th>
                                        <th className="text-right" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {offers.map((offer) => {
                                        const mine = wallet?.toLowerCase() === offer.seller.toLowerCase()
                                        return (
                                            <tr
                                                key={offer.id}
                                                className="*:py-3">
                                                <td className="text-muted-foreground font-mono text-xs">{mine ? 'You' : shorten(offer.seller)}</td>
                                                <td className="tabular-nums">{formatAmount(offer.shares, decimals)}</td>
                                                <td className="text-muted-foreground tabular-nums">{formatAmount(offer.nav, decimals)}</td>
                                                <td className="font-medium tabular-nums">{formatAmount(offer.askAssets, decimals)}</td>
                                                <td className={`tabular-nums ${offer.discountBps > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                    {(offer.discountBps / 100).toFixed(2)}%
                                                </td>
                                                <td className="text-right">
                                                    <Button
                                                        size="xs"
                                                        variant={mine ? 'outline' : 'default'}
                                                        disabled={snapshot.demo || !wallet || busy !== null}
                                                        onClick={() => (mine ? cancel(offer) : buy(offer))}>
                                                        {busy === `fill-${offer.id}` || busy === `cancel-${offer.id}` ? (
                                                            <Loader2 className="animate-spin" />
                                                        ) : null}
                                                        {mine ? 'Cancel' : 'Buy'}
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <ListPanel
                onList={(shares, ask) =>
                    act('list', async () => {
                        const s = await signer()
                        const value = parseUnits(shares, decimals)
                        // Shares go into escrow on listing, so every open offer is actually fillable.
                        await (await new Contract(ADDRESSES.line, LINE_ABI, s).approve(ADDRESSES.market, value)).wait()
                        await (await new Contract(ADDRESSES.market, MARKET_ABI, s).list(value, parseUnits(ask, decimals))).wait()
                    })
                }
                busy={busy === 'list'}
                disabled={snapshot.demo || !wallet}
                shareBalance={snapshot.vault.shares}
                shareValue={snapshot.vault.shareValue}
                symbol={symbol}
                decimals={decimals}
            />
        </div>
    )
}

/**
 * A share here is not a token with a price, it is a claim on a book of uncollateralised loans. The
 * only thing that makes that claim assessable is that every borrower's record was proved on
 * Creditcoin through the Attestcoin Protocol — so the market shows it.
 */
function CreditQuality({
    book,
    utilisationBps,
    lentOut,
    symbol,
}: {
    book: DirectoryEntry[] | null
    utilisationBps: number
    lentOut: string
    symbol: string
}) {
    const borrowers = book?.filter((entry) => entry.score >= 500) ?? []
    const averageScore =
        borrowers.length > 0 ? Math.round(borrowers.reduce((sum, entry) => sum + entry.score, 0) / borrowers.length) : 0
    const everLiquidated = book?.filter((entry) => entry.liquidations > 0).length ?? 0

    return (
        <Card className="p-6">
            <div className="font-medium">What you are buying into</div>
            <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                These loans have no collateral. A share is a claim on the borrowers behind them — and the only reason that claim can be judged at all
                is that every one of those records was proved on Creditcoin through the Attestcoin Protocol.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <Stat
                    label="Utilisation"
                    value={formatPercent(utilisationBps)}
                    hint="how much is out on loan"
                />
                <Stat
                    label="Lent out"
                    value={`${lentOut} ${symbol}`}
                />
                <Stat
                    label="Eligible borrowers"
                    value={borrowers.length}
                    hint="score 500 or better"
                />
                <Stat
                    label="Average borrower score"
                    value={averageScore || '—'}
                    bad={averageScore > 0 && averageScore < 600}
                />
            </dl>

            {everLiquidated > 0 && (
                <Notice tone="warn">
                    {everLiquidated} scored {everLiquidated === 1 ? 'address has' : 'addresses have'} been liquidated on a source chain. That history
                    is already priced into their score, and into what this book can lend them.
                </Notice>
            )}
        </Card>
    )
}

function ListPanel({
    onList,
    busy,
    disabled,
    shareBalance,
    shareValue,
    symbol,
    decimals,
}: {
    onList: (shares: string, ask: string) => void
    busy: boolean
    disabled: boolean
    shareBalance: bigint
    shareValue: bigint
    symbol: string
    decimals: number
}) {
    const [shares, setShares] = useState('')
    const [ask, setAsk] = useState('')

    return (
        <Card className="flex flex-col gap-6 p-6">
            <div>
                <div className="text-muted-foreground text-sm">Sell your position</div>
                <div className="mt-4 space-y-3">
                    <Row
                        label="Shares held"
                        value={formatAmount(shareBalance, decimals)}
                    />
                    <Row
                        label="Vault value"
                        value={`${formatAmount(shareValue, decimals)} ${symbol}`}
                        strong
                    />
                </div>
            </div>

            <div className="space-y-3 border-t pt-6">
                <Input
                    value={shares}
                    onChange={(event) => setShares(event.target.value)}
                    placeholder="Shares to sell"
                    inputMode="decimal"
                    className="h-10"
                />
                <Input
                    value={ask}
                    onChange={(event) => setAsk(event.target.value)}
                    placeholder={`Asking price in ${symbol}`}
                    inputMode="decimal"
                    className="h-10"
                />
                <Button
                    size="sm"
                    className="h-9 w-full"
                    disabled={disabled || busy || !shares || !ask}
                    onClick={() => onList(shares, ask)}>
                    {busy ? <Loader2 className="animate-spin" /> : null} List offer
                </Button>
                <p className="text-muted-foreground text-xs">
                    Listing escrows the shares, so buyers can trust every open offer. Cancel any time to get them back.
                </p>
            </div>
        </Card>
    )
}
