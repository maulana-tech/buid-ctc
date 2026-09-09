'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { ArrowUpRight, Check, Copy, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'

import { AmountPanel, ConnectPrompt, Loading, Notice, Row, Stat, Summary, parseSafe, plain, useApp } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ADDRESSES, BAND_THRESHOLDS, LINE_ABI, REGISTRY_ABI, SCORE, explorerUrl, formatAmount, loadPrivateCredit, shorten, type PrivateCredit } from '@/lib/creditpass'
import { ensureCreditcoinNetwork } from '@/lib/wallet'
import { commitmentOf, hex, loadIdentity, nullifierOf, proveThreshold, randomSecret, saveIdentity, type Identity } from '@/lib/zk'

const BAND_LABELS: Record<number, string> = { 500: 'Thin file', 600: 'Established', 700: 'Strong', 800: 'Prime' }

/**
 * Private credit: borrow from any wallet on the strength of a score without saying whose it is.
 *
 * Two steps, deliberately on two wallets. The scored address publishes a commitment once. Then any
 * wallet — ideally a fresh one — proves in the browser that *some* committed profile clears a
 * threshold, and draws the tier that threshold is worth. The proof is UltraHonk over a Noir
 * circuit; the registry keeps the Poseidon tree it walks. Nothing on chain links the two wallets.
 */
