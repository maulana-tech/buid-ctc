'use client'

import { AmountAction, Row, Stat, useApp } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { formatAmount, formatPercent, tierOf } from '@/lib/creditpass'

export default function BorrowPage() {
    const { snapshot, owns } = useApp()
    if (!snapshot) return null

    const { decimals, symbol } = snapshot.asset
    const tier = tierOf(snapshot.score, snapshot.minScore)
    const headroom = snapshot.limit > snapshot.loan.principal ? snapshot.limit - snapshot.loan.principal : 0n

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
                <Card className="p-6">
                    <div className="text-muted-foreground text-sm">Your credit line</div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatAmount(snapshot.limit, decimals)}</span>
                        <span className="text-muted-foreground">{symbol}</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm">
                        {tier.multiplier > 0
                            ? `Score ${snapshot.score} puts you in the ${tier.label.toLowerCase()} band — ${tier.multiplier}× the base unit, with no collateral posted.`
                            : `A score of ${snapshot.minScore} opens the first band. Prove more repayment history to get there.`}
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
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
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

            <Card className="flex flex-col gap-6 p-6">
                <div>
                    <div className="text-muted-foreground text-sm">Open loan</div>
                    <div className="mt-4 space-y-3">
                        <Row
                            label="Principal"
                            value={`${formatAmount(snapshot.loan.principal, decimals)} ${symbol}`}
                        />
                        <Row
                            label="Owed with interest"
                            value={`${formatAmount(snapshot.owed, decimals)} ${symbol}`}
                            strong
                        />
                        <Row
                            label="Due at block"
                            value={snapshot.loan.active ? `#${snapshot.loan.dueBlock.toLocaleString()}` : '—'}
                        />
                        <Row
                            label="Wallet balance"
                            value={`${formatAmount(snapshot.asset.balance, decimals)} ${symbol}`}
                        />
                    </div>
                </div>

                <div className="space-y-6 border-t pt-6">
                    <div>
                        <div className="mb-3 text-sm font-medium">Borrow</div>
                        <AmountAction
                            method="borrow"
                            label="Borrow"
                            max={headroom < snapshot.vault.availableLiquidity ? headroom : snapshot.vault.availableLiquidity}
                            disabled={!owns || snapshot.loan.active || headroom === 0n}
                            disabledReason={
                                snapshot.loan.active
                                    ? 'Repay the open loan before drawing again.'
                                    : headroom === 0n
                                      ? 'No headroom on this score.'
                                      : 'Connect this address to borrow against it.'
                            }
                        />
                    </div>

                    <div>
                        <div className="mb-3 text-sm font-medium">Repay</div>
                        <AmountAction
                            method="repay"
                            label="Repay"
                            max={snapshot.owed}
                            disabled={!owns || !snapshot.loan.active}
                            disabledReason={snapshot.loan.active ? 'Connect this address to repay it.' : 'No open loan.'}
                        />
                    </div>
                </div>
            </Card>
        </div>
    )
}
