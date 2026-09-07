'use client'

import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers'
import { Loader2 } from 'lucide-react'

import { Faucet, Loading, Notice, Row, Stat, useApp } from '@/components/app-shell'
import { VaultChart } from '@/components/vault-chart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ADDRESSES, ERC20_ABI, LINE_ABI, formatAmount, formatPercent, loadVaultHistory, loadVaultPosition, shorten, type VaultHistory, type VaultPosition } from '@/lib/creditpass'
import { ensureCreditcoinNetwork } from '@/lib/wallet'

function plain(value: bigint, decimals: number) {
    return formatUnits(value, decimals).replace(/\.?0+$/, '') || '0'
}
function parseSafe(value: string, decimals: number): bigint | null {
    if (!value.trim()) return null
    try {
        return parseUnits(value, decimals)
    } catch {
        return null
    }
}

/** Blocks per year on Creditcoin at ~15s. Mirrors CreditLine.BLOCKS_PER_YEAR. */
const BLOCKS_PER_YEAR = 2_102_400

/**
 * Earn: supply the vault's asset and take the interest borrowers pay.
 *
 * Left: the rate, where it comes from, and how the vault has moved. Right: your position — read
 * for the connected wallet, not the address in the lookup bar, because the buttons spend the
 * wallet — with supply and withdraw in one place and a projection that is arithmetic, not a promise.
 */
export default function EarnPage() {
    const { snapshot, wallet, provider, refresh } = useApp()
    const [position, setPosition] = useState<VaultPosition | null>(null)
    const [history, setHistory] = useState<VaultHistory | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    const reload = useCallback(() => {
        if (wallet) loadVaultPosition(wallet).then(setPosition).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        else setPosition(null)
    }, [wallet])
    useEffect(reload, [reload])
    useEffect(() => {
        loadVaultHistory()
            .then(setHistory)
            .catch(() => setHistory(null))
    }, [])

    if (!snapshot) return <Loading />
    const { decimals, symbol } = snapshot.asset
    const { vault } = snapshot

    const act = async (key: string, run: () => Promise<void>) => {
        setError(null)
        setBusy(key)
        try {
            await run()
            reload()
            refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(null)
        }
    }
    const signer = async () => {
        if (!provider) throw new Error('Connect a wallet first.')
        await ensureCreditcoinNetwork(provider)
        return new BrowserProvider(provider).getSigner()
    }
    const supply = (amount: bigint) =>
        act('supply', async () => {
            const s = await signer()
            const me = await s.getAddress()
            const line = new Contract(ADDRESSES.line, LINE_ABI, s)
            const asset = new Contract(await line.asset(), ERC20_ABI, s)
            await (await asset.approve(ADDRESSES.line, amount)).wait()
            await (await line.deposit(amount, me)).wait()
        })
    const withdraw = (amount: bigint) =>
        act('withdraw', async () => {
            const s = await signer()
            const me = await s.getAddress()
            await (await new Contract(ADDRESSES.line, LINE_ABI, s).withdraw(amount, me, me)).wait()
        })

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
                <Card className="p-6">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div className="text-muted-foreground text-sm">Supply APR</div>
                            <div className="mt-1 flex items-baseline gap-3">
                                <span className="text-5xl font-semibold tracking-tight">{formatPercent(vault.supplyAprBps)}</span>
                                <span className="text-muted-foreground text-sm">now</span>
                            </div>
                        </div>
                        <div className="text-right text-sm">
                            <div className="text-muted-foreground">Borrowers pay</div>
                            <div className="font-medium tabular-nums">{formatPercent(vault.borrowAprBps)}</div>
                        </div>
                    </div>

                    <div className="mt-6">
                        <div className="text-muted-foreground mb-2 flex justify-between text-xs">
                            <span>{formatPercent(vault.utilisationBps)} of the vault is lent out</span>
                            <span>{formatAmount(vault.availableLiquidity, decimals)} {symbol} idle</span>
                        </div>
                        <div className="bg-muted h-2 overflow-hidden rounded-full">
                            <div
                                className="bg-foreground h-full rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(100, vault.utilisationBps / 100)}%` }}
                            />
                        </div>
                    </div>
                    <p className="text-muted-foreground mt-3 max-w-2xl text-balance text-sm">
                        Depositors earn the borrow rate scaled by utilisation. Idle cash earns nothing, so this is a fact about the vault right now, not
                        a projection — it rises as borrowers draw, and falls as they repay or as new deposits arrive.
                    </p>

                    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Vault size"
                            value={`${formatAmount(vault.totalAssets, decimals)} ${symbol}`}
                        />
                        <Stat
                            label="Lent out"
                            value={`${formatAmount(vault.totalPrincipal, decimals)} ${symbol}`}
                        />
                        <Stat
                            label="Share price"
                            value={`${formatAmount(vault.shares > 0n ? (vault.shareValue * 10n ** BigInt(decimals)) / vault.shares : 10n ** BigInt(decimals), decimals, 4)} ${symbol}`}
                            hint="per cpUSD"
                        />
                        <Stat
                            label="Loan term"
                            value="~30 days"
                            hint="simple interest, per block"
                        />
                    </dl>
                </Card>

                <Card className="p-6">
                    {history ? (
                        <VaultChart
                            history={history}
                            symbol={symbol}
                        />
                    ) : (
                        <Loading what="vault history" />
                    )}
                </Card>

                <Card className="p-6">
                    <div className="font-medium">You are the collateral</div>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                        These loans are uncollateralised, so a default is written off against depositors — the share price drops and you carry the
                        loss. That is the honest arrangement: the yield is the compensation for underwriting reputation instead of holding a lien. It
                        is also why the score is deliberately hard to farm, and why liquidations and defaults are never rate-limited.
                    </p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Row label="Share token" value="cpUSD · ERC4626" />
                        <Row label="Interest model" value="Simple, per block" />
                        <Row label="Loss on default" value="Full principal" />
                        <Row label="Exit when fully lent" value="Sell on Swap" />
                    </div>
                </Card>
            </div>

            <div className="lg:col-span-2">
                <PositionCard
                    position={position}
                    connected={Boolean(wallet)}
                    demo={snapshot.demo}
                    decimals={decimals}
                    symbol={symbol}
                    supplyAprBps={vault.supplyAprBps}
                    busy={busy}
                    error={error}
                    onSupply={supply}
                    onWithdraw={withdraw}
                />
            </div>
        </div>
    )
}

