'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Notice, Stat } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { loadDirectory, shorten, tierOf, type DirectoryEntry } from '@/lib/creditpass'

/**
 * Discovery. Without it you have to already know an address to look one up, which rather
 * undermines the claim that the score is public.
 */
export default function DirectoryPage() {
    const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadDirectory()
            .then(setEntries)
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }, [])

    if (error) return <Notice tone="warn">{error}</Notice>
    if (!entries) {
        return (
            <div className="text-muted-foreground flex items-center gap-2 py-24 text-sm">
                <Loader2 className="size-4 animate-spin" /> Reading the registry…
            </div>
        )
    }

    const scored = entries.filter((e) => e.score > 0)
    const averageScore = scored.length > 0 ? Math.round(scored.reduce((sum, e) => sum + e.score, 0) / scored.length) : 0
    const borrowable = entries.filter((e) => e.score >= 500).length

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="font-medium">Every passport in the registry</div>
                <p className="text-muted-foreground mt-1 max-w-2xl text-balance text-sm">
                    Read from the registry&apos;s own events, not an index the contract pays to maintain. Anything on Creditcoin can call{' '}
                    <span className="font-mono text-xs">scoreOf()</span> for any of these; off-chain, the same data is at{' '}
                    <span className="font-mono text-xs">/api/score/&lt;address&gt;</span>.
                </p>

                <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                    <Stat
                        label="Addresses scored"
                        value={entries.length}
                    />
                    <Stat
                        label="Average score"
                        value={averageScore}
                    />
                    <Stat
                        label="Above the credit line"
                        value={borrowable}
                        hint="score 500 or better"
                    />
                    <Stat
                        label="Ever liquidated"
                        value={entries.filter((e) => e.liquidations > 0).length}
                        bad={entries.some((e) => e.liquidations > 0)}
                    />
                </dl>
            </Card>

            <Card className="p-6">
                {entries.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-sm">
                        No passports yet. Run the worker against an address with Aave, Spark or Morpho history.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-150 text-sm">
                            <thead className="text-muted-foreground text-left text-xs">
                                <tr className="*:pb-3 *:font-normal">
                                    <th>Address</th>
                                    <th>Score</th>
                                    <th>Band</th>
                                    <th>Repayments</th>
                                    <th>Protocols</th>
                                    <th className="text-right">Liquidations</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {entries.map((entry) => {
                                    const tier = tierOf(entry.score, 500)
                                    return (
                                        <tr
                                            key={entry.address}
                                            className="*:py-3">
                                            <td>
                                                <Link
                                                    href={`/app?address=${entry.address}`}
                                                    className="hover:text-foreground font-mono text-xs">
                                                    {shorten(entry.address)}
                                                </Link>
                                            </td>
                                            <td className="font-medium tabular-nums">{entry.score}</td>
                                            <td className="text-muted-foreground">{tier.label}</td>
                                            <td className="tabular-nums">{entry.repayments}</td>
                                            <td className="tabular-nums">{entry.protocolCount}</td>
                                            <td className={`text-right tabular-nums ${entry.liquidations > 0 ? 'text-amber-600' : ''}`}>
                                                {entry.liquidations}
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
    )
}
