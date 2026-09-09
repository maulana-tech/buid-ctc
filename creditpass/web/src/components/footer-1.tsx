import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { LogoIcon } from '@/components/logo'
import { ADDRESSES, explorerUrl, isConfigured, shorten } from '@/lib/creditpass'

const footerLinks = [
    {
        name: 'Product',
        links: [
            { href: '/app', label: 'Passport' },
            { href: '/app/history', label: 'History' },
            { href: '/app/borrow', label: 'Borrow' },
            { href: '/app/earn', label: 'Earn' },
            { href: '/app/swap', label: 'Share market' },
            { href: '/api/score/0x3078a7b42dc121faea89e3cdac74f0b2f54546f7', label: 'Score API' },
        ],
    },
    {
        name: 'Protocol',
        links: [
            { href: 'https://attestcoin.org/', label: 'Attestcoin Protocol' },
            { href: 'https://docs.attestcoin.org/', label: 'Developer docs' },
            { href: 'https://creditcoin.org/', label: 'Creditcoin' },
            { href: 'https://dashboard.cc3-testnet.creditcoin.network/', label: 'ASC dashboard' },
        ],
    },
    {
        name: 'Ecosystem',
        links: [
            { href: 'https://creditcoin-testnet.blockscout.com', label: 'Block explorer' },
            { href: 'https://penguinswap.org', label: 'PenguinSwap' },
            { href: 'https://penguinbase.com', label: 'PenguinBase' },
            { href: 'https://creditcoin.org/Credit-Wallet', label: 'Credit Wallet' },
        ],
    },
    {
        name: 'Build',
        links: [
            { href: 'https://github.com/maulana-tech/buid-ctc', label: 'GitHub' },
            { href: 'https://github.com/gluwa/attestcoin-protocol-examples', label: 'Protocol examples' },
            { href: 'https://buidl.creditcoin.org/', label: 'BUIDL CTC' },
        ],
    },
]

export default function Footer() {
    return (
        <footer>
            <div className="mx-auto max-w-7xl space-y-16 px-6 pb-16 pt-32">
                <div className="grid grid-cols-2 gap-x-3 gap-y-12 sm:grid-cols-3 lg:grid-cols-5">
                    <div className="max-lg:col-span-full">
                        <Link
                            href="/"
                            aria-label="go home">
                            <LogoIcon uniColor />
                        </Link>
                        <p className="text-muted-foreground mt-4 max-w-56 text-sm">Under-collateralised lending on Creditcoin, priced by proved cross-chain history.</p>
                    </div>

                    {footerLinks.map((linksGroup) => (
                        <div key={linksGroup.name}>
                            <span className="text-sm font-medium">{linksGroup.name}</span>
                            <ul className="mt-4 list-inside space-y-4">
                                {linksGroup.links.map((link) => (
                                    <li key={link.label}>
                                        <Link
                                            href={link.href}
                                            className="hover:text-primary text-muted-foreground text-sm duration-150">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {isConfigured && (
                    <div className="border-t pt-8">
                        <div className="text-muted-foreground mb-4 text-xs">Deployed on Creditcoin testnet</div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                { label: 'CreditRegistry', address: ADDRESSES.registry },
                                { label: 'LendingHistoryASC', address: ADDRESSES.asc },
                                { label: 'CreditLine vault', address: ADDRESSES.line },
                                { label: 'ShareMarket', address: ADDRESSES.market },
                            ].filter((c) => c.address).map((contract) => {
                                const href = explorerUrl('address', contract.address)
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
                                    <Link key={contract.label} href={href} target="_blank" rel="noreferrer" className="group">
                                        {body}
                                    </Link>
                                ) : (
                                    <div key={contract.label}>{body}</div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t pt-8 text-sm">
                    <span>&copy; CreditPass {new Date().getFullYear()}</span>
                    <span>Testnet only. Nothing here is financial advice.</span>
                </div>
            </div>
        </footer>
    )
}