export default function PrivatePage() {
    const { wallet, provider, snapshot, refresh } = useApp()
    const [identity, setIdentity] = useState<Identity | null>(null)
    const [credit, setCredit] = useState<PrivateCredit | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
        setIdentity(loadIdentity())
        setReady(true)
    }, [])

    const reload = useCallback(() => {
        if (!identity) return setCredit(null)
        loadPrivateCredit(identity.address, nullifierOf(BigInt(identity.secret)))
            .then(setCredit)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    }, [identity])
    useEffect(reload, [reload])

    const signer = async () => {
        if (!provider) throw new Error('Connect a wallet first.')
        await ensureCreditcoinNetwork(provider)
        return new BrowserProvider(provider).getSigner()
    }

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
            setStatus(null)
        }
    }

    const enable = () =>
        act('enable', async () => {
            if (!wallet) throw new Error('Connect the wallet that holds the score.')
            const secret = randomSecret()
            const s = await signer()
            setStatus('Waiting for the wallet…')
            await (await new Contract(ADDRESSES.registry, REGISTRY_ABI, s).setCommitment(commitmentOf(secret))).wait()
            const next = { address: wallet, secret: hex(secret) }
            saveIdentity(next)
            setIdentity(next)
        })

    const borrow = (amount: bigint, threshold: number) =>
        act('borrow', async () => {
            if (!identity || !credit) throw new Error('No identity loaded.')
            const s = await signer()
            const started = performance.now()
            const result = await proveThreshold(
                {
                    secret: BigInt(identity.secret),
                    address: identity.address,
                    score: credit.score,
                    index: credit.index,
                    siblings: credit.siblings,
                    root: credit.root,
                    threshold,
                    defaults: credit.defaults,
                },
                setStatus
            )
            setStatus(`Proof ready in ${((performance.now() - started) / 1000).toFixed(1)}s · ${((result.proof.length - 2) / 2).toLocaleString()} bytes · waiting for the wallet…`)
            const line = new Contract(ADDRESSES.line, LINE_ABI, s)
            const tx = await line.borrowPrivate(amount, threshold, credit.root, result.nullifier, result.proof)
            const receipt = await tx.wait()
            setLast({ hash: receipt.hash as string, bytes: (result.proof.length - 2) / 2, seconds: (performance.now() - started) / 1000, threshold, amount })
        })

    const [last, setLast] = useState<{ hash: string; bytes: number; seconds: number; threshold: number; amount: bigint } | null>(null)

    if (!ready || !snapshot) return <Loading what="private credit" />

    return (
        <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
                <Card className="p-6">
                    <div className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="size-4" /> Borrow without being named
                    </div>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-balance text-sm">
                        The passport is public by design. This page is how you use it without being seen. The scored address publishes one
                        commitment; any other wallet then proves, in zero knowledge, that a committed profile scores at least a band you choose,
                        and borrows that band&apos;s limit. The verifier learns the threshold and a nullifier — never the address, never the exact score.
                    </p>
                    <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                        <Stat
                            label="Circuit"
                            value="Noir"
                            hint="6,584 constraints"
                        />
                        <Stat
                            label="Proof system"
                            value="UltraHonk"
                            hint="zero-knowledge, keccak transcript"
                        />
                        <Stat
                            label="Verified"
                            value="On chain"
                            hint="Solidity verifier in CreditLine"
                        />
                        <Stat
                            label="Tree"
                            value="Poseidon"
                            hint="depth 16, kept by the registry"
                        />
                    </dl>
                </Card>

                <Card className="p-6">
                    <div className="font-medium">What stays private, and what does not</div>
                    <div className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                        <Row
                            label="Which address you are"
                            value="Hidden"
                            strong
                        />
                        <Row
                            label="Your exact score"
                            value="Hidden"
                            strong
                        />
                        <Row
                            label="The band you proved"
                            value="Public"
                        />
                        <Row
                            label="The borrowing wallet"
                            value="Public"
                        />
                        <Row
                            label="Repeat loans by one identity"
                            value="Linkable via nullifier"
                        />
                        <Row
                            label="A default on a private loan"
                            value="Charged to the nullifier"
                        />
                    </div>
                    <p className="text-muted-foreground mt-4 text-xs">
                        Defaults on private loans are charged to the nullifier, not the address, so the public passport stays clean while every future
                        private proof has to subtract {SCORE.default} points per default. The identity carries the mark; the address does not. Using the
                        scored wallet itself to borrow privately is allowed but pointless — the point is a wallet nobody can connect to the history.
                    </p>
                </Card>

                {last && (
                    <Card className="p-6">
                        <div className="flex items-center gap-2 font-medium">
                            <span className="bg-foreground text-background inline-flex size-5 items-center justify-center rounded-full">
                                <Check className="size-3" />
                            </span>
                            Private loan drawn
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                            <Stat
                                label="Borrowed"
                                value={`${formatAmount(last.amount, snapshot.asset.decimals)} ${snapshot.asset.symbol}`}
                            />
                            <Stat
                                label="Proved"
                                value={`≥ ${last.threshold}`}
                                hint={BAND_LABELS[last.threshold]}
                            />
                            <Stat
                                label="Proof"
                                value={`${last.bytes.toLocaleString()} B`}
                                hint={`generated in ${last.seconds.toFixed(1)}s`}
                            />
                            <Stat
                                label="Transaction"
                                value={shorten(last.hash)}
                            />
                        </dl>
                        <div className="mt-4 flex gap-4 text-xs">
                            <Link
                                href={explorerUrl('tx', last.hash)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                View on Blockscout <ArrowUpRight className="size-3" />
                            </Link>
                            <Link
                                href="/app/borrow"
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                Repay from this wallet <ArrowUpRight className="size-3" />
                            </Link>
                        </div>
                    </Card>
                )}
            </div>

            <div className="space-y-6 lg:col-span-2">
                <IdentityCard
                    identity={identity}
                    credit={credit}
                    wallet={wallet}
                    known={snapshot.known}
                    demo={snapshot.demo}
                    busy={busy}
                    status={status}
                    onEnable={enable}
                    onImport={(next) => {
                        saveIdentity(next)
                        setIdentity(next)
                        setError(null)
                    }}
                    onForget={() => {
                        saveIdentity(null)
                        setIdentity(null)
                        setCredit(null)
                    }}
                />

                {identity && credit && (
                    <BorrowCard
                        identity={identity}
                        credit={credit}
                        wallet={wallet}
                        demo={snapshot.demo}
                        decimals={snapshot.asset.decimals}
                        symbol={snapshot.asset.symbol}
                        busy={busy}
                        status={status}
                        onBorrow={borrow}
                    />
                )}

                {error && <Notice tone="warn">{error}</Notice>}
                {!wallet && !identity && (
                    <ConnectPrompt title="Start on the wallet that holds the score.">
                        Enabling private credit is one transaction from the scored address. Borrowing happens from any wallet afterwards.
                    </ConnectPrompt>
                )}
            </div>
        </div>
    )
}

