'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { AmountAction, ConnectPrompt, Faucet, Loading, ModeToggle, Row, Stat, useApp } from '@/components/app-shell'
import { ProveHistory } from '@/components/prove-history'
import { Card } from '@/components/ui/card'
import { SCORE, formatAmount, formatPercent, provider, tierOf } from '@/lib/creditpass'

/** Mirrors CreditLine: ~30-day term at ~15s blocks, simple interest per block. */
const TERM_BLOCKS = 172_800n
const BLOCKS_PER_YEAR = 2_102_400n
const BLOCKS_PER_DAY = 5_760

function dueText(blocks: number) {
    if (blocks <= 0) return 'overdue'
    const days = blocks / BLOCKS_PER_DAY
    return days >= 1 ? `due in ~${Math.floor(days)}d` : `due in ~${Math.round(days * 24)}h`
}

export default function BorrowPage() {
    const { snapshot, owns, wallet } = useApp()
    const [mode, setMode] = useState<'borrow' | 'repay'>('borrow')
    const [head, setHead] = useState<number | null>(null)
    useEffect(() => {
        provider()
            .getBlockNumber()
            .then(setHead)
            .catch(() => setHead(null))
    }, [])

    if (!wallet) {
        return (
            <ConnectPrompt title="Borrowing follows your wallet.">
                The credit line is bound to the address whose history was proved. Connect to see your limit and draw against it.
            </ConnectPrompt>
        )
    }
    if (!snapshot) return <Loading />

    const { decimals, symbol } = snapshot.asset
    const tier = tierOf(snapshot.score, snapshot.minScore)
    const headroom = snapshot.limit > snapshot.loan.principal ? snapshot.limit - snapshot.loan.principal : 0n
    const drawable = headroom < snapshot.vault.availableLiquidity ? headroom : snapshot.vault.availableLiquidity
    const interestAtTerm = (value: bigint) => (value * BigInt(snapshot.vault.borrowAprBps) * TERM_BLOCKS) / (10_000n * BLOCKS_PER_YEAR)
    const locked = snapshot.score < snapshot.minScore
    const repaymentsNeeded = Math.ceil((snapshot.minScore - snapshot.score) / SCORE.perRepayment)
    const blocksLeft = snapshot.loan.active && head !== null ? snapshot.loan.dueBlock - head : null

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
                <Card className="p-6">
                    <div className="text-muted-foreground text-sm">Your credit line</div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatAmount(snapshot.limit, decimals)}</span>
                        <span className="text-muted-foreground">{symbol}</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm">
                        {tier.multiplier > 0
                            ? `Score ${snapshot.score} puts you in the ${tier.label.toLowerCase()} band — ${tier.multiplier}× the base unit, with no collateral posted.`
                            : snapshot.known
                              ? `Score ${snapshot.score}. The first band opens at ${snapshot.minScore} — about ${repaymentsNeeded} more counted ${repaymentsNeeded === 1 ? 'repayment' : 'repayments'}, each at least ${SCORE.minBlockGap.toLocaleString()} Ethereum blocks apart.`
                              : `No attested history yet. Prove a repayment on Aave V3, Spark or Morpho Blue to start at 325; the first band opens at ${snapshot.minScore}.`}
                    </p>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Drawn"
                            value={formatAmount(snapshot.loan.principal, decimals)}
                        />
                        <Stat
                            label="Headroom"
                            value={formatAmount(headroom, decimals)}
                        />
                        <Stat
                            label="Borrow APR"
                            value={formatPercent(snapshot.vault.borrowAprBps)}
                        />
                        <Stat
                            label="Pool liquidity"
                            value={formatAmount(snapshot.vault.availableLiquidity, decimals)}
                        />
                    </dl>
                </Card>

                <Card className="p-6">
                    <div className="font-medium">What a default costs</div>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                        Nothing is seized, because nothing was posted. Instead the loan is closed against the depositors who funded it, and your score
                        drops 300 points — enough to shut the credit line entirely and stay shut until you rebuild the record. The penalty is the
                        reputation, and the reputation is bound to an address whose history you cannot recreate.
                    </p>
                    <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                        <Row
                            label="Term"
                            value="~30 days"
                        />
                        <Row
                            label="Default penalty"
                            value="−300 points"
                        />
                        <Row
                            label="Liquidation penalty"
                            value="−150 points"
                        />
                    </div>
                </Card>
            </div>

            <div className="space-y-6 lg:col-span-2">
                {locked && !snapshot.loan.active ? (
                    <>
                        <ProveHistory />
                        <p className="text-muted-foreground text-xs">
                            Every counted repayment is worth {SCORE.perRepayment} points. See the full formula on your{' '}
                            <Link
                                href="/app"
                                className="hover:text-foreground underline">
                                passport
                            </Link>
                            .
                        </p>
                    </>
                ) : (
                <Card className="p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold tracking-tight">Borrow</div>
                        <div className="text-muted-foreground text-xs">{formatPercent(snapshot.vault.borrowAprBps)} APR · ~30 days</div>
                    </div>

                    <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatAmount(snapshot.owed, decimals)}</span>
                        <span className="text-muted-foreground">{symbol} owed</span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-sm">
                        {snapshot.loan.active
                            ? `${formatAmount(snapshot.loan.principal, decimals)} ${symbol} principal · ${blocksLeft === null ? `due at block #${snapshot.loan.dueBlock.toLocaleString()}` : dueText(blocksLeft)}`
                            : 'No open loan.'}
                    </div>

                    <div className="mt-6 border-t pt-5">
                        <ModeToggle
                            modes={['borrow', 'repay'] as const}
                            mode={mode}
                            onChange={setMode}
                        />
                        <div className="mt-3">
                            {mode === 'borrow' ? (
                                <AmountAction
                                    key="borrow"
                                    method="borrow"
                                    label="Borrow"
                                    max={drawable}
                                    disabled={!owns || snapshot.loan.active || headroom === 0n}
                                    disabledReason={
                                        snapshot.loan.active
                                            ? 'Repay the open loan before drawing again.'
                                            : headroom === 0n
                                              ? 'No headroom on this score.'
                                              : 'Connect a wallet to borrow.'
                                    }
                                    hint="Draws against your proved history. Nothing is posted as collateral."
                                    summary={(value) => (
                                        <>
                                            <Row
                                                label="Interest at term"
                                                value={`≈ ${formatAmount(interestAtTerm(value), decimals)} ${symbol}`}
                                            />
                                            <Row
                                                label="Owed at term"
                                                value={`≈ ${formatAmount(value + interestAtTerm(value), decimals)} ${symbol}`}
                                                strong
                                            />
                                            <Row
                                                label="Headroom after"
                                                value={`${formatAmount(headroom - value, decimals)} ${symbol}`}
                                            />
                                        </>
                                    )}
                                />
                            ) : (
                                <AmountAction
                                    key="repay"
                                    method="repay"
                                    label="Repay"
                                    max={snapshot.owed < snapshot.asset.balance ? snapshot.owed : snapshot.asset.balance}
                                    disabled={!owns || !snapshot.loan.active}
                                    disabledReason={snapshot.loan.active ? 'Connect a wallet to repay.' : 'No open loan.'}
                                    hint="Repaying in full on time adds to your score. Interest is settled at repayment."
                                    summary={(value) => (
                                        <>
                                            <Row
                                                label="Owed now"
                                                value={`${formatAmount(snapshot.owed, decimals)} ${symbol}`}
                                            />
                                            <Row
                                                label="Remaining after"
                                                value={`${formatAmount(snapshot.owed > value ? snapshot.owed - value : 0n, decimals)} ${symbol}`}
                                                strong
                                            />
                                            <Row
                                                label="Wallet after"
                                                value={`${formatAmount(snapshot.asset.balance - value, decimals)} ${symbol}`}
                                            />
                                        </>
                                    )}
                                />
                            )}
                        </div>

                        {wallet && !snapshot.demo && (
                            <div className="mt-4 border-t pt-4">
                                <Faucet />
                            </div>
                        )}
                    </div>
                </Card>
                )}
            </div>
        </div>
    )
}
