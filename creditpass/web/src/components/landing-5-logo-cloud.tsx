'use client'
import { useMedia } from '@/hooks/use-media'
import { InfiniteSlider } from '@/components/ui/motion-primitives/infinite-slider'

/// Wordmarks, not logos: these are the chains and protocols CreditPass actually reads
/// and settles on. Borrowed brand logos here would imply partnerships that do not exist.
const stack = [
    { name: 'Creditcoin', note: 'settlement' },
    { name: 'Attestcoin', note: 'attestation' },
    { name: 'Ethereum', note: 'source chain' },
    { name: 'Aave · Spark · Morpho', note: 'history' },
    { name: 'Foundry', note: 'contracts' },
]

function Wordmarks() {
    return (
        <>
            {stack.map((item) => (
                <div
                    key={item.name}
                    className="flex shrink-0 flex-col gap-0.5">
                    <span className="text-lg font-medium tracking-tight">{item.name}</span>
                    <span className="text-muted-foreground text-xs">{item.note}</span>
                </div>
            ))}
        </>
    )
}

export default function LogoCloud() {
    const isLarge = useMedia('(min-width: 64rem)')

    return (
        <section className="bg-background">
            <div className="relative m-auto max-w-7xl">
                {isLarge ? (
                    <div className="relative flex items-center justify-between px-6 py-12">
                        <Wordmarks />
                    </div>
                ) : (
                    <InfiniteSlider
                        gap={44}
                        className="mask-x-from-85% mask-x-to-99% px-6 py-8">
                        <Wordmarks />
                    </InfiniteSlider>
                )}
            </div>
        </section>
    )
}
