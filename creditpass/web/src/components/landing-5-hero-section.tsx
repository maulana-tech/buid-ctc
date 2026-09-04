import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HeroHeader } from '@/components/landing-5-header'
import { ChevronRight } from 'lucide-react'
import LogoCloud from '@/components/landing-5-logo-cloud'
import HeroVideo from '@/components/landing-5-hero-video'

export default function HeroSection() {
    return (
        <>
            <HeroHeader />
            <main className="overflow-x-hidden">
                <section>
                    <div className="lg:min-h-200 sm:aspect-3/2 min-[1996px]:max-h-240 relative mx-auto flex aspect-square flex-col justify-end lg:aspect-auto xl:aspect-video">
                        <div className="relative z-10 flex flex-col justify-end">
                            <div className="mx-auto w-full max-w-7xl px-6 pb-6 lg:pb-12">
                                <div className="flex flex-wrap items-end justify-between gap-6 lg:w-2/3">
                                    <div className="max-w-xl">
                                        <h1 className="text-balance text-5xl md:text-6xl">Credit that travels across chains</h1>
                                        <p className="text-muted-foreground mt-5 max-w-md text-balance text-lg">
                                            Borrow on Creditcoin with no collateral. Your Ethereum repayment record is the collateral — and it is proved, not reported.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            nativeButton={false}
                                            render={
                                                <Link href="/app">
                                                    <span className="text-nowrap">Check my score</span>
                                                    <ChevronRight className="ml-1" />
                                                </Link>
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* The gradient is the fallback: the video is a remote placeholder and the hero
                            must not be a blank white slab while it buffers, or if it never arrives. */}
                        <div className="bg-linear-to-b from-muted to-background mask-y-from-45% mask-b-to-90% 2xl:mask-x-from-90% pointer-events-none absolute inset-0">
                            <HeroVideo />
                        </div>
                    </div>
                </section>
                <LogoCloud />
            </main>
        </>
    )
}
