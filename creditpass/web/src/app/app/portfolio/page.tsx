'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowUpRight,
    BadgeCheck,
    Banknote,
    Coins,
    HandCoins,
    ShieldAlert,
    Tag,
    Undo2,
    Wallet,
    XCircle,
} from 'lucide-react'

import { ConnectPrompt, Loading, Notice, Row, useApp } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    explorerUrl,
    formatAmount,
    formatPercent,
    loadMarket,
    loadPortfolio,
    loadVaultPosition,
    shorten,
    tierOf,
    type Activity,
    type Market,
    type Portfolio,
    type VaultPosition,
} from '@/lib/creditpass'

/** Creditcoin targets ~15s blocks; mirrors CreditLine.BLOCKS_PER_YEAR / 365. */
const BLOCKS_PER_DAY = 5_760

function timeAgo(unix: number) {
    if (!unix) return ''
    const s = Math.max(0, Math.floor(Date.now() / 1000 - unix))
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

function blocksToText(blocks: number) {
    const days = blocks / BLOCKS_PER_DAY
    if (days >= 1) return `${Math.floor(days)}d ${Math.round(((days % 1) * 24))}h`
    return `${Math.round(days * 24)}h`
}

/**
 * Portfolio: everything the connected wallet holds and owes across the registry, the vault and the
 * market, on one page, with what needs attention at the top.
 *
 * It is wallet-scoped by nature — there is no "look up someone's portfolio" here, because the
 * numbers only mean something next to the buttons that move them. Passport is for looking others up.
 */
export default function PortfolioPage() {
    const { wallet, snapshot } = useApp()
    const [position, setPosition] = useState<VaultPosition | null>(null)
    const [market, setMarket] = useState<Market | null>(null)
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!wallet) return
        setError(null)
        Promise.all([loadVaultPosition(wallet), loadMarket(wallet), loadPortfolio(wallet)])
            .then(([p, m, pf]) => {
                setPosition(p)
                setMarket(m)
                setPortfolio(pf)
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    }, [wallet])

    if (!wallet) {
        return (
            <ConnectPrompt title="Your portfolio is wallet-scoped.">
                It shows what the connected wallet holds and owes across the registry, the vault and the market — and what needs attention.
            </ConnectPrompt>
        )
    }
    if (error) return <Notice tone="warn">{error}</Notice>
    if (!snapshot || !position || !market || !portfolio) return <Loading what="your portfolio" />

    const { decimals, symbol } = snapshot.asset
    const myOffers = market.offers.filter((o) => o.seller.toLowerCase() === wallet.toLowerCase())
    const escrowedShares = myOffers.reduce((s, o) => s + o.shares, 0n)
    const escrowedValue = (escrowedShares * market.sharePrice) / 10n ** BigInt(decimals)

    const assets = position.assetBalance + position.shareValue + escrowedValue
    const liabilities = snapshot.owed
    const net = assets - liabilities

    const tier = tierOf(snapshot.score, snapshot.minScore)
    const blocksLeft = snapshot.loan.active ? snapshot.loan.dueBlock - portfolio.headBlock : 0
    const overdue = snapshot.loan.active && blocksLeft <= 0
    const dueSoon = snapshot.loan.active && !overdue && blocksLeft < 2 * BLOCKS_PER_DAY
    const locked = position.shareValue > position.maxWithdraw ? position.shareValue - position.maxWithdraw : 0n
    const offersAboveNav = myOffers.filter((o) => o.discountBps < 0)

    const attention: { tone: 'warn' | 'info'; text: string; href: string; cta: string }[] = []
    if (overdue)
        attention.push({ tone: 'warn', text: `Your loan is overdue by ${blocksToText(-blocksLeft)}. Anyone can mark it defaulted — that costs 300 points and closes your credit line.`, href: '/app/borrow', cta: 'Repay now' })
    else if (dueSoon)
        attention.push({ tone: 'warn', text: `Your loan is due in about ${blocksToText(blocksLeft)}. ${formatAmount(snapshot.owed, decimals)} ${symbol} owed with interest.`, href: '/app/borrow', cta: 'Repay' })
    if (snapshot.known && snapshot.score < snapshot.minScore)
        attention.push({ tone: 'info', text: `Score ${snapshot.score} — the credit line opens at ${snapshot.minScore}. Prove more time-separated repayments to get there.`, href: '/app/history', cta: 'Prove more' })
    if (!snapshot.known)
        attention.push({ tone: 'info', text: 'No attested history yet for this wallet. Prove a repayment on Aave, Spark or Morpho to get a score.', href: '/app/history', cta: 'Prove' })
    if (locked > 0n)
        attention.push({ tone: 'info', text: `${formatAmount(locked, decimals)} ${symbol} of your vault position is out on loan and cannot be withdrawn yet. You can sell it instead.`, href: '/app/swap', cta: 'Sell shares' })
    if (offersAboveNav.length > 0)
        attention.push({ tone: 'info', text: `${offersAboveNav.length} of your offers ${offersAboveNav.length === 1 ? 'asks' : 'ask'} more than the vault would redeem for — unlikely to fill while the vault has cash.`, href: '/app/swap', cta: 'Review offers' })

    const alloc = [
        { label: `${symbol} in wallet`, value: position.assetBalance, className: 'bg-foreground/30' },
        { label: 'In the vault', value: position.shareValue, className: 'bg-[var(--chart-series)]' },
        { label: 'Escrowed on market', value: escrowedValue, className: 'bg-[var(--chart-series)]/50' },
    ].filter((a) => a.value > 0n)
    const allocTotal = alloc.reduce((s, a) => s + a.value, 0n)

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Wallet className="size-4" /> Portfolio · <span className="font-mono text-xs">{shorten(wallet)}</span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className={`text-5xl font-semibold tracking-tight ${net < 0n ? 'text-amber-600' : ''}`}>
                                {net < 0n ? '−' : ''}
                                {formatAmount(net < 0n ? -net : net, decimals)}
                            </span>
                            <span className="text-muted-foreground">{symbol} net</span>
                        </div>
                        <div className="text-muted-foreground mt-1 text-sm tabular-nums">
                            {formatAmount(assets, decimals)} in assets · {formatAmount(liabilities, decimals)} owed
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-right text-sm">
                        <div>
                            <div className="text-muted-foreground text-xs">Credit score</div>
                            <div className="font-medium tabular-nums">
                                {snapshot.known ? snapshot.score : '—'} <span className="text-muted-foreground font-normal">{snapshot.known ? tier.label : 'no history'}</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-muted-foreground text-xs">Vault yield</div>
                            <div className={`font-medium tabular-nums ${position.earned && position.earned > 0n ? 'text-emerald-600' : position.earned && position.earned < 0n ? 'text-amber-600' : ''}`}>
                                {position.earned === null ? '—' : `${position.earned >= 0n ? '+' : '−'}${formatAmount(position.earned < 0n ? -position.earned : position.earned, decimals)}`}
                            </div>
                        </div>
                    </div>
                </div>

                {allocTotal > 0n && (
                    <div className="mt-6">
                        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                            {alloc.map((a) => (
                                <div
                                    key={a.label}
                                    className={`${a.className} h-full`}
                                    style={{ width: `${Number((a.value * 10_000n) / allocTotal) / 100}%` }}
                                    title={a.label}
                                />
                            ))}
                        </div>
                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                            {alloc.map((a) => (
                                <span
                                    key={a.label}
                                    className="flex items-center gap-1.5">
                                    <span className={`inline-block size-2 rounded-full ${a.className}`} />
                                    {a.label} · {formatAmount(a.value, decimals)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {attention.length > 0 && (
                <div className="space-y-2">
                    {attention.map((a) => (
                        <div
                            key={a.text}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${a.tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/40'}`}>
                            <span className="text-muted-foreground flex items-center gap-2">
                                {a.tone === 'warn' ? <ShieldAlert className="size-4 shrink-0 text-amber-600" /> : <BadgeCheck className="size-4 shrink-0 opacity-60" />}
                                {a.text}
                            </span>
                            <Button
                                size="xs"
                                variant={a.tone === 'warn' ? 'default' : 'outline'}
                                nativeButton={false}
                                render={<Link href={a.href}>{a.cta}</Link>}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="flex flex-col p-5">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <BadgeCheck className="size-3.5" /> Passport
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">{snapshot.known ? snapshot.score : '—'}</div>
                    <div className="text-muted-foreground text-sm">{snapshot.known ? `${tier.label} · limit ${formatAmount(snapshot.limit, decimals)} ${symbol}` : 'No attested history'}</div>
                    <div className="mt-4 space-y-2">
                        <Row label="Repayments proved" value={String(snapshot.profile.repayments)} />
                        <Row label="Protocols" value={String(snapshot.profile.protocolCount)} />
                    </div>
                    <CardLink href="/app" label="Open passport" />
                </Card>

                <Card className="flex flex-col p-5">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <HandCoins className="size-3.5" /> Loan
                    </div>
                    {snapshot.loan.active ? (
                        <>
                            <div className={`mt-3 text-3xl font-semibold tracking-tight ${overdue ? 'text-amber-600' : ''}`}>{formatAmount(snapshot.owed, decimals)}</div>
                            <div className="text-muted-foreground text-sm">{symbol} owed with interest</div>
                            <div className="mt-4 space-y-2">
                                <Row label="Principal" value={`${formatAmount(snapshot.loan.principal, decimals)} ${symbol}`} />
                                <Row label={overdue ? 'Overdue by' : 'Due in'} value={blocksToText(Math.abs(blocksLeft))} strong={overdue || dueSoon} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mt-3 text-3xl font-semibold tracking-tight">0</div>
                            <div className="text-muted-foreground text-sm">No open loan</div>
                            <div className="mt-4 space-y-2">
                                <Row label="Available to borrow" value={`${formatAmount(snapshot.limit, decimals)} ${symbol}`} />
                                <Row label="Borrow APR" value={formatPercent(snapshot.vault.borrowAprBps)} />
                            </div>
                        </>
                    )}
                    <CardLink href="/app/borrow" label={snapshot.loan.active ? 'Repay' : 'Borrow'} />
                </Card>

                <Card className="flex flex-col p-5">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Coins className="size-3.5" /> Vault
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">{formatAmount(position.shareValue, decimals)}</div>
                    <div className="text-muted-foreground text-sm">{symbol} · {formatAmount(position.shares, decimals)} cpUSD</div>
                    <div className="mt-4 space-y-2">
                        <Row label="Earned" value={position.earned === null ? '—' : `${position.earned >= 0n ? '+' : '−'}${formatAmount(position.earned < 0n ? -position.earned : position.earned, decimals)} ${symbol}`} />
                        <Row label="Withdrawable now" value={`${formatAmount(position.maxWithdraw, decimals)} ${symbol}`} />
                        <Row label="Supply APR" value={formatPercent(snapshot.vault.supplyAprBps)} />
                    </div>
                    <CardLink href="/app/earn" label="Manage" />
                </Card>

                <Card className="flex flex-col p-5">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Tag className="size-3.5" /> Market
                    </div>
                    <div className="mt-3 text-3xl font-semibold tracking-tight">{myOffers.length}</div>
                    <div className="text-muted-foreground text-sm">{myOffers.length === 1 ? 'open offer' : 'open offers'} · {formatAmount(escrowedShares, decimals)} shares escrowed</div>
                    <div className="mt-4 space-y-2">
                        <Row label="Escrowed value" value={`${formatAmount(escrowedValue, decimals)} ${symbol}`} />
                        <Row label="Best discount on book" value={market.offers[0] ? `${(market.offers[0].discountBps / 100).toFixed(2)}%` : '—'} />
                    </div>
                    <CardLink href="/app/swap" label="Open market" />
                </Card>
            </div>

            <Card className="p-6">
                <div className="flex items-baseline justify-between">
                    <div className="font-medium">Activity</div>
                    <div className="text-muted-foreground text-xs">{portfolio.activity.length} events · from every contract this wallet touched</div>
                </div>
                {portfolio.activity.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-sm">Nothing yet. Supply on Earn, or prove a repayment to get a score.</p>
                ) : (
                    <ul className="mt-4 divide-y">
                        {portfolio.activity.map((a) => (
                            <ActivityRow
                                key={`${a.txHash}-${a.kind}-${a.block}`}
                                activity={a}
                                symbol={symbol}
                                decimals={decimals}
                            />
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    )
}

const KINDS: Record<Activity['kind'], { label: string; icon: React.ComponentType<{ className?: string }>; sign: '+' | '−' | '' }> = {
    proved: { label: 'History proved', icon: BadgeCheck, sign: '' },
    deposit: { label: 'Supplied', icon: ArrowDownToLine, sign: '−' },
    withdraw: { label: 'Withdrew', icon: ArrowUpFromLine, sign: '+' },
    borrow: { label: 'Borrowed', icon: HandCoins, sign: '+' },
    repay: { label: 'Repaid', icon: Banknote, sign: '−' },
    default: { label: 'Defaulted', icon: XCircle, sign: '' },
    listed: { label: 'Listed shares', icon: Tag, sign: '' },
    cancelled: { label: 'Cancelled offer', icon: Undo2, sign: '' },
    sold: { label: 'Sold shares', icon: ArrowUpRight, sign: '−' },
    bought: { label: 'Bought shares', icon: Coins, sign: '+' },
}

function ActivityRow({ activity, symbol, decimals }: { activity: Activity; symbol: string; decimals: number }) {
    const k = KINDS[activity.kind]
    const Icon = k.icon
    const href = activity.txHash ? explorerUrl('tx', activity.txHash) : ''
    const amount = activity.amount > 0n ? `${k.sign}${formatAmount(activity.amount, decimals)} ${activity.unit === 'shares' ? 'cpUSD' : symbol}` : null
    return (
        <li className="flex items-center gap-4 py-3">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${activity.kind === 'default' ? 'bg-amber-500/10 text-amber-600' : 'bg-muted'}`}>
                <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="font-medium">{k.label}</span>
                    <span className="text-muted-foreground text-xs">{timeAgo(activity.time)}</span>
                </div>
                <div className="text-muted-foreground truncate text-sm">{activity.detail}</div>
            </div>
            {amount && <span className={`shrink-0 text-sm font-medium tabular-nums ${k.sign === '+' ? 'text-emerald-600' : ''}`}>{amount}</span>}
            {href ? (
                <Link
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0 font-mono text-xs">
                    {shorten(activity.txHash)} ↗
                </Link>
            ) : (
                <span className="text-muted-foreground shrink-0 font-mono text-xs">#{activity.block.toLocaleString()}</span>
            )}
        </li>
    )
}

function CardLink({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            className="text-muted-foreground hover:text-foreground mt-auto flex items-center gap-1 border-t pt-3 text-sm">
            {label} <ArrowUpRight className="size-3.5" />
        </Link>
    )
}
