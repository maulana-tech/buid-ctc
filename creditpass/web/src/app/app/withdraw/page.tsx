'use client'

import Link from 'next/link'

import { AmountAction, Loading, Notice, Row, Stat, useApp } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { formatAmount, formatPercent } from '@/lib/creditpass'

export default function WithdrawPage() {
    const { snapshot, owns } = useApp()
    if (!snapshot) return <Loading />

    const { decimals, symbol } = snapshot.asset
    const { vault } = snapshot
    const unit = 10n ** BigInt(decimals)
    const locked = vault.shareValue > vault.maxWithdraw ? vault.shareValue - vault.maxWithdraw : 0n
    const sharePrice = vault.shares > 0n ? (vault.shareValue * unit) / vault.shares : unit

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
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

            <div className="lg:col-span-2">
                <Card className="p-5">
                    <div className="flex items-center justify-between">
                        <div className="text-lg font-semibold tracking-tight">Withdraw</div>
                        <div className="text-muted-foreground text-xs">
                            1 share = {formatAmount(sharePrice, decimals, 4)} {symbol}
                        </div>
                    </div>

                    <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatAmount(vault.shareValue, decimals)}</span>
                        <span className="text-muted-foreground">{symbol}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-sm">
                        {formatAmount(vault.shares, decimals)} cpUSD shares
                        {locked > 0n ? ` · ${formatAmount(locked, decimals)} ${symbol} out on loan` : ''}
                    </div>

                    <div className="mt-6 border-t pt-5">
                        <AmountAction
                            method="withdraw"
                            label="Withdraw"
                            max={vault.maxWithdraw}
                            disabled={!owns || vault.maxWithdraw === 0n}
                            disabledReason={
                                vault.maxWithdraw === 0n ? 'Nothing withdrawable — the pool is fully lent out or you hold no shares.' : 'Connect a wallet to withdraw.'
                            }
                            hint="Burns shares for the asset at the current share price. Capped by cash on hand; the rest can be sold on Swap."
                            summary={(value) => (
                                <>
                                    <Row
                                        label="Shares burned"
                                        value={`≈ ${formatAmount((value * unit) / sharePrice, decimals)} cpUSD`}
                                    />
                                    <Row
                                        label="Position after"
                                        value={`${formatAmount(vault.shareValue - value, decimals)} ${symbol}`}
                                        strong
                                    />
                                </>
                            )}
                        />
                    </div>

                    <p className="text-muted-foreground mt-4 border-t pt-4 text-xs">
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
        </div>
    )
}
