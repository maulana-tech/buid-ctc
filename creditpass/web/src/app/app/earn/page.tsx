'use client'

import { AmountAction, Row, Stat, useApp } from '@/components/app-shell'
import { Card } from '@/components/ui/card'
import { formatAmount, formatPercent } from '@/lib/creditpass'

export default function EarnPage() {
    const { snapshot } = useApp()
    if (!snapshot) return null

    const { decimals, symbol } = snapshot.asset
    const { vault } = snapshot

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
                <Card className="p-6">
                    <div className="text-muted-foreground text-sm">Supply APR</div>
                    <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-5xl font-semibold tracking-tight tabular-nums">{formatPercent(vault.supplyAprBps)}</span>
                        <span className="text-muted-foreground text-sm">at {formatPercent(vault.utilisationBps)} utilisation</span>
                    </div>
                    <p className="text-muted-foreground mt-3 max-w-2xl text-balance text-sm">
                        Borrowers pay {formatPercent(vault.borrowAprBps)}. Depositors earn that rate scaled by how much of the pool is actually lent
                        out — idle cash earns nothing, so this number is a fact about the pool right now, not a projection.
                    </p>

                    <div className="bg-muted mt-6 h-2 overflow-hidden rounded-full">
                        <div
                            className="bg-foreground h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, vault.utilisationBps / 100)}%` }}
                        />
                    </div>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Total supplied"
                            value={formatAmount(vault.totalAssets, decimals)}
                        />
                        <Stat
                            label="Lent out"
                            value={formatAmount(vault.totalPrincipal, decimals)}
                        />
                        <Stat
                            label="Available"
                            value={formatAmount(vault.availableLiquidity, decimals)}
                        />
                        <Stat
                            label="Borrow APR"
                            value={formatPercent(vault.borrowAprBps)}
                        />
                    </dl>
                </Card>

                <Card className="p-6">
                    <div className="font-medium">You are the collateral</div>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                        These loans are uncollateralised, so a default is written off against depositors — the share price drops and you carry the
                        loss. That is the honest arrangement: the yield is the compensation for underwriting reputation instead of holding a lien. It
                        is also why the score is deliberately hard to farm, and why liquidations and defaults are never rate-limited.
                    </p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <Row
                            label="Share token"
                            value="cpUSD (ERC4626)"
                        />
                        <Row
                            label="Interest model"
                            value="Simple, per block"
                        />
                        <Row
                            label="Loss on default"
                            value="Full principal"
                        />
                    </div>
                </Card>
            </div>

            <Card className="flex flex-col gap-6 p-6">
                <div>
                    <div className="text-muted-foreground text-sm">Your position</div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatAmount(vault.shareValue, decimals)}</span>
                        <span className="text-muted-foreground text-sm">{symbol}</span>
                    </div>
                    <div className="mt-4 space-y-3">
                        <Row
                            label="Shares held"
                            value={formatAmount(vault.shares, decimals)}
                        />
                        <Row
                            label="Withdrawable now"
                            value={`${formatAmount(vault.maxWithdraw, decimals)} ${symbol}`}
                        />
                        <Row
                            label="Wallet balance"
                            value={`${formatAmount(snapshot.asset.balance, decimals)} ${symbol}`}
                        />
                    </div>
                </div>

                <div className="border-t pt-6">
                    <div className="mb-3 text-sm font-medium">Supply</div>
                    <AmountAction
                        method="deposit"
                        label="Supply"
                        max={snapshot.asset.balance}
                    />
                </div>
            </Card>
        </div>
    )
}
