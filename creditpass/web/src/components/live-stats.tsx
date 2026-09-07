'use client'

import { useEffect, useState } from 'react'

import { ADDRESSES, EXPLORER, formatAmount, formatPercent, isConfigured, loadDirectory, loadMarket, loadSnapshot } from '@/lib/creditpass'

type Live = {
    vaultSize: string
    supplyApr: string
    utilisation: string
    passports: number
    proofs: number
    offers: number
    demo: boolean
}

/**
 * The landing page's numbers, read from the deployed contracts rather than typed in.
 *
 * A pitch that says "verifiable" and then quotes hardcoded figures undercuts itself. These come from
 * the same loaders the dashboard uses, against the same chain; when the contracts are not
 * configured the strip says so instead of pretending.
 */
export function LiveStats() {
    const [live, setLive] = useState<Live | null>(null)

    useEffect(() => {
        const zero = '0x0000000000000000000000000000000000000000'
        Promise.all([loadSnapshot(zero), loadDirectory(), loadMarket()])
            .then(([snapshot, directory, market]) =>
                setLive({
                    vaultSize: `${formatAmount(snapshot.vault.totalAssets, snapshot.asset.decimals)} ${snapshot.asset.symbol}`,
                    supplyApr: formatPercent(snapshot.vault.supplyAprBps),
                    utilisation: formatPercent(snapshot.vault.utilisationBps),
                    passports: directory.length,
                    proofs: directory.reduce((sum, entry) => sum + entry.repayments + entry.liquidations, 0),
                    offers: market.offers.length,
                    demo: snapshot.demo,
                })
            )
            .catch(() => setLive(null))
    }, [])

    const cell = (label: string, value: string | number) => (
        <div className="space-y-1 border-t pt-4">
            <div className="text-2xl font-semibold tracking-tight tabular-nums">{live ? value : '…'}</div>
            <p className="text-muted-foreground text-sm">{label}</p>
        </div>
    )

    return (
        <div className="mt-16 lg:mt-24">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-muted-foreground text-sm">
                    {live?.demo === false ? 'Live on Creditcoin testnet' : live?.demo ? 'Demo figures — contracts not configured for this build' : 'Reading Creditcoin…'}
                </div>
                {isConfigured && EXPLORER && (
                    <a
                        href={`${EXPLORER}/address/${ADDRESSES.registry}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline">
                        Check the registry on Blockscout ↗
                    </a>
                )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 lg:grid-cols-6">
                {cell('Passports scored', live?.passports ?? '')}
                {cell('History entries proved', live?.proofs ?? '')}
                {cell('Vault size', live?.vaultSize ?? '')}
                {cell('Supply APR now', live?.supplyApr ?? '')}
                {cell('Utilisation', live?.utilisation ?? '')}
                {cell('Open share offers', live?.offers ?? '')}
            </div>
        </div>
    )
}
