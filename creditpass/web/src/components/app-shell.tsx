'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { BrowserProvider, Contract, formatUnits, isAddress, parseUnits } from 'ethers'
import { ArrowLeft, Droplet, Loader2, Search, TriangleAlert, Wallet } from 'lucide-react'

import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ADDRESSES, ERC20_ABI, LINE_ABI, formatAmount, isConfigured, loadSnapshot, shorten, type Snapshot } from '@/lib/creditpass'
import {
    CREDITCOIN_TESTNET,
    currentChainId,
    discoverWallets,
    ensureCreditcoinNetwork,
    isCreditcoin,
    type DiscoveredWallet,
    type Eip1193Provider,
} from '@/lib/wallet'

const TABS = [
    { href: '/app', label: 'Passport' },
    { href: '/app/portfolio', label: 'Portfolio' },
    { href: '/app/directory', label: 'Directory' },
    { href: '/app/borrow', label: 'Borrow' },
    { href: '/app/earn', label: 'Earn' },
    { href: '/app/withdraw', label: 'Withdraw' },
    { href: '/app/swap', label: 'Swap' },
]

type AppState = {
    address: string
    wallet: string | null
    provider: Eip1193Provider | null
    onCreditcoin: boolean
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
    const [query, setQuery] = useState(() => {
        if (typeof window !== 'undefined') {
            const requested = new URLSearchParams(window.location.search).get('address')
            if (requested && isAddress(requested)) return requested
        }
        return ''
    })
    const [address, setAddress] = useState(query)
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [wallets, setWallets] = useState<DiscoveredWallet[]>([])
    const [picking, setPicking] = useState(false)
    const [account, setAccount] = useState<string | null>(null)
    const [provider, setProvider] = useState<Eip1193Provider | null>(null)
    const [chainId, setChainId] = useState<string | null>(null)

    // Wallets announce themselves; extensions that load late still arrive here.
    useEffect(() => {
        return discoverWallets((found) => {
            setWallets((current) => {
                if (current.some((w) => w.uuid === found.uuid)) return current
                return [...current, found]
            })
        })
    }, [])

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
        let active = true
        loadSnapshot(address)
            .then((data) => {
                if (active) {
                    setSnapshot(data)
                    setError(null)
                    setLoading(false)
                }
            })
            .catch((e) => {
                if (active) {
                    setError(e instanceof Error ? e.message : String(e))
                    setSnapshot(null)
                    setLoading(false)
                }
            })
        return () => {
            active = false
        }
    }, [address])

    const lookup = () => {
        if (!isAddress(query)) {
            setError('That is not a valid address.')
            return
        }
        setAddress(query)
    }

    const connect = async (chosen: DiscoveredWallet) => {
        setPicking(false)
        setError(null)
        try {
            const accounts = (await chosen.provider.request({ method: 'eth_requestAccounts' })) as string[]
            await ensureCreditcoinNetwork(chosen.provider)

            setProvider(chosen.provider)
            setAccount(accounts[0])
            setChainId(await currentChainId(chosen.provider))
            setQuery(accounts[0])
            setAddress(accounts[0])
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        }
    }

    const onConnectClick = () => {
        if (wallets.length === 0) {
            setError('No wallet detected. Paste an address instead — every score is public and readable without one.')
            return
        }
        if (wallets.length === 1) return void connect(wallets[0])
        setPicking((open) => !open)
    }

    const state: AppState = {
        address,
        wallet: account,
        provider,
        onCreditcoin: chainId ? isCreditcoin(chainId) : false,
        owns: account?.toLowerCase() === address.toLowerCase(),
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
                        <div className="relative flex items-center gap-3">
                            <ThemeToggle />
                            {account ? (
                                <span className="bg-muted rounded-full px-3 py-1.5 font-mono text-xs">{shorten(account)}</span>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onConnectClick}>
                                    <Wallet /> Connect wallet
                                </Button>
                            )}

                            {picking && (
                                <div className="bg-popover absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border p-1 shadow-xl">
                                    {wallets.map((w) => (
                                        <button
                                            key={w.uuid}
                                            type="button"
                                            onClick={() => connect(w)}
                                            className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm">
                                            {w.icon ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={w.icon}
                                                    alt=""
                                                    className="size-4 rounded"
                                                />
                                            ) : (
                                                <Wallet className="size-4" />
                                            )}
                                            {w.name}
                                        </button>
                                    ))}
                                </div>
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
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10"
                            onClick={() => {
                                const addr = '0x7a3f4d1c2b9e8a5f6c0d3e2b1a9f8c7d6e5b4a30'
                                setQuery(addr)
                                setAddress(addr)
                            }}>
                            Fill demo
                        </Button>
                    </div>

                    {!isConfigured && <Notice>Contracts are not deployed yet. Everything below is a labelled demo, not chain data.</Notice>}
                    {account && chainId && !isCreditcoin(chainId) && (
                        <Notice tone="warn">
                            Your wallet is on chain {parseInt(chainId, 16)}, not Creditcoin testnet ({parseInt(CREDITCOIN_TESTNET.chainId, 16)}).
                            Transactions will not reach these contracts until you switch.
                        </Notice>
                    )}
                    {error && <Notice tone="warn">{error}</Notice>}

                    {children}
                </main>
            </div>
        </AppContext.Provider>
    )
}

