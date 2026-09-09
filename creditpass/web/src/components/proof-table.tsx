'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Check, ChevronDown } from 'lucide-react'

import {
    ACTION_LABELS,
    PROTOCOL_NAMES,
    PROTOCOL_POOLS,
    SOURCE_EXPLORERS,
    explorerUrl,
    shorten,
    sourceExplorerUrl,
    type HistoryEntry,
} from '@/lib/creditpass'

/**
 * Attested entries, each expandable into its provenance.
 *
 * A row that only says "verified" asks to be believed. Opened up, it names the chain, the block, the
 * pool that emitted the event, the query id that makes it unrepeatable, and the Creditcoin
 * transaction that carried it — with the source block linked out to Etherscan so the original
 * borrowing can be read at first hand.
 */
export function ProofTable({ history, limit }: { history: HistoryEntry[]; limit?: number }) {
    const [expanded, setExpanded] = useState<string | null>(null)
    const rows = limit ? history.slice(0, limit) : history

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-150 text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                    <tr className="*:pb-3 *:font-normal">
                        <th>Protocol</th>
                        <th>Event</th>
                        <th>Source block</th>
                        <th>Query id</th>
                        <th className="text-right">Proof</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {rows.map((entry) => {
                        const key = `${entry.queryId}-${entry.sourceBlock}`
                        const open = expanded === key
                        return (
                            <ProofRow
                                key={key}
                                entry={entry}
                                open={open}
                                onToggle={() => setExpanded(open ? null : key)}
                            />
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

function ProofRow({ entry, open, onToggle }: { entry: HistoryEntry; open: boolean; onToggle: () => void }) {
    const source = SOURCE_EXPLORERS[entry.chainKey]
    const pool = PROTOCOL_POOLS[entry.protocolId]
    const blockUrl = sourceExplorerUrl(entry.chainKey, 'block', entry.sourceBlock)
    const poolUrl = pool ? sourceExplorerUrl(entry.chainKey, 'address', pool) : ''
    const proofUrl = entry.txHash ? explorerUrl('tx', entry.txHash) : ''

    return (
        <>
            <tr
                className="hover:bg-muted/40 cursor-pointer *:py-3"
                onClick={onToggle}>
                <td className="font-medium">{PROTOCOL_NAMES[entry.protocolId] ?? `Protocol ${entry.protocolId}`}</td>
                <td>{ACTION_LABELS[entry.action] ?? `Action ${entry.action}`}</td>
                <td className="font-mono text-xs">#{entry.sourceBlock.toLocaleString()}</td>
                <td className="text-muted-foreground font-mono text-xs">{shorten(entry.queryId)}</td>
                <td className="text-right">
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <span className="bg-foreground text-background inline-flex size-4 items-center justify-center rounded-full">
                            <Check className="size-2.5" />
                        </span>
                        <ChevronDown className={`size-3.5 duration-200 ${open ? 'rotate-180' : ''}`} />
                    </span>
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={5}>
                        <div className="bg-muted/40 mb-3 grid gap-x-8 gap-y-4 rounded-xl p-5 sm:grid-cols-2 lg:grid-cols-3">
                            <Detail
                                label="Source chain"
                                value={source ? `${source.name} (chainKey ${entry.chainKey})` : `chainKey ${entry.chainKey}`}
                            />
                            <Detail
                                label="Source block"
                                value={`#${entry.sourceBlock.toLocaleString()}`}
                                href={blockUrl}
                                hint="read the original transaction"
                            />
                            <Detail
                                label="Emitting pool"
                                value={pool ? shorten(pool) : '—'}
                                href={poolUrl}
                                hint="only this address is accepted"
                            />
                            <Detail
                                label="Query id"
                                value={shorten(entry.queryId)}
                                hint="makes this proof unrepeatable"
                            />
                            <Detail
                                label="Proof transaction"
                                value={entry.txHash ? shorten(entry.txHash) : '—'}
                                href={proofUrl}
                                hint="where it was verified on Creditcoin"
                            />
                            <Detail
                                label="Verified by"
                                value="Block-prover precompile"
                                hint="Merkle inclusion + continuity, one block"
                            />
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

function Detail({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
    return (
        <div>
            <div className="text-muted-foreground text-xs">{label}</div>
            {href ? (
                <Link
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground mt-1 flex items-center gap-1 font-mono text-sm">
                    {value}
                    <ArrowUpRight className="size-3 opacity-50" />
                </Link>
            ) : (
                <div className="mt-1 font-mono text-sm">{value}</div>
            )}
            {hint && <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div>}
        </div>
    )
}
