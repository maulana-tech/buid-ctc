import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function CallToAction() {
    return (
        <section
            id="check-score"
            className="scroll-mt-24 py-16 md:py-20">
            <div className="mx-auto max-w-7xl px-6">
                <div className="mx-auto max-w-4xl text-center">
                    <h2 className="text-balance text-4xl font-semibold tracking-tight lg:text-5xl xl:text-6xl">You already have a credit history. Go prove it.</h2>
                    <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-balance text-lg">
                        Deployed on Creditcoin testnet, reading real Aave V3, Spark and Morpho Blue history from Ethereum mainnet — three
                        proofs through the live block-prover precompile, every contract on{' '}
                        <Link
                            href="https://creditcoin-testnet.blockscout.com/address/0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea"
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-foreground underline underline-offset-2">
                            Blockscout
                        </Link>
                        .
                    </p>

                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Button
                            size="lg"
                            nativeButton={false}
                            render={<Link href="/app">Open the dashboard</Link>}
                        />

                        <Button
                            size="lg"
                            variant="outline"
                            nativeButton={false}
                            render={<Link href="https://github.com/maulana-tech/buid-ctc">View the code</Link>}
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}
