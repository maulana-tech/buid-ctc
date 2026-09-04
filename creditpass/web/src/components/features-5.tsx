'use client'

import { Ban, Boxes, Calculator, Check, Fingerprint, Gavel, Link2, Percent, ScrollText, Share2, ShieldAlert, TrendingDown, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

const features = [
    { id: 'attested-history', label: 'Attested history' },
    { id: 'credit-score', label: 'Credit score' },
    { id: 'credit-line', label: 'Credit line' },
    { id: 'portable', label: 'Portable by design' },
] as const

type FeatureId = (typeof features)[number]['id']

const featureHighlights: Record<FeatureId, { icon: LucideIcon; label: string }[]> = {
    'attested-history': [
        { icon: ScrollText, label: 'Merkle inclusion proof per transaction' },
        { icon: Link2, label: 'Continuity proof back to attested state' },
        { icon: Ban, label: 'No oracle operator anywhere in the path' },
    ],
    'credit-score': [
        { icon: Calculator, label: 'Whole formula lives on-chain' },
        { icon: ShieldAlert, label: 'Same-day repayments count once' },
        { icon: TrendingDown, label: 'Liquidations are never rate-limited' },
    ],
    'credit-line': [
        { icon: Wallet, label: 'Zero collateral posted' },
        { icon: Percent, label: 'Limit tiers derived from the score' },
        { icon: Gavel, label: 'Anyone can mark an overdue loan' },
    ],
    portable: [
        { icon: Share2, label: 'Any Creditcoin contract can read it' },
        { icon: Fingerprint, label: 'Non-transferable, bound to the address' },
        { icon: Boxes, label: 'One reputation across both chains' },
    ],
}

function FeatureList({ items }: { items: { icon: LucideIcon; label: string }[] }) {
    return (
        <ul className="text-muted-foreground mt-8 divide-y *:flex *:items-center *:gap-3 *:py-3">
            {items.map(({ icon: Icon, label }) => (
                <li key={label}>
                    <Icon className="size-4 shrink-0" />
                    {label}
                </li>
            ))}
        </ul>
    )
}

export default function FeaturesSection() {
    const [activeId, setActiveId] = useState<FeatureId>('attested-history')
    const sectionRefs = useRef<Partial<Record<FeatureId, HTMLDivElement | null>>>({})

    const scrollToFeature = (id: FeatureId) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActiveId(id)
    }

    useEffect(() => {
        const sections = features.map((feature) => sectionRefs.current[feature.id]).filter((section): section is HTMLDivElement => section != null)

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)

                const nextId = visible[0]?.target.id as FeatureId | undefined
                if (nextId) setActiveId(nextId)
            },
            { rootMargin: '-25% 0px -55% 0px', threshold: [0.15, 0.35, 0.55, 0.75] }
        )

        sections.forEach((section) => observer.observe(section))

        return () => observer.disconnect()
    }, [])

    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight">
                    <span className="text-foreground">One primitive, four moving parts.</span> <br /> All of them verifiable.
                </h2>
                <div className="mt-16 grid gap-6 md:mt-32 lg:grid-cols-[auto_1fr]">
                    <div className="sticky top-24 h-fit w-56 max-lg:hidden">
                        <div className="text-muted-foreground text-sm">Product</div>
                        <div className="-ml-4 mt-4 flex flex-col *:justify-start">
                            {features.map((feature) => (
                                <Button
                                    key={feature.id}
                                    type="button"
                                    variant="ghost"
                                    data-state={activeId === feature.id ? 'active' : undefined}
                                    onClick={() => scrollToFeature(feature.id)}
                                    className="not-data-[state=active]:text-muted-foreground hover:bg-transparent">
                                    {feature.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-16 md:gap-32">
                        <div
                            ref={(element) => {
                                sectionRefs.current['attested-history'] = element
                            }}
                            id="attested-history"
                            className="grid scroll-mt-32 gap-6 sm:grid-cols-2 md:grid-cols-5 lg:gap-12">
                            <div className="flex flex-col justify-between pb-4 md:col-span-2">
                                <div className="md:pr-6 lg:pr-0">
                                    <h3 className="text-muted-foreground mb-6 text-sm font-medium">Attested history</h3>
                                    <p className="text-muted-foreground text-balance text-lg font-medium">
                                        <span className="text-foreground">Proof, not reporting.</span> A staked attestor set confirms Ethereum block headers on Creditcoin. The contract verifies your transaction against them itself — across Aave V3, Spark and Morpho Blue.
                                    </p>
                                </div>
                                <FeatureList items={featureHighlights['attested-history']} />
                            </div>
                            <div className="border-border/50 bg-foreground/2 relative flex aspect-square rounded-3xl border p-3 md:col-span-3">
                                <ProofIllustration />
                            </div>
                        </div>

                        <div
                            ref={(element) => {
                                sectionRefs.current['credit-score'] = element
                            }}
                            id="credit-score"
                            className="grid scroll-mt-32 gap-6 sm:grid-cols-2 md:grid-cols-5 lg:gap-12">
                            <div className="flex flex-col justify-between pb-4 md:col-span-2">
                                <div className="md:pr-6 lg:pr-0">
                                    <h3 className="text-muted-foreground mb-6 text-sm font-medium">Credit score</h3>
                                    <p className="text-muted-foreground text-balance text-lg font-medium">
                                        <span className="text-foreground">Counts, not amounts.</span> Summing across reserves would need a price feed — and importing a centralised oracle into this is not a trade worth making.
                                    </p>
                                </div>
                                <FeatureList items={featureHighlights['credit-score']} />
                            </div>
                            <div className="border-border/50 bg-foreground/2 relative flex aspect-square rounded-3xl border p-3 md:col-span-3">
                                <ScoreIllustration />
                            </div>
                        </div>

                        <div
                            ref={(element) => {
                                sectionRefs.current['credit-line'] = element
                            }}
                            id="credit-line"
                            className="grid scroll-mt-32 gap-6 sm:grid-cols-2 md:grid-cols-5 lg:gap-12">
                            <div className="flex flex-col justify-between pb-4 md:col-span-2">
                                <div className="md:pr-6 lg:pr-0">
                                    <h3 className="text-muted-foreground mb-6 text-sm font-medium">Credit line</h3>
                                    <p className="text-muted-foreground text-balance text-lg font-medium">
                                        <span className="text-foreground">Enforcement is reputational.</span> Nobody repossesses your house over a late card payment — <span className="rounded bg-emerald-500/10 px-1.5 text-emerald-500">your score takes the hit</span>. Same here.
                                    </p>
                                </div>
                                <FeatureList items={featureHighlights['credit-line']} />
                            </div>
                            <div className="border-border/50 bg-foreground/2 relative flex aspect-square rounded-3xl border p-3 md:col-span-3">
                                <LimitIllustration />
                            </div>
                        </div>

                        <div
                            ref={(element) => {
                                sectionRefs.current.portable = element
                            }}
                            id="portable"
                            className="grid scroll-mt-32 gap-6 sm:grid-cols-2 md:grid-cols-5 lg:gap-12">
                            <div className="flex flex-col justify-between pb-4 md:col-span-2">
                                <div className="md:pr-6 lg:pr-0">
                                    <h3 className="text-muted-foreground mb-6 text-sm font-medium">Portable by design</h3>
                                    <p className="text-muted-foreground text-balance text-lg font-medium">
                                        <span className="text-foreground">The registry is the product.</span> CreditPass ships one consumer of the score. Every other lender, market, or DAO on Creditcoin can read the same one.
                                    </p>
                                </div>
                                <FeatureList items={featureHighlights.portable} />
                            </div>
                            <div className="border-border/50 bg-foreground/2 relative flex aspect-square rounded-3xl border p-3 md:col-span-3">
                                <RegistryIllustration />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            aria-hidden
            className={`bg-card ring-foreground/10 z-1 absolute inset-8 m-auto h-fit max-w-sm rounded-3xl p-5 shadow-xl shadow-black/10 ring ${className ?? ''}`}>
            {children}
        </div>
    )
}

function ProofIllustration() {
    return (
        <Panel>
            <div className="text-muted-foreground font-mono text-[10px]">chainKey 3 · Ethereum mainnet</div>
            <div className="mt-3 truncate font-mono text-xs">0x092a78e3…e23d3070</div>
            <ul className="mt-4 space-y-2.5">
                {['Block attested', 'Merkle root matches', 'Continuity intact', 'Emitter is Aave V3 Pool'].map((step) => (
                    <li
                        key={step}
                        className="flex items-center gap-2 text-xs">
                        <span className="bg-foreground text-background flex size-4 shrink-0 items-center justify-center rounded-full">
                            <Check className="size-2.5" />
                        </span>
                        {step}
                    </li>
                ))}
            </ul>
            <div className="text-muted-foreground mt-4 border-t pt-3 text-[10px]">Query id recorded — this transaction can never be counted twice.</div>
        </Panel>
    )
}

function ScoreIllustration() {
    const rows = [
        ['Base', '+300'],
        ['11 repayments × 25', '+275'],
        ['History age', '+40'],
        ['Liquidations', '0'],
        ['Defaults', '0'],
    ]
    return (
        <Panel>
            <div className="text-muted-foreground text-xs">Score breakdown</div>
            <ul className="mt-3 divide-y text-xs">
                {rows.map(([label, value]) => (
                    <li
                        key={label}
                        className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono">{value}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t pt-3">
                <span className="text-xs font-medium">Total</span>
                <span className="text-2xl font-semibold tracking-tight">615</span>
            </div>
        </Panel>
    )
}

function LimitIllustration() {
    const tiers = [
        ['500 – 599', '1×', false],
        ['600 – 699', '2×', true],
        ['700 – 799', '5×', false],
        ['800+', '10×', false],
    ] as const
    return (
        <Panel>
            <div className="text-muted-foreground text-xs">Credit limit tiers</div>
            <ul className="mt-3 space-y-1.5">
                {tiers.map(([range, mult, active]) => (
                    <li
                        key={range}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${active ? 'bg-foreground text-background' : 'bg-muted/60'}`}>
                        <span className="font-mono">{range}</span>
                        <span className="font-medium">{mult}</span>
                    </li>
                ))}
            </ul>
            <div className="text-muted-foreground mt-4 border-t pt-3 text-[10px]">Below 500, the line stays closed.</div>
        </Panel>
    )
}

function RegistryIllustration() {
    return (
        <Panel>
            <div className="bg-muted/60 rounded-xl px-3 py-2.5 text-center">
                <div className="font-mono text-xs">CreditRegistry</div>
                <div className="text-muted-foreground text-[10px]">scoreOf(address)</div>
            </div>
            <div className="bg-border mx-auto my-3 h-6 w-px" />
            <div className="grid grid-cols-3 gap-2">
                {['CreditPass', 'Any lender', 'Any DAO'].map((consumer, i) => (
                    <div
                        key={consumer}
                        className={`rounded-lg px-2 py-2 text-center text-[10px] ${i === 0 ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground border border-dashed'}`}>
                        {consumer}
                    </div>
                ))}
            </div>
            <div className="text-muted-foreground mt-4 border-t pt-3 text-[10px]">One score. Read by anything on Creditcoin.</div>
        </Panel>
    )
}
