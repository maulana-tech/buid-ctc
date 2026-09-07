import { Cpu, Zap } from 'lucide-react'

export default function ContentSection() {
    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:gap-12">
                    <h2 className="max-w-md text-balance text-4xl font-medium tracking-tight lg:text-5xl">A credit score built from proofs, not promises.</h2>
                    <div className="space-y-6 lg:space-y-12">
                        <p className="text-muted-foreground text-balance text-lg">
                            CreditPass reads your borrow, repay, and liquidation events from Aave V3, Spark and Morpho Blue on Ethereum, verifies each one on Creditcoin through the Attestcoin Protocol, and turns them into a non-transferable score. That score sets how much you can borrow with nothing posted as collateral.
                        </p>

                        <div className="grid gap-4 pt-6 sm:grid-cols-2">
                            <p className="text-muted-foreground text-balance text-lg">
                                <span className="text-foreground font-medium">
                                    <Zap className="inline size-4 -translate-y-0.5" /> Synchronous.
                                </span>{' '}
                                Inclusion and continuity are verified inside one Creditcoin block.
                            </p>

                            <p className="text-muted-foreground text-balance text-lg">
                                <span className="text-foreground font-medium">
                                    <Cpu className="inline size-4 -translate-y-0.5" /> Transparent.
                                </span>{' '}
                                The whole formula is on-chain. No model, no black box, no feed.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