function IdentityCard({
    identity,
    credit,
    wallet,
    known,
    demo,
    busy,
    status,
    onEnable,
    onImport,
    onForget,
}: {
    identity: Identity | null
    credit: PrivateCredit | null
    wallet: string | null
    known: boolean
    demo: boolean
    busy: string | null
    status: string | null
    onEnable: () => void
    onImport: (identity: Identity) => void
    onForget: () => void
}) {
    const [reveal, setReveal] = useState(false)
    const [importing, setImporting] = useState(false)
    const [raw, setRaw] = useState('')
    const [copied, setCopied] = useState(false)

    const onChainMatches = identity && credit ? credit.commitment === commitmentOf(BigInt(identity.secret)) : false

    const copy = () => {
        void navigator.clipboard.writeText(JSON.stringify(identity))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    const tryImport = () => {
        try {
            const parsed = JSON.parse(raw) as Partial<Identity>
            if (!parsed.address || !parsed.secret || !/^0x[0-9a-fA-F]{40}$/.test(parsed.address) || !/^0x[0-9a-fA-F]{1,64}$/.test(parsed.secret)) {
                throw new Error('bad shape')
            }
            onImport({ address: parsed.address, secret: parsed.secret })
            setImporting(false)
            setRaw('')
        } catch {
            setRaw('')
        }
    }

    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <div className="text-lg font-semibold tracking-tight">1 · Identity</div>
                <div className="text-muted-foreground text-xs">stored only in this browser</div>
            </div>

            {identity ? (
                <>
                    <Summary>
                        <Row
                            label="Scored address"
                            value={shorten(identity.address)}
                            strong
                        />
                        <Row
                            label="Commitment on chain"
                            value={credit === null ? '…' : credit.commitment === 0n ? 'Not yet' : onChainMatches ? 'Matches this secret' : 'Different secret'}
                        />
                        <Row
                            label="Score behind it"
                            value={credit === null ? '…' : credit.known ? String(credit.score) : 'No history'}
                        />
                        <Row
                            label="Defaults on this identity"
                            value={credit === null ? '…' : String(credit.defaults)}
                        />
                    </Summary>
                    <div className="bg-muted/40 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-xs">
                        <span className="text-muted-foreground shrink-0">secret</span>
                        <span className="min-w-0 flex-1 truncate">{reveal ? identity.secret : '•'.repeat(24)}</span>
                        <button
                            type="button"
                            onClick={() => setReveal((r) => !r)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={reveal ? 'Hide secret' : 'Reveal secret'}>
                            {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                        <button
                            type="button"
                            onClick={copy}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copy identity">
                            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        </button>
                    </div>
                    <p className="text-muted-foreground mt-3 text-xs">
                        Back this up. Lose it and this address can publish a new commitment; lose it with a private loan open and only the borrowing
                        wallet can repay.
                    </p>
                    {credit && identity && credit.commitment !== 0n && !onChainMatches && (
                        <div className="mt-3">
                            <Notice tone="warn">The commitment on chain was made with a different secret. Import that secret, or re-enable from the scored wallet.</Notice>
                        </div>
                    )}
                    {credit && credit.commitment === 0n && (
                        <Button
                            size="lg"
                            className="mt-4 h-12 w-full text-base"
                            disabled={busy !== null || demo || !wallet || wallet.toLowerCase() !== identity.address.toLowerCase()}
                            onClick={onEnable}>
                            {busy === 'enable' ? <Loader2 className="animate-spin" /> : null}
                            Publish commitment
                        </Button>
                    )}
                    <div className="text-muted-foreground mt-3 flex justify-between text-xs">
                        <button
                            type="button"
                            onClick={() => setImporting((v) => !v)}
                            className="hover:text-foreground">
                            Import another
                        </button>
                        <button
                            type="button"
                            onClick={onForget}
                            className="hover:text-foreground">
                            Forget on this device
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="text-muted-foreground mt-2 text-sm">
                        {wallet && known
                            ? 'This wallet has a score. Enabling generates a secret here and publishes its hash to the registry — one transaction, once.'
                            : wallet
                              ? 'The connected wallet has no attested history. Prove a repayment first, or import an identity you enabled elsewhere.'
                              : 'Connect the scored wallet to enable, or import an identity you already have.'}
                    </p>
                    <Button
                        size="lg"
                        className="mt-4 h-12 w-full text-base"
                        disabled={!wallet || !known || demo || busy !== null}
                        onClick={onEnable}>
                        {busy === 'enable' ? <Loader2 className="animate-spin" /> : null}
                        Enable private credit
                    </Button>
                    <p className="text-muted-foreground mt-3 min-h-4 text-xs">{status ?? (demo ? 'Demo — disabled until the contracts are deployed.' : '')}</p>
                    <button
                        type="button"
                        onClick={() => setImporting((v) => !v)}
                        className="text-muted-foreground hover:text-foreground mt-2 text-xs">
                        Import an identity instead
                    </button>
                </>
            )}

            {importing && (
                <div className="mt-3 flex gap-2">
                    <Input
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                        placeholder='{"address":"0x…","secret":"0x…"}'
                        className="h-10 font-mono text-xs"
                        spellCheck={false}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={tryImport}>
                        Import
                    </Button>
                </div>
            )}
        </Card>
    )
}

function BorrowCard({
    identity,
    credit,
    wallet,
    demo,
    decimals,
    symbol,
    busy,
    status,
    onBorrow,
}: {
    identity: Identity
    credit: PrivateCredit
    wallet: string | null
    demo: boolean
    decimals: number
    symbol: string
    busy: string | null
    status: string | null
    onBorrow: (amount: bigint, threshold: number) => void
}) {
    const effective = credit.score - credit.defaults * SCORE.default
    const available = BAND_THRESHOLDS.filter((t) => t <= effective)
    const [threshold, setThreshold] = useState<number>(available[available.length - 1] ?? 500)
    const [input, setInput] = useState('')
    const amount = parseSafe(input, decimals)
    const limit = credit.limits[threshold] ?? 0n
    const over = amount !== null && amount > limit

    const enabled = credit.commitment !== 0n && credit.commitment === commitmentOf(BigInt(identity.secret))
    const sameWallet = wallet?.toLowerCase() === identity.address.toLowerCase()

    const problem = !wallet
        ? 'Connect the wallet that should receive the loan — ideally not the scored one.'
        : demo
          ? 'Demo — disabled until the contracts are deployed.'
          : !enabled
            ? 'Publish the commitment first.'
            : credit.hasLoan
              ? 'This identity already has a private loan open. Repay it from the wallet that drew it.'
              : available.length === 0
                ? `Effective score ${effective} is below ${credit.minScore}. No band to prove.`
                : amount === null || amount === 0n
                  ? null
                  : over
                    ? `The ${BAND_LABELS[threshold]} band is worth ${formatAmount(limit, decimals)} ${symbol}.`
                    : null
    const canSubmit = wallet && !demo && enabled && !credit.hasLoan && amount !== null && amount > 0n && !over && busy === null

    return (
        <Card className="p-5">
            <div className="flex items-center justify-between">
                <div className="text-lg font-semibold tracking-tight">2 · Borrow privately</div>
                <div className="text-muted-foreground text-xs">from {wallet ? shorten(wallet) : 'any wallet'}</div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Prove at least</span>
                <div className="flex gap-1">
                    {BAND_THRESHOLDS.map((t) => (
                        <button
                            key={t}
                            type="button"
                            disabled={t > effective}
                            onClick={() => setThreshold(t)}
                            className={`rounded-full px-2.5 py-1 duration-150 disabled:opacity-30 ${threshold === t ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-3">
                <AmountPanel
                    label="You borrow"
                    token={symbol}
                    value={input}
                    onChange={setInput}
                    balance={limit}
                    balanceLabel={`${BAND_LABELS[threshold]} limit`}
                    decimals={decimals}
                    onMax={limit > 0n ? () => setInput(plain(limit, decimals)) : undefined}
                />
            </div>

            <Summary>
                <Row
                    label="Statement proved"
                    value={`score ≥ ${threshold}${credit.defaults > 0 ? ` + ${credit.defaults * SCORE.default}` : ''}`}
                    strong
                />
                <Row
                    label="Revealed"
                    value="threshold, nullifier, root"
                />
                <Row
                    label="Hidden"
                    value={`${shorten(identity.address)} · score ${credit.score}`}
                />
                <Row
                    label="Nullifier"
                    value={shorten(hex(nullifierOf(BigInt(identity.secret))))}
                />
            </Summary>

            {sameWallet && wallet && (
                <div className="mt-3">
                    <Notice>You are borrowing from the scored wallet itself. It works, but the link is on chain anyway — switch to a fresh wallet.</Notice>
                </div>
            )}

            <Button
                size="lg"
                className="mt-4 h-12 w-full text-base"
                disabled={!canSubmit}
                onClick={() => onBorrow(amount!, threshold)}>
                {busy === 'borrow' ? <Loader2 className="animate-spin" /> : null}
                {!wallet ? 'Connect wallet' : busy === 'borrow' ? 'Proving…' : 'Prove and borrow'}
            </Button>
            <p className="text-muted-foreground mt-3 min-h-4 text-xs">
                {busy === 'borrow' && status
                    ? status
                    : (problem ?? 'The proof is generated in this tab, in WASM — about half a minute. The wallet then signs one transaction.')}
            </p>
        </Card>
    )
}
