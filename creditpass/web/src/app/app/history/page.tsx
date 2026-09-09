'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { ConnectPrompt, Loading, Notice, Stat, useApp } from '@/components/app-shell'
import { ProofTable } from '@/components/proof-table'
import { ProveHistory } from '@/components/prove-history'
import { Card } from '@/components/ui/card'
import { ADDRESSES, EXPLORER, SCORE, explorerUrl, historySpan, sourceExplorerUrl } from '@/lib/creditpass'

/**
 * History: what the connected wallet has proved, and the place to prove more.
 *
 * Left is the record — every source-chain transaction verified on Creditcoin, with provenance.
 * Right is the action — paste a hash, get a proof, submit it. The two sit together because the
 * only way to change the left is the right.
 */
export default function HistoryPage() {
    const { snapshot, wallet } = useApp()

    if (!wallet) {
        return (
            <ConnectPrompt title="Your history is wallet-scoped.">
                It lists every transaction this wallet has proved on Creditcoin and lets you prove more. Connect to see yours; anyone&apos;s public
                record is on the Passport page.
            </ConnectPrompt>
        )
    }
    if (!snapshot) return <Loading what="your history" />

    const { profile, history } = snapshot
    const counted = Math.min(profile.repayments, SCORE.maxCountedRepayments)
    const nextCountable = profile.lastCountedBlock > 0 ? profile.lastCountedBlock + SCORE.minBlockGap : 0

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
                <Card className="p-6">
                    <div className="flex items-baseline justify-between gap-4">
                        <div>
                            <div className="font-medium">Attested history</div>
                            <p className="text-muted-foreground mt-1 text-sm">
                                Each row is one Ethereum transaction proved on Creditcoin through the Attestcoin Protocol. Nothing here was reported by anyone.
                            </p>
                        </div>
                        {ADDRESSES.asc && EXPLORER && (
                            <Link
                                href={explorerUrl('address', ADDRESSES.asc)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-sm">
                                ASC contract <ArrowUpRight className="size-3.5" />
                            </Link>
                        )}
                    </div>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Proved events"
                            value={history.length}
                        />
                        <Stat
                            label="Repayments counted"
                            value={`${counted} / ${SCORE.maxCountedRepayments}`}
                            hint={profile.repayments > counted ? `${profile.repayments - counted} beyond the cap` : undefined}
                        />
                        <Stat
                            label="Protocols"
                            value={profile.protocolCount}
                        />
                        <Stat
                            label="History span"
                            value={snapshot.known ? historySpan(profile) : '—'}
                        />
                    </dl>

                    {nextCountable > 0 && (
                        <p className="text-muted-foreground mt-6 text-xs">
                            The next repayment that counts must be from Ethereum block{' '}
                            <Link
                                href={sourceExplorerUrl(3, 'block', nextCountable)}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-foreground font-mono underline">
                                #{nextCountable.toLocaleString()}
                            </Link>{' '}
                            or later — one counted repayment per {SCORE.minBlockGap.toLocaleString()} blocks, so a record cannot be farmed in an afternoon.
                        </p>
                    )}
                </Card>

                <Card className="p-6">
                    {snapshot.historyError && (
                        <Notice tone="warn">History log query failed ({snapshot.historyError}). The score is still read straight from the registry.</Notice>
                    )}
                    {history.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">Nothing proved yet. Start with a repayment on the right.</p>
                    ) : (
                        <ProofTable history={history} />
                    )}
                </Card>
            </div>

            <div className="lg:col-span-2">
                <ProveHistory />
            </div>
        </div>
    )
}
