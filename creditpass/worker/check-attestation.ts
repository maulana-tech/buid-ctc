/**
 * Reads Creditcoin's attestation state, with no wallet and no funds required.
 *
 * This answers the question the whole project rests on: how far back is Ethereum attested? If
 * attestation only covers recent blocks, "years of real borrowing history" is not available and the
 * scan window has to shrink to whatever is actually attested. Better to know before building on it.
 *
 * Run: npm run check:attestation
 */
import { JsonRpcProvider } from 'ethers'
import { chainInfo, proofProvider } from '@gluwa/usc-sdk'
import 'dotenv/config'

// Deep history takes the builder ~15s to assemble; the SDK's 10s default gives up first and the
// failure looks like "not attested". Measured: 1 month ≈ 2s, 4 months ≈ 6s, 10 months ≈ 15s.
const PROOF_TIMEOUT_MS = 60_000

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set (copy .env.example to .env)`)
    return value
}

async function main() {
    const rpcUrl = env('CREDITCOIN_RPC_URL')
    const provider = new JsonRpcProvider(rpcUrl)
    const info = new chainInfo.PrecompileChainInfoProvider(provider)

    const network = await provider.getNetwork()
    console.log(`Creditcoin ${rpcUrl}`)
    console.log(`  chainId ${network.chainId}   head ${await provider.getBlockNumber()}\n`)

    const chains = await info.getSupportedChains()
    console.log('Supported source chains')
    for (const chain of chains) console.log(' ', JSON.stringify(chain))
    console.log()

    for (const chain of chains) {
        const record = chain as unknown as Record<string, unknown>
        const key = Number(record.chainKey ?? record.chain_key)
        if (!Number.isFinite(key)) continue

        try {
            const attested = await info.getLatestAttestedHeightAndHash(key)
            console.log(`chainKey ${key}: latest attested height ${attested.height}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.log(`chainKey ${key}: ERROR ${message}`)
        }
    }

    // Can the proof builder actually serve an old block, or only recent ones?
    const args = process.argv.slice(2)
    const txHash = args.find((a) => a.startsWith('0x') && a.length === 66)
    const probe = Number(args.find((a) => /^\d+$/.test(a)) ?? 0)
    if (probe > 0) {
        const key = Number(args.find((a) => /^\d{1,2}$/.test(a)) ?? 3)
        const builder = new proofProvider.service.ProofBuilder(key, env('PROOF_BUILDER_URL'), PROOF_TIMEOUT_MS)
        console.log(`\nProbing chainKey ${key} height ${probe} (30s timeout)…`)
        try {
            await builder.waitUntilHeightAttested(key, probe, 5_000, 30_000)
            console.log('  attested — historical proofs for this height are available')
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.log(`  not available: ${message}`)
        }
    } else {
        console.log('\nPass a block height to probe it, e.g. npm run check:attestation -- 21500000 3')
    }

    // Attested height is necessary but not sufficient — the proof builder also has to be able to
    // build a proof for that transaction. This is the check that actually decides the scan window.
    if (txHash) {
        const key = Number(args.find((a) => /^\d{1,2}$/.test(a)) ?? 3)
        const builder = new proofProvider.service.ProofBuilder(key, env('PROOF_BUILDER_URL'), PROOF_TIMEOUT_MS)
        console.log(`\nBuilding a proof for ${txHash} on chainKey ${key}…`)
        try {
            const proof = await builder.getProof(txHash)
            if (proof.success && proof.data) {
                console.log(`  OK  header ${proof.data.headerNumber}`)
                console.log(`      txBytes ${proof.data.txBytes.length} chars`)
                console.log(`      merkle siblings ${proof.data.merkleProof.siblings.length}`)
                console.log(`      continuity roots ${proof.data.continuityProof.roots?.length ?? 0}`)
            } else {
                console.log(`  failed: ${proof.error}`)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.log(`  failed: ${message}`)
        }
    }
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
