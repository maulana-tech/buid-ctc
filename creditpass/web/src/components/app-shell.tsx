'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { BrowserProvider, Contract, isAddress, parseUnits } from 'ethers'
import { ArrowLeft, Loader2, Search, TriangleAlert } from 'lucide-react'

import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ADDRESSES, ERC20_ABI, LINE_ABI, isConfigured, loadSnapshot, shorten, type Snapshot } from '@/lib/creditpass'

/** An address to land on so the dashboard has something to show before you type anything. */
const SAMPLE_ADDRESS = '0x7a3f4d1c2b9e8a5f6c0d3e2b1a9f8c7d6e5b4a30'

const TABS = [
    { href: '/app', label: 'Passport' },
    { href: '/app/borrow', label: 'Borrow' },
    { href: '/app/earn', label: 'Earn' },
    { href: '/app/withdraw', label: 'Withdraw' },
]

type AppState = {
    address: string
    wallet: string | null
    owns: boolean
    snapshot: Snapshot | null
    loading: boolean
    error: string | null
    refresh: () => void
}

const AppContext = createContext<AppState | null>(null)

export function useApp() {
    const value = useContext(AppContext)
    if (!value) throw new Error('useApp must be used inside AppShell')
    return value
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [query, setQuery] = useState(SAMPLE_ADDRESS)
    const [address, setAddress] = useState(SAMPLE_ADDRESS)
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [wallet, setWallet] = useState<string | null>(null)

    const load = useCallback(async (target: string) => {
        setLoading(true)
        setError(null)
        try {
            setSnapshot(await loadSnapshot(target))
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            setSnapshot(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load(address)
    }, [address, load])

    const lookup = () => {
        if (!isAddress(query)) {
            setError('That is not a valid address.')
            return
        }
        setAddress(query)
    }

    const connect = async () => {
        const injected = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum
        if (!injected) {
            setError('No injected wallet found. Paste an address instead — every score is public.')
            return
        }
        const [account] = await injected.request({ method: 'eth_requestAccounts' })
        setWallet(account)
        setQuery(account)
        setAddress(account)
    }

    const state: AppState = {
        address,
        wallet,
        owns: wallet?.toLowerCase() === address.toLowerCase(),
        snapshot,
        loading,
        error,
        refresh: () => void load(address),
    }

    return (
        <AppContext.Provider value={state}>
            <div className="min-h-full">
                <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
                        <Link
                            href="/"
                            aria-label="home">
                            <Logo uniColor />
                        </Link>
                        <div className="flex items-center gap-3">
                            <ThemeToggle />
                            {wallet ? (
                                <span className="bg-muted rounded-full px-3 py-1.5 font-mono text-xs">{shorten(wallet)}</span>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={connect}>
                                    Connect wallet
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                nativeButton={false}
                                render={
                                    <Link href="/">
                                        <ArrowLeft />
                                        <span className="max-sm:hidden">Back to site</span>
                                    </Link>
                                }
                            />
                        </div>
                    </div>

                    <div className="mx-auto max-w-7xl px-6">
                        <nav className="-mb-px flex gap-6 overflow-x-auto">
                            {TABS.map((tab) => {
                                const active = pathname === tab.href
                                return (
                                    <Link
                                        key={tab.href}
                                        href={tab.href}
                                        className={`border-b-2 pb-3 text-sm duration-150 ${active ? 'border-foreground' : 'text-muted-foreground hover:text-foreground border-transparent'}`}>
                                        {tab.label}
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>
                </header>

                <main className="mx-auto max-w-7xl space-y-6 px-6 py-10">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-64 flex-1">
                            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
                            <Input
                                value={query}
                                spellCheck={false}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && lookup()}
                                placeholder="0x…"
                                className="h-10 pl-9 font-mono"
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-10"
                            onClick={lookup}>
                            Look up
                        </Button>
                    </div>

                    {!isConfigured && <Notice>Contracts are not deployed yet. Everything below is a labelled demo, not chain data.</Notice>}
                    {error && <Notice tone="warn">{error}</Notice>}

                    {loading && !snapshot ? (
                        <div className="text-muted-foreground flex items-center gap-2 py-24 text-sm">
                            <Loader2 className="size-4 animate-spin" /> Reading Creditcoin…
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>
        </AppContext.Provider>
    )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
    return (
        <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'bg-muted/40'}`}>
            <TriangleAlert className="mt-0.5 size-4 shrink-0 opacity-60" />
            <span className="text-muted-foreground">{children}</span>
        </div>
    )
}

export function Stat({ label, value, bad, hint }: { label: string; value: string | number; bad?: boolean; hint?: string }) {
    return (
        <div>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className={`mt-1 text-xl font-medium tabular-nums ${bad ? 'text-amber-600' : ''}`}>{value}</dd>
            {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
        </div>
    )
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`tabular-nums ${strong ? 'font-medium' : ''}`}>{value}</span>
        </div>
    )
}

type Method = 'borrow' | 'repay' | 'deposit' | 'withdraw'

/**
 * One amount field plus one button, wired to a CreditLine method.
 * `deposit` and `repay` pull tokens, so both send an ERC20 approval first.
 */
export function AmountAction({
    method,
    label,
    disabled,
    disabledReason,
    max,
}: {
    method: Method
    label: string
    disabled?: boolean
    disabledReason?: string
    max?: bigint
}) {
    const { snapshot, refresh, wallet } = useApp()
    const [amount, setAmount] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!snapshot) return null
    const { decimals, symbol } = snapshot.asset

    const run = async () => {
        setError(null)
        setBusy(true)
        try {
            const injected = (window as unknown as { ethereum?: never }).ethereum
            if (!injected) throw new Error('No injected wallet found.')
            const signer = await new BrowserProvider(injected).getSigner()
            const account = await signer.getAddress()
            const value = parseUnits(amount || '0', decimals)
            const line = new Contract(ADDRESSES.line, LINE_ABI, signer)

            if (method === 'deposit' || method === 'repay') {
                const token = new Contract(snapshot.asset.address, ERC20_ABI, signer)
                await (await token.approve(ADDRESSES.line, value)).wait()
            }

            if (method === 'deposit') await (await line.deposit(value, account)).wait()
            else if (method === 'withdraw') await (await line.withdraw(value, account, account)).wait()
            else await (await line[method](value)).wait()

            setAmount('')
            refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    const blocked = snapshot.demo || !wallet || disabled || busy || !amount

    return (
        <div className="space-y-3">
            <div className="relative">
                <Input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder={`Amount in ${symbol}`}
                    inputMode="decimal"
                    className="h-10 pr-14"
                />
                {max !== undefined && max > 0n && (
                    <button
                        type="button"
                        onClick={() => setAmount(formatUnitsPlain(max, decimals))}
                        className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                        Max
                    </button>
                )}
            </div>
            <Button
                size="sm"
                className="h-9 w-full"
                disabled={blocked}
                onClick={run}>
                {busy ? <Loader2 className="animate-spin" /> : null} {label}
            </Button>
            <p className="text-muted-foreground text-xs">
                {snapshot.demo
                    ? 'Demo — actions are disabled until the contracts are deployed.'
                    : !wallet
                      ? 'Connect a wallet to sign this transaction.'
                      : (disabled && disabledReason) || ''}
            </p>
            {error && <p className="text-xs text-amber-600">{error}</p>}
        </div>
    )
}

/** Plain decimal string for the Max button — no thousands separators, so it parses back cleanly. */
function formatUnitsPlain(value: bigint, decimals: number) {
    const base = 10n ** BigInt(decimals)
    const whole = value / base
    const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole.toString()
}
