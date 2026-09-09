'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isAddress } from 'ethers'
import { ArrowUpRight, Check, Copy, Search } from 'lucide-react'

import { ConnectPrompt, Loading, Notice, Row, Stat, useApp } from '@/components/app-shell'
import { ProofTable } from '@/components/proof-table'
import { ProveHistory } from '@/components/prove-history'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { BANDS, SCORE, formatAmount, loadSnapshot, scoreBreakdown, shorten, tierOf, type Snapshot } from '@/lib/creditpass'

/**
 * Passport: the score, why it is what it is, and what would move it.
 *
 * Defaults to the connected wallet. Any other address can be looked up — the score is public by
 * design — but the buttons only ever act on the wallet, so a looked-up passport is read-only and
 * says so.
 */
export default function PassportPage() {
    const { snapshot: mine, wallet, loading } = useApp()
    const [query, setQuery] = useState('')
    const [other, setOther] = useState<{ address: string; snapshot: Snapshot } | null>(null)
    const [lookupError, setLookupError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const lookup = async (address: string) => {
        if (!isAddress(address)) return setLookupError('That is not a valid address.')
        setLookupError(null)
        setBusy(true)
        try {
            setOther({ address, snapshot: await loadSnapshot(address) })
            setQuery('')
        } catch (e) {
            setLookupError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    // Deep links (/app?address=0x…) open someone else's passport directly.
    useEffect(() => {
        const requested = new URLSearchParams(window.location.search).get('address')
        if (requested && isAddress(requested)) void lookup(requested)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const lookupBar = (
        <div className="flex gap-2">
            <div className="relative flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
                <Input
                    value={query}
                    spellCheck={false}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookup(query.trim())}
                    placeholder="Look up any address 0x…"
                    className="h-10 pl-9 font-mono text-sm"
                />
            </div>
            <Button
                size="sm"
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() => lookup(query.trim())}>
                Look up
            </Button>
        </div>
    )

    if (other) {
        return (
            <Passport
                snapshot={other.snapshot}
                address={other.address}
                readOnly
                onBack={() => setOther(null)}
                lookupBar={lookupBar}
                lookupError={lookupError}
            />
        )
    }

    if (busy && !wallet) return <Loading what="that passport" />
    if (!wallet) {
        return (
            <div className="space-y-6">
                <ConnectPrompt title="Your passport follows your wallet.">
                    Connect to see your score, how it is built, and what would move it. Every score is public, so you can also read anyone&apos;s below.
                </ConnectPrompt>
                <Card className="p-5">
                    {lookupBar}
                    {lookupError && <p className="mt-2 text-xs text-amber-600">{lookupError}</p>}
                </Card>
            </div>
        )
    }

    if (loading || !mine) return <Loading what="your passport" />
    return (
        <Passport
            snapshot={mine}
            address={wallet}
            lookupBar={lookupBar}
            lookupError={lookupError}
        />
    )
}

function Passport({
    snapshot,
    address,
    readOnly = false,
    onBack,
    lookupBar,
    lookupError,
}: {
    snapshot: Snapshot
    address: string
    readOnly?: boolean
    onBack?: () => void
    lookupBar: React.ReactNode
    lookupError: string | null
}) {
    const { decimals, symbol } = snapshot.asset
    const tier = tierOf(snapshot.score, snapshot.minScore)
    const parts = scoreBreakdown(snapshot.profile, snapshot.known)
    const next = BANDS.find((b) => b.from > snapshot.score)
    const pointsToNext = next ? next.from - snapshot.score : 0
    const repaymentsToNext = next && parts.counted < SCORE.maxCountedRepayments ? Math.ceil(pointsToNext / SCORE.perRepayment) : null

    return (
        <div className="space-y-6">
            {readOnly && (
                <Notice>
                    Viewing the public passport of <span className="font-mono">{shorten(address)}</span>. Read-only.{' '}
                    <button
                        type="button"
                        onClick={onBack}
                        className="hover:text-foreground underline">
                        Back to mine
                    </button>
                </Notice>
            )}

            <div className="grid gap-6 lg:grid-cols-5">
                <div className="space-y-6 lg:col-span-3">
                    <Card className="p-6">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <div className="text-muted-foreground text-sm">Credit score · {readOnly ? shorten(address) : 'you'}</div>
                                <div className="mt-1 flex items-baseline gap-3">
                                    <span className="text-6xl font-semibold tracking-tight tabular-nums">{snapshot.score}</span>
                                    <span className="text-muted-foreground text-sm">/ {SCORE.max}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-medium">{snapshot.known ? tier.label : 'No attested history'}</div>
                                <div className="text-muted-foreground text-xs">
                                    {tier.multiplier > 0 ? `${tier.multiplier}× base limit · ${formatAmount(snapshot.limit, decimals)} ${symbol}` : `Credit line opens at ${snapshot.minScore}`}
                                </div>
                            </div>
                        </div>

                        <div className="relative mt-6">
                            <div className="bg-muted h-2 overflow-hidden rounded-full">
                                <div
                                    className="bg-foreground h-full rounded-full transition-all duration-700"
                                    style={{ width: `${Math.min(100, snapshot.score / 10)}%` }}
                                />
                            </div>
                            {BANDS.filter((b) => b.from > 0).map((b) => (
                                <span
                                    key={b.from}
                                    className="bg-background absolute top-1/2 h-3 w-px -translate-y-1/2"
                                    style={{ left: `${b.from / 10}%` }}
                                />
                            ))}
                        </div>
                        <div className="text-muted-foreground mt-2 flex justify-between text-[10px] tabular-nums">
                            <span>0</span>
                            {BANDS.filter((b) => b.from > 0).map((b) => (
                                <span key={b.from}>{b.from}</span>
                            ))}
                            <span>{SCORE.max}</span>
                        </div>

                        <p className="text-muted-foreground mt-4 text-sm">
                            {!snapshot.known
                                ? 'An unknown address and a ruined one both score zero, and CreditPass refuses to guess between them. Prove one repayment and the score starts at 325.'
                                : next
                                  ? `${pointsToNext} points to ${next.label} (${next.multiplier}× base limit)${repaymentsToNext ? ` — about ${repaymentsToNext} more counted ${repaymentsToNext === 1 ? 'repayment' : 'repayments'}.` : ' — repayments are capped, so only tenure moves it now.'}`
                                  : 'Top band. Every further repayment keeps the record current but cannot raise the score.'}
                        </p>
                    </Card>

                    <Card className="p-6">
                        <div className="font-medium">How this score is built</div>
                        <p className="text-muted-foreground mt-1 text-sm">The registry&apos;s formula, term by term. Anyone can recompute it from the profile.</p>
                        <div className="mt-5 space-y-3">
                            <Term
                                label="Base"
                                hint="for any address with attested history"
                                value={parts.base}
                            />
                            <Term
                                label="Repayments"
                                hint={`${parts.counted} of ${SCORE.maxCountedRepayments} counted × ${SCORE.perRepayment}`}
                                value={parts.repayments}
                            />
                            <Term
                                label="Tenure"
                                hint={`${parts.ageSteps} × 30 days between first and last counted × ${SCORE.perAgeStep}, cap ${SCORE.maxAgeBonus}`}
                                value={parts.age}
                            />
                            <Term
                                label="Liquidations"
                                hint={`${snapshot.profile.liquidations} × ${SCORE.liquidation}`}
                                value={-parts.liquidations}
                            />
                            <Term
                                label="Defaults"
                                hint={`${snapshot.profile.defaults} × ${SCORE.default}`}
                                value={-parts.defaults}
                            />
                            <div className="flex items-baseline justify-between border-t pt-3 text-sm">
                                <span className="font-medium">Score</span>
                                <span className="font-semibold tabular-nums">{parts.total}</span>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-baseline justify-between">
                            <div className="font-medium">Recent proofs</div>
                            {!readOnly && (
                                <Link
                                    href="/app/history"
                                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                                    All history <ArrowUpRight className="size-3.5" />
                                </Link>
                            )}
                        </div>
                        {snapshot.history.length === 0 ? (
                            <p className="text-muted-foreground py-6 text-sm">No proofs on this passport yet.</p>
                        ) : (
                            <div className="mt-4">
                                <ProofTable
                                    history={snapshot.history}
                                    limit={5}
                                />
                            </div>
                        )}
                    </Card>
                </div>

                <div className="space-y-6 lg:col-span-2">
                    {!readOnly && !snapshot.known ? (
                        <ProveHistory />
                    ) : (
                        <Card className="p-5">
                            <div className="text-lg font-semibold tracking-tight">At a glance</div>
                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                                <Stat
                                    label="Repayments"
                                    value={snapshot.profile.repayments}
                                />
                                <Stat
                                    label="Borrows"
                                    value={snapshot.profile.borrows}
                                />
                                <Stat
                                    label="Protocols"
                                    value={snapshot.profile.protocolCount}
                                />
                                <Stat
                                    label="Liquidations"
                                    value={snapshot.profile.liquidations}
                                    bad={snapshot.profile.liquidations > 0}
                                />
                            </dl>
                            <div className="mt-5 space-y-2 border-t pt-4">
                                <Row
                                    label="Credit limit"
                                    value={`${formatAmount(snapshot.limit, decimals)} ${symbol}`}
                                    strong
                                />
                                <Row
                                    label="Currently owed"
                                    value={`${formatAmount(snapshot.owed, decimals)} ${symbol}`}
                                />
                                <Row
                                    label="Vault position"
                                    value={`${formatAmount(snapshot.vault.shareValue, decimals)} ${symbol}`}
                                />
                            </div>
                            {!readOnly && (
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <Button
                                        size="sm"
                                        nativeButton={false}
                                        render={<Link href="/app/borrow">Borrow</Link>}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        nativeButton={false}
                                        render={<Link href="/app/history">Prove more</Link>}
                                    />
                                </div>
                            )}
                        </Card>
                    )}

                    <Card className="p-5">
                        <div className="text-sm font-medium">Public record</div>
                        <p className="text-muted-foreground mt-1 text-xs">
                            Any contract on Creditcoin can read this score with <span className="font-mono">scoreOf()</span>; anything off-chain can read it here.
                        </p>
                        <div className="mt-3 space-y-2">
                            <CopyLine
                                label="Passport link"
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/app?address=${address}`}
                            />
                            <CopyLine
                                label="JSON API"
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/score/${address}`}
                            />
                        </div>
                    </Card>

                    <Card className="p-5">
                        <div className="text-sm font-medium">Look up another address</div>
                        <div className="mt-3">{lookupBar}</div>
                        {lookupError && <p className="mt-2 text-xs text-amber-600">{lookupError}</p>}
                    </Card>
                </div>
            </div>
        </div>
    )
}

function Term({ label, hint, value }: { label: string; hint: string; value: number }) {
    return (
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <div>
                <span>{label}</span>
                <span className="text-muted-foreground ml-2 text-xs">{hint}</span>
            </div>
            <span className={`tabular-nums ${value < 0 ? 'text-amber-600' : value === 0 ? 'text-muted-foreground' : ''}`}>
                {value > 0 ? '+' : ''}
                {value}
            </span>
        </div>
    )
}

function CopyLine({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard.writeText(value)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
            }}
            className="bg-muted/40 hover:bg-muted flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs">
            <span className="min-w-0">
                <span className="text-muted-foreground">{label}</span>
                <span className="block truncate font-mono">{value}</span>
            </span>
            {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="text-muted-foreground size-3.5 shrink-0" />}
        </button>
    )
}