/** Shared placeholder so a page waiting on its own data still shows the shell around it. */
export function Loading({ what = 'Creditcoin' }: { what?: string }) {
    return (
        <div className="text-muted-foreground flex items-center gap-2 py-24 text-sm">
            <Loader2 className="size-4 animate-spin" /> Reading {what}…
        </div>
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

/**
 * Mints the vault's test asset to the connected wallet.
 *
 * TestUSD is a testnet stand-in with a public `mint`, so this is a faucet rather than a hole: the
 * alternative is a dashboard where the supply and repay buttons can never be pressed.
 */
export function Faucet({ amount = 1000 }: { amount?: number }) {
    const { snapshot, provider, wallet, refresh } = useApp()
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!snapshot || snapshot.demo) return null

    const mint = async () => {
        setError(null)
        setBusy(true)
        try {
            if (!provider) throw new Error('Connect a wallet first.')
            await ensureCreditcoinNetwork(provider)
            const signer = await new BrowserProvider(provider).getSigner()
            const token = new Contract(snapshot.asset.address, ERC20_ABI, signer)
            const value = parseUnits(String(amount), snapshot.asset.decimals)
            await (await token.mint(await signer.getAddress(), value)).wait()
            refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-2">
            <Button
                size="sm"
                variant="outline"
                className="h-9 w-full"
                disabled={!wallet || busy}
                onClick={mint}>
                {busy ? <Loader2 className="animate-spin" /> : <Droplet />}
                Get {amount.toLocaleString()} test {snapshot.asset.symbol}
            </Button>
            {error && <p className="text-xs text-amber-600">{error}</p>}
        </div>
    )
}

/** Plain decimal string for Max buttons — no thousands separators, so it parses back cleanly. */
export function plain(value: bigint, decimals: number) {
    return formatUnits(value, decimals).replace(/\.?0+$/, '') || '0'
}

export function parseSafe(value: string, decimals: number): bigint | null {
    if (!value.trim()) return null
    try {
        return parseUnits(value, decimals)
    } catch {
        return null
    }
}

/** Segmented pill switch — the same control on Earn, Borrow and the swap's discount picker. */
export function ModeToggle<T extends string>({ modes, mode, onChange }: { modes: readonly T[]; mode: T; onChange: (m: T) => void }) {
    return (
        <div className="bg-muted flex rounded-full p-1 text-sm">
            {modes.map((m) => (
                <button
                    key={m}
                    type="button"
                    onClick={() => onChange(m)}
                    className={`flex-1 rounded-full py-1.5 capitalize duration-150 ${mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {m}
                </button>
            ))}
        </div>
    )
}

/**
 * The swap-style amount field: label, big number, token pill, balance line with Max.
 * Every form in the app that takes an amount renders one of these.
 */
export function AmountPanel({
    label,
    token,
    value,
    onChange,
    balance,
    balanceLabel = 'Balance',
    decimals,
    onMax,
    tone = 'input',
}: {
    label: string
    token: string
    value: string
    onChange?: (v: string) => void
    balance: bigint | null
    balanceLabel?: string
    decimals: number
    onMax?: () => void
    tone?: 'input' | 'output'
}) {
    return (
        <div className={`rounded-2xl border p-4 ${tone === 'input' ? 'bg-card' : 'bg-muted/40'}`}>
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-2 flex items-center gap-3">
                <input
                    value={value}
                    onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                    readOnly={!onChange}
                    placeholder="0"
                    inputMode="decimal"
                    className="placeholder:text-muted-foreground/50 min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight outline-none"
                />
                <div className="bg-background flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium">
                    <span className="bg-foreground text-background flex size-5 items-center justify-center rounded-full text-[10px]">{token[0]}</span>
                    {token}
                </div>
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                <span>{balance !== null ? `${balanceLabel} ${formatAmount(balance, decimals)}` : ''}</span>
                {onMax && (
                    <button
                        type="button"
                        onClick={onMax}
                        className="hover:text-foreground">
                        Max
                    </button>
                )}
            </div>
        </div>
    )
}

/** The muted summary block under an amount panel: effective price, position after, and so on. */
export function Summary({ children }: { children: React.ReactNode }) {
    return <div className="bg-muted/40 mt-3 space-y-2 rounded-xl px-3 py-2.5 text-xs">{children}</div>
}

type Method = 'borrow' | 'repay' | 'deposit' | 'withdraw'

/**
 * One amount panel plus one button, wired to a CreditLine method, in the swap card's dress.
 * `deposit` and `repay` pull tokens, so both send an ERC20 approval first.
 */
export function AmountAction({
    method,
    label,
    disabled,
    disabledReason,
    max,
    hint,
    summary,
}: {
    method: Method
    label: string
    disabled?: boolean
    disabledReason?: string
    /** Upper bound the contract will accept right now; shown as "Available" and behind Max. */
    max?: bigint
    /** Idle copy under the button, shown when nothing is wrong. */
    hint?: string
    /** Rows to show once an amount is typed, given the parsed amount. */
    summary?: (value: bigint) => React.ReactNode
}) {
    const { snapshot, refresh, wallet, provider } = useApp()
    const [amount, setAmount] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!snapshot) return null
    const { decimals, symbol } = snapshot.asset
    const value = parseSafe(amount, decimals)
    const over = max !== undefined && value !== null && value > max

    const run = async () => {
        setError(null)
        setBusy(true)
        try {
            if (!provider) throw new Error('Connect a wallet first.')
            // Cheap insurance: the wallet may have been switched away since connecting.
            await ensureCreditcoinNetwork(provider)

            const signer = await new BrowserProvider(provider).getSigner()
            const account = await signer.getAddress()
            const line = new Contract(ADDRESSES.line, LINE_ABI, signer)

            if (method === 'deposit' || method === 'repay') {
                const token = new Contract(snapshot.asset.address, ERC20_ABI, signer)
                await (await token.approve(ADDRESSES.line, value!)).wait()
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

    const problem = snapshot.demo
        ? 'Demo — actions are disabled until the contracts are deployed.'
        : !wallet
          ? 'Connect a wallet to sign this transaction.'
          : disabled
            ? (disabledReason ?? '')
            : over
              ? `Only ${formatAmount(max!, decimals)} ${symbol} is available right now.`
              : null
    const blocked = snapshot.demo || !wallet || disabled || busy || value === null || value === 0n || over

    return (
        <div>
            <AmountPanel
                label={`You ${label.toLowerCase()}`}
                token={symbol}
                value={amount}
                onChange={setAmount}
                balance={max ?? null}
                balanceLabel="Available"
                decimals={decimals}
                onMax={max !== undefined && max > 0n ? () => setAmount(plain(max, decimals)) : undefined}
            />
            {summary && value !== null && value > 0n && !over && <Summary>{summary(value)}</Summary>}
            <Button
                size="lg"
                className="mt-4 h-12 w-full text-base"
                disabled={blocked}
                onClick={run}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {!wallet ? 'Connect wallet' : label}
            </Button>
            <p className="text-muted-foreground mt-3 min-h-4 text-xs">{problem ?? hint}</p>
            {error && (
                <div className="mt-3">
                    <Notice tone="warn">{error}</Notice>
                </div>
            )}
        </div>
    )
}
