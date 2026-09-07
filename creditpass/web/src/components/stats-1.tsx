import { LiveStats } from '@/components/live-stats'

export default function StatsSection() {
    return (
        <section className="py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid gap-4 md:grid-cols-2 md:gap-6">
                    <h2 className="text-muted-foreground max-w-4xl text-balance text-4xl font-medium tracking-tight lg:text-5xl">
                        <span className="text-foreground">No collateral.</span> <br /> No oracle. Just proof.
                    </h2>
                    <div className="flex flex-col gap-32 md:mx-auto xl:gap-44">
                        <p className="text-muted-foreground text-balance text-lg">Creditcoin exists to bring real-world credit history on-chain. CreditPass extends that to every chain: a borrower&apos;s record on Ethereum becomes a score on Creditcoin without a bridge, a custodian, or a single trusted reporter. Lending against reputation is how credit has always worked — this is the first time the reputation can be checked by a contract.</p>

                        <div className="grid gap-12 md:grid-cols-3 md:gap-12">
                            <div className="space-y-3 border-t pt-6">
                                <div className="text-4xl font-semibold tracking-tight">1,000</div>
                                <p className="text-muted-foreground">Maximum score, computed entirely on-chain</p>
                            </div>
                            <div className="space-y-3 border-t pt-6">
                                <div className="text-4xl font-semibold tracking-tight">~15s</div>
                                <p className="text-muted-foreground">Proof verified inside one Creditcoin block</p>
                            </div>
                            <div className="space-y-3 border-t pt-6">
                                <div className="text-4xl font-semibold tracking-tight">0</div>
                                <p className="text-muted-foreground">Centralised oracle operators in the path</p>
                            </div>
                        </div>
                    </div>
                </div>
                <LiveStats />
            </div>
        </section>
    )
}
