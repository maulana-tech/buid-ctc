'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { BrowserProvider, Contract, isAddress, parseUnits } from 'ethers'
import { ArrowLeft, ArrowUpRight, Droplet, Loader2, Search, TriangleAlert, Wallet } from 'lucide-react'

import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ADDRESSES, ECOSYSTEM, ERC20_ABI, LINE_ABI, explorerUrl, isConfigured, loadSnapshot, shorten, type Snapshot } from '@/lib/creditpass'
import {
    CREDITCOIN_TESTNET,
    currentChainId,
    discoverWallets,
    ensureCreditcoinNetwork,
    isCreditcoin,
    type DiscoveredWallet,
    type Eip1193Provider,
} from '@/lib/wallet'

/** An address to land on so the dashboard has something to show before you type anything. */
const SAMPLE_ADDRESS = '0x7a3f4d1c2b9e8a5f6c0d3e2b1a9f8c7d6e5b4a30'

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
        return SAMPLE_ADDRESS
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

                    <ContractsBar assetAddress={snapshot?.asset.address} />
                    <EcosystemBar />
                </main>
            </div>
        </AppContext.Provider>
    )
}

/**
 * Every deployed address, linked into the explorer. For a project whose entire claim is "you can
 * check this yourself", the addresses have to be one click away on every page.
 */
function ContractsBar({ assetAddress }: { assetAddress?: string }) {
    if (!isConfigured) return null

    const contracts = [
        { label: 'CreditRegistry', address: ADDRESSES.registry },
        { label: 'LendingHistoryASC', address: ADDRESSES.asc },
        { label: 'CreditLine vault', address: ADDRESSES.line },
        { label: 'ShareMarket', address: ADDRESSES.market },
        { label: 'Asset', address: assetAddress ?? '' },
    ].filter((c) => c.address)

    return (
        <div className="border-t pt-6">
            <div className="text-muted-foreground mb-3 text-xs">Deployed on Creditcoin testnet</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {contracts.map((contract) => {
                    const href = explorerUrl('address', contract.address)
                    // A local Anvil chain has no explorer; show the address rather than a dead link.
                    const body = (
                        <>
                            <div className="group-hover:text-foreground flex items-center gap-1 text-sm font-medium">
                                {contract.label}
                                {href && <ArrowUpRight className="size-3.5 opacity-50" />}
                            </div>
                            <div className="text-muted-foreground font-mono text-xs">{shorten(contract.address)}</div>
                        </>
                    )
                    return href ? (
                        <Link
                            key={contract.label}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="group">
                            {body}
                        </Link>
                    ) : (
                        <div key={contract.label}>{body}</div>
                    )
                })}
            </div>
        </div>
    )
}

/** Where to get CTC for gas, a wallet to hold it, and the explorer to check the contracts. */
function EcosystemBar() {
    const links = [
        { href: ECOSYSTEM.explorer, label: 'Block explorer', note: 'verify every number here' },
        { href: ECOSYSTEM.penguinSwap, label: 'PenguinSwap', note: 'get CTC for gas' },
        { href: ECOSYSTEM.creditWallet, label: 'Credit Wallet', note: 'official mobile wallet' },
        { href: ECOSYSTEM.attestcoinDocs, label: 'Attestcoin docs', note: 'how the proofs work' },
    ]
    return (
        <div className="grid gap-3 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {links.map((link) => (
                <Link
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group">
                    <div className="group-hover:text-foreground flex items-center gap-1 text-sm font-medium">
                        {link.label}
                        <ArrowUpRight className="size-3.5 opacity-50" />
                    </div>
                    <div className="text-muted-foreground text-xs">{link.note}</div>
                </Link>
            ))}
        </div>
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
    const { snapshot, refresh, wallet, provider } = useApp()
    const [amount, setAmount] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!snapshot) return null
    const { decimals, symbol } = snapshot.asset

    const run = async () => {
        setError(null)
        setBusy(true)
        try {
            if (!provider) throw new Error('Connect a wallet first.')
            // Cheap insurance: the wallet may have been switched away since connecting.
            await ensureCreditcoinNetwork(provider)

            const signer = await new BrowserProvider(provider).getSigner()
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
