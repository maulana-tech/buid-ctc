import { Card } from '@/components/ui/card'
import { ArrowRight, Check, Search } from 'lucide-react'

export default function HowItWorks() {
    return (
        <section
            id="how-it-works"
            className="scroll-mt-24 py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight">
                    <span className="text-foreground">Three steps, no trusted party.</span> <br /> Scan, prove, borrow.
                </h2>
                <div className="**:data-[slot=card]:bg-background mt-8 grid gap-x-3 gap-y-6 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
                    <div className="row-span-2 grid grid-cols-subgrid gap-4">
                        <Card className="aspect-9/12 bg-foreground/2! relative overflow-hidden">
                            <ScanIllustration />
                        </Card>

                        <p className="text-muted-foreground text-balance">
                            <span className="text-foreground">1. Scan. </span> An off-chain worker finds your events on Aave, Spark and Morpho. It is untrusted — it only chooses what to present.
                        </p>
                    </div>

                    <div className="row-span-2 grid grid-cols-subgrid gap-4">
                        <Card className="aspect-9/12 bg-foreground/2! relative overflow-hidden">
                            <ProveIllustration />
                        </Card>

                        <p className="text-muted-foreground text-balance">
                            <span className="text-foreground">2. Prove. </span> Each transaction is verified against attested Ethereum state by the block-prover precompile, inside the contract.
                        </p>
                    </div>

                    <div className="row-span-2 grid grid-cols-subgrid gap-4">
                        <Card className="aspect-9/12 bg-foreground/2! relative overflow-hidden">
                            <BorrowIllustration />
                        </Card>

                        <p className="text-muted-foreground text-balance">
                            <span className="text-foreground">3. Borrow. </span> Your score sets a credit limit. Draw against it on Creditcoin without posting a cent of collateral.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}

function ScanIllustration() {
    return (
        <div
            aria-hidden
            className="z-1 absolute inset-8 m-auto h-fit scale-95">
            <div className="bg-card ring-foreground/15 rounded-3xl p-3 shadow-xl shadow-black/10 ring">
                <div className="text-muted-foreground flex items-center gap-2 p-2 pb-3 font-mono text-xs">
                    <Search className="size-3.5 shrink-0" />
                    <span className="truncate">0x7a3f…9c21</span>
                </div>
                <div className="space-y-1.5">
                    {[
                        ['Repay', '21,948,306'],
                        ['Repay', '21,731,884'],
                        ['Borrow', '21,502,117'],
                    ].map(([kind, block]) => (
                        <div
                            key={block}
                            className="bg-muted/60 flex items-center justify-between rounded-lg px-2.5 py-1.5">
                            <span className="text-xs font-medium">{kind}</span>
                            <span className="text-muted-foreground font-mono text-[10px]">#{block}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ProveIllustration() {
    return (
        <div
            aria-hidden
            className="z-1 absolute inset-8 m-auto h-fit scale-95">
            <div className="bg-card ring-foreground/15 rounded-3xl p-4 shadow-xl shadow-black/10 ring">
                <div className="text-muted-foreground text-xs">Attestcoin verification</div>
                <ul className="mt-3 space-y-2.5">
                    {['Merkle inclusion', 'Continuity proof', 'Receipt status 1', 'Emitter is Aave V3'].map((step) => (
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
                <div className="text-muted-foreground mt-4 border-t pt-3 font-mono text-[10px]">verified in 1 block · ~15s</div>
            </div>
        </div>
    )
}

function BorrowIllustration() {
    return (
        <div
            aria-hidden
            className="z-1 absolute inset-8 m-auto h-fit scale-95">
            <div className="bg-card ring-foreground/15 rounded-3xl p-4 shadow-xl shadow-black/10 ring">
                <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground text-xs">Score</span>
                    <span className="text-2xl font-semibold tracking-tight">742</span>
                </div>
                <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full">
                    <div className="bg-foreground h-full w-[74%] rounded-full" />
                </div>
                <div className="mt-5 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Collateral</span>
                    <span className="font-medium">$0</span>
                    <ArrowRight className="text-muted-foreground size-3" />
                    <span className="text-muted-foreground">Limit</span>
                    <span className="font-medium">$500</span>
                </div>
            </div>
        </div>
    )
}
