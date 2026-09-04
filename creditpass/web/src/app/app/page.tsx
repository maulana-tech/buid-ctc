'use client'

import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'

import { Notice, Stat, useApp } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { ACTION_LABELS, ADDRESSES, EXPLORER, PROTOCOL_NAMES, formatAmount, historySpan, shorten, tierOf } from '@/lib/creditpass'

export default function PassportPage() {
    const { snapshot } = useApp()
    if (!snapshot) return null

    const tier = tierOf(snapshot.score, snapshot.minScore)
    const { decimals, symbol } = snapshot.asset

    if (!snapshot.known) {
        return (
            <Card className="p-10 text-center">
                <p className="text-lg font-medium">No attested history for this address.</p>
                <p className="text-muted-foreground mx-auto mt-2 max-w-md text-balance text-sm">
                    An unknown address and a ruined one both score zero — they are not the same thing, so CreditPass refuses to guess. Run the worker
                    against this address to prove its record on Aave, Spark, or Morpho.
                </p>
            </Card>
        )
    }

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <div className="text-muted-foreground text-sm">Credit score</div>
                        <div className="mt-1 flex items-baseline gap-3">
                            <span className="text-6xl font-semibold tracking-tight tabular-nums">{snapshot.score}</span>
                            <span className="text-muted-foreground text-sm">/ 1000</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-medium">{tier.label}</div>
                        <div className="text-muted-foreground text-xs">
                            {tier.multiplier > 0 ? `${tier.multiplier}× base limit` : `Opens at ${snapshot.minScore}`}
                        </div>
                    </div>
                </div>

                <div className="bg-muted mt-6 h-2 overflow-hidden rounded-full">
                    <div
                        className="bg-foreground h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, snapshot.score / 10)}%` }}
                    />
                </div>

                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                    <Stat
                        label="Repayments counted"
                        value={snapshot.profile.repayments}
                    />
                    <Stat
                        label="Borrows observed"
                        value={snapshot.profile.borrows}
                    />
                    <Stat
                        label="Protocols"
                        value={snapshot.profile.protocolCount}
                        hint="Distinct sources proved"
                    />
                    <Stat
                        label="History span"
                        value={historySpan(snapshot.profile)}
                    />
                    <Stat
                        label="Liquidations"
                        value={snapshot.profile.liquidations}
                        bad={snapshot.profile.liquidations > 0}
                    />
                    <Stat
                        label="Defaults"
                        value={snapshot.profile.defaults}
                        bad={snapshot.profile.defaults > 0}
                    />
                </dl>
            </Card>

            <Card className="flex flex-col gap-4 p-6">
                <div className="text-muted-foreground text-sm">At a glance</div>
                <div className="space-y-4">
                    <Stat
                        label="Credit limit"
                        value={`${formatAmount(snapshot.limit, decimals)} ${symbol}`}
                    />
                    <Stat
                        label="Currently owed"
                        value={`${formatAmount(snapshot.owed, decimals)} ${symbol}`}
                        bad={snapshot.loan.active}
                    />
                    <Stat
                        label="Your vault position"
                        value={`${formatAmount(snapshot.vault.shareValue, decimals)} ${symbol}`}
                        hint={`${formatAmount(snapshot.vault.shares, decimals)} shares`}
                    />
                </div>
                <div className="text-muted-foreground mt-auto space-y-1 border-t pt-4 text-sm">
                    <Link
                        className="hover:text-foreground flex items-center gap-1"
                        href="/app/borrow">
                        Borrow against this score <ArrowUpRight className="size-3.5" />
                    </Link>
                    <Link
                        className="hover:text-foreground flex items-center gap-1"
                        href="/app/earn">
                        Supply and earn <ArrowUpRight className="size-3.5" />
                    </Link>
                </div>
            </Card>

            <Card className="p-6 lg:col-span-3">
                <div className="flex items-baseline justify-between gap-4">
                    <div>
                        <div className="font-medium">Attested history</div>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Each row is one source-chain transaction proved on Creditcoin. Nothing here was reported by anyone.
                        </p>
                    </div>
                    {ADDRESSES.asc && EXPLORER && (
                        <Link
                            href={`${EXPLORER}/address/${ADDRESSES.asc}`}
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                            ASC contract <ArrowUpRight className="size-3.5" />
                        </Link>
                    )}
                </div>

                {snapshot.historyError && (
                    <Notice tone="warn">History log query failed ({snapshot.historyError}). The score above is still read straight from the registry.</Notice>
                )}

                {snapshot.history.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-sm">No proofs submitted for this address yet.</p>
                ) : (
                    <div className="mt-6 overflow-x-auto">
                        <table className="w-full min-w-150 text-sm">
                            <thead className="text-muted-foreground text-left text-xs">
                                <tr className="*:pb-3 *:font-normal">
                                    <th>Protocol</th>
                                    <th>Event</th>
                                    <th>Source block</th>
                                    <th>Query id</th>
                                    <th className="text-right">Verified</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {snapshot.history.map((entry) => (
                                    <tr
                                        key={`${entry.queryId}-${entry.sourceBlock}`}
                                        className="*:py-3">
                                        <td className="font-medium">{PROTOCOL_NAMES[entry.protocolId] ?? `Protocol ${entry.protocolId}`}</td>
                                        <td>{ACTION_LABELS[entry.action] ?? `Action ${entry.action}`}</td>
                                        <td className="font-mono text-xs">#{entry.sourceBlock.toLocaleString()}</td>
                                        <td className="text-muted-foreground font-mono text-xs">{shorten(entry.queryId)}</td>
                                        <td className="text-right">
                                            <span className="bg-foreground text-background inline-flex size-4 items-center justify-center rounded-full">
                                                <Check className="size-2.5" />
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    )
}
