/**
 * Wallet discovery and network handling.
 *
 * Uses EIP-6963 rather than reaching for `window.ethereum` directly. That matters here: Credit
 * Wallet is a mobile app with an in-app browser, not a desktop extension, so there is no single
 * well-known injected provider to assume. Announced providers cover extensions, in-app browsers,
 * and multiple wallets installed side by side — with a `window.ethereum` fallback for wallets that
 * never learned to announce.
 */

export type Eip1193Provider = {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    on?: (event: string, handler: (...args: unknown[]) => void) => void
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

export type DiscoveredWallet = {
    uuid: string
    name: string
    icon: string
    provider: Eip1193Provider
}

/** chainId 102031, read from the live RPC. */
export const CREDITCOIN_TESTNET = {
    chainId: '0x18e8f',
    chainName: 'Creditcoin Testnet',
    nativeCurrency: { name: 'Creditcoin', symbol: 'CTC', decimals: 18 },
    rpcUrls: ['https://rpc.cc3-testnet.creditcoin.network'],
    blockExplorerUrls: ['https://creditcoin-testnet.blockscout.com'],
} as const

type AnnounceEvent = CustomEvent<{ info: { uuid: string; name: string; icon: string }; provider: Eip1193Provider }>

/**
 * Subscribe to EIP-6963 announcements. Returns an unsubscribe function.
 * Wallets announce in response to the request event, so late-loading extensions still arrive.
 */
export function discoverWallets(onFound: (wallet: DiscoveredWallet) => void): () => void {
    if (typeof window === 'undefined') return () => {}

    const handler = (event: Event) => {
        const detail = (event as AnnounceEvent).detail
        if (!detail?.provider) return
        onFound({ ...detail.info, provider: detail.provider })
    }

    window.addEventListener('eip6963:announceProvider', handler)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    // Wallets that predate EIP-6963 never answer; surface the legacy injection so they still work.
    const legacy = (window as unknown as { ethereum?: Eip1193Provider }).ethereum
    if (legacy) onFound({ uuid: 'injected', name: 'Injected wallet', icon: '', provider: legacy })

    return () => window.removeEventListener('eip6963:announceProvider', handler)
}

/**
 * Put the wallet on Creditcoin before asking it to sign anything.
 * Without this a borrow or deposit is signed on whatever chain the wallet happened to be on.
 */
export async function ensureCreditcoinNetwork(provider: Eip1193Provider): Promise<void> {
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CREDITCOIN_TESTNET.chainId }],
        })
    } catch (error) {
        // 4902 = chain unknown to the wallet. Anything else is a real failure worth surfacing.
        const code = (error as { code?: number }).code
        if (code !== 4902) throw error
        await provider.request({ method: 'wallet_addEthereumChain', params: [CREDITCOIN_TESTNET] })
    }
}

export async function currentChainId(provider: Eip1193Provider): Promise<string> {
    return (await provider.request({ method: 'eth_chainId' })) as string
}

export const isCreditcoin = (chainId: string) => chainId?.toLowerCase() === CREDITCOIN_TESTNET.chainId
