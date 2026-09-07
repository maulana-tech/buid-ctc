'use client'

import Link from 'next/link'

import { AmountAction, Loading, Notice, Row, Stat, useApp } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { formatAmount, formatPercent } from '@/lib/creditpass'

export default function WithdrawPage() {
    const { snapshot } = useApp()
    if (!snapshot) return <Loading />

    const { decimals, symbol } = snapshot.asset
    const { vault } = snapshot
    const locked = vault.shareValue > vault.maxWithdraw ? vault.shareValue - vault.maxWithdraw : 0n

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
                <Card className="p-6">
                    <div className="text-muted-foreground text-sm">Withdrawable now</div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-5xl font-semibold tracking-tight tabular-nums">{formatAmount(vault.maxWithdraw, decimals)}</span>
                        <span className="text-muted-foreground">{symbol}</span>
                    </div>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Position value"
                            value={formatAmount(vault.shareValue, decimals)}
                        />
                        <Stat
                            label="Locked in loans"
                            value={formatAmount(locked, decimals)}
                            bad={locked > 0n}
                        />
                        <Stat
                            label="Pool liquidity"
                            value={formatAmount(vault.availableLiquidity, decimals)}
                        />
                        <Stat
                            label="Utilisation"
                            value={formatPercent(vault.utilisationBps)}
                        />
                    </dl>
                </Card>

                {locked > 0n && (
                    <Notice>
                        Part of your position is out on loan and cannot be withdrawn until borrowers repay. The cap above is the real limit, shown up
                        front rather than as a failed transaction.
                    </Notice>
                )}

                <Card className="p-6">
                    <div className="font-medium">How withdrawal is priced</div>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                        Your shares are redeemed against the vault&apos;s total assets: idle cash plus principal out on loan. Interest lands when a
                        borrower repays, so the share price steps up at repayment rather than drifting up continuously. Defaults move it the other way.
                    </p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <Row
                            label="Total vault assets"
                            value={`${formatAmount(vault.totalAssets, decimals)} ${symbol}`}
                        />
                        <Row
                            label="Of which lent out"
                            value={`${formatAmount(vault.totalPrincipal, decimals)} ${symbol}`}
                        />
                    </div>
                </Card>
            </div>

            <Card className="flex flex-col gap-6 p-6">
                <div>
                    <div className="text-muted-foreground text-sm">Withdraw</div>
                    <div className="mt-4 space-y-3">
                        <Row
                            label="Shares held"
                            value={formatAmount(vault.shares, decimals)}
                        />
                        <Row
                            label="Redeemable"
                            value={`${formatAmount(vault.maxWithdraw, decimals)} ${symbol}`}
                            strong
                        />
                    </div>
                </div>

                <div className="border-t pt-6">
                    <AmountAction
                        method="withdraw"
                        label="Withdraw"
                        max={vault.maxWithdraw}
                        disabled={vault.maxWithdraw === 0n}
                        disabledReason="Nothing withdrawable — the pool is fully lent out or you hold no shares."
                    />
                </div>

                <p className="text-muted-foreground mt-auto border-t pt-4 text-xs">
                    Want to add instead?{' '}
                    <Link
                        href="/app/earn"
                        className="hover:text-foreground underline">
                        Supply on the Earn page
                    </Link>
                    .
                </p>
            </Card>
        </div>
    )
}