function PositionCard({
    position,
    connected,
    demo,
    decimals,
    symbol,
    supplyAprBps,
    busy,
    error,
    onSupply,
    onWithdraw,
}: {
    position: VaultPosition | null
    connected: boolean
    demo: boolean
    decimals: number
    symbol: string
    supplyAprBps: number
    busy: string | null
    error: string | null
    onSupply: (amount: bigint) => void
    onWithdraw: (amount: bigint) => void
}) {
    const [mode, setMode] = useState<'supply' | 'withdraw'>('supply')
    const [input, setInput] = useState('')
    const amount = parseSafe(input, decimals)

    const limit = position ? (mode === 'supply' ? position.assetBalance : position.maxWithdraw) : null
    const over = limit !== null && amount !== null && amount > limit
    const locked = position && position.shareValue > position.maxWithdraw ? position.shareValue - position.maxWithdraw : 0n

    // A projection that is just arithmetic on the current rate — it will be wrong the moment
    // utilisation moves, and the copy says so.
    const base = mode === 'supply' && amount ? (position?.shareValue ?? 0n) + amount : (position?.shareValue ?? 0n)
    const yearly = (base * BigInt(supplyAprBps)) / 10_000n
    const monthly = yearly / 12n

    const problem = !connected
        ? 'Connect a wallet to see and manage your position.'
        : demo
          ? 'Demo — actions are disabled until the contracts are deployed.'
          : amount === null || amount === 0n
            ? null
            : over
              ? mode === 'supply'
                  ? `You hold ${formatAmount(limit!, decimals)} ${symbol}.`
                  : `Only ${formatAmount(limit!, decimals)} ${symbol} is withdrawable right now — the rest is out on loan.`
              : null
    const canSubmit = connected && !demo && amount !== null && amount > 0n && !over && busy === null

    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <div className="text-lg font-semibold tracking-tight">Your position</div>
                {position && <span className="text-muted-foreground font-mono text-xs">{shorten(position.address)}</span>}
            </div>

            {position ? (
                <>
                    <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-4xl font-semibold tracking-tight">{formatAmount(position.shareValue, decimals)}</span>
                        <span className="text-muted-foreground">{symbol}</span>
                    </div>
                    {position.earned === null ? (
                        <div className="text-muted-foreground mt-1 text-sm">
                            Bought on the market, so the vault never saw an entry price — yield shows from the next deposit.
                        </div>
                    ) : (
                        <div className={`mt-1 text-sm tabular-nums ${position.earned > 0n ? 'text-emerald-600' : position.earned < 0n ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {position.earned >= 0n ? '+' : '−'}
                            {formatAmount(position.earned < 0n ? -position.earned : position.earned, decimals)} {symbol} earned
                            <span className="text-muted-foreground">
                                {' '}· entered at {formatAmount(position.entryPrice!, decimals, 4)} per share
                            </span>
                        </div>
                    )}

                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
                        <Stat label="Shares" value={formatAmount(position.shares, decimals)} hint="cpUSD" />
                        <Stat label="Withdrawable now" value={formatAmount(position.maxWithdraw, decimals)} hint={locked > 0n ? `${formatAmount(locked, decimals)} out on loan` : 'all of it'} />
                        <Stat label="Wallet balance" value={formatAmount(position.assetBalance, decimals)} hint={symbol} />
                        <Stat label="Activity" value={`${position.deposits} in · ${position.withdrawals} out`} />
                    </dl>
                </>
            ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                    Connect a wallet to see what you hold and what it has earned. Everything on the left is readable without one.
                </p>
            )}

            <div className="mt-6 border-t pt-5">
                <div className="bg-muted flex rounded-full p-1 text-sm">
                    {(['supply', 'withdraw'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => {
                                setMode(m)
                                setInput('')
                            }}
                            className={`flex-1 rounded-full py-1.5 capitalize duration-150 ${mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                            {m}
                        </button>
                    ))}
                </div>

                <div className="relative mt-3">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Amount in ${symbol}`}
                        inputMode="decimal"
                        className="h-11 pr-14 text-base"
                    />
                    {limit !== null && limit > 0n && (
                        <button
                            type="button"
                            onClick={() => setInput(plain(limit, decimals))}
                            className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                            Max
                        </button>
                    )}
                </div>

                {position && (
                    <div className="bg-muted/40 mt-3 space-y-2 rounded-xl px-3 py-2.5 text-xs">
                        <Row label={mode === 'supply' && amount ? 'Position after' : 'Position'} value={`${formatAmount(base, decimals)} ${symbol}`} />
                        <Row label="At today's rate, per month" value={`≈ ${formatAmount(monthly, decimals)} ${symbol}`} />
                        <Row label="Per year" value={`≈ ${formatAmount(yearly, decimals)} ${symbol}`} strong />
                        <p className="text-muted-foreground pt-1">
                            Arithmetic on the rate right now ({formatPercent(supplyAprBps)}). It changes the moment utilisation does.
                        </p>
                    </div>
                )}

                <Button
                    size="lg"
                    className="mt-3 h-11 w-full"
                    disabled={!canSubmit}
                    onClick={() => (mode === 'supply' ? onSupply(amount!) : onWithdraw(amount!))}>
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    {!connected ? 'Connect wallet' : mode === 'supply' ? `Supply ${symbol}` : `Withdraw ${symbol}`}
                </Button>
                <p className="text-muted-foreground mt-2 min-h-4 text-xs">
                    {problem ?? (mode === 'supply' ? 'Mints cpUSD shares at the current share price. No lock-up.' : 'Burns shares for the asset. Capped by cash on hand; the rest can be sold on Swap.')}
                </p>
                {error && <Notice tone="warn">{error}</Notice>}

                {connected && !demo && (
                    <div className="mt-4 border-t pt-4">
                        <Faucet />
                    </div>
                )}
            </div>
        </Card>
    )
}
