/**
 * Off-chain readability worker.
 *
 * Finds a wallet's history across every configured lending protocol, waits for each containing
 * block to be attested, pulls a proof from the Proof Builder, and submits it to LendingHistoryASC.
 * The worker is untrusted: it only decides *which* transactions to present. Whether they are real
 * is settled on-chain by the block-prover precompile.
 *
 * Run: npm run worker -- 0xUserAddress [--lookback 200000] [--limit 5] [--protocol 0]
 */
import { readFileSync } from 'node:fs'
import { Contract, JsonRpcProvider, Wallet, getAddress, id, zeroPadValue } from 'ethers'
import { chainInfo, proofProvider } from '@gluwa/usc-sdk'
import 'dotenv/config'

import { ACTION_INDEX, EVENT_KINDS, PROTOCOLS, type EventKind, type Protocol } from './protocols'

const ABI = JSON.parse(
    readFileSync(new URL('../out/LendingHistoryASC.sol/LendingHistoryASC.json', import.meta.url), 'utf8')
).abi

const CHUNK = 2_000
const GAS_BUFFER_PCT = 135n

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set (copy .env.example to .env)`)
    return value
}

function parseArgs() {
    const [address, ...rest] = process.argv.slice(2)
    if (!address) throw new Error('Usage: npm run worker -- 0xUserAddress [--lookback N] [--limit N] [--protocol ID]')
    const flag = (name: string) => {
        const i = rest.indexOf(`--${name}`)
        return i === -1 ? undefined : Number(rest[i + 1])
    }
    return {
        user: getAddress(address),
        lookback: flag('lookback') ?? 200_000,
        limit: flag('limit') ?? 5,
        protocol: flag('protocol'),
    }
}

type Hit = { protocol: Protocol; kind: EventKind; txHash: string; blockNumber: number }

/** Scan the source chain for the user's events across every selected protocol, newest first. */
async function findHistory(src: JsonRpcProvider, protocols: Protocol[], user: string, lookback: number, limit: number) {
    const head = (await src.getBlockNumber()) - 64
    const floor = Math.max(0, head - lookback)
    const userTopic = zeroPadValue(user, 32)
    const hits: Hit[] = []
    const seen = new Set<string>()

    for (let end = head; end > floor && hits.length < limit; end -= CHUNK) {
        const start = Math.max(floor, end - CHUNK + 1)

        for (const protocol of protocols) {
            for (const kind of EVENT_KINDS) {
                const spec = protocol.events[kind]
                const topics: (string | null)[] = [id(spec.signature), null, null, null]
                topics[spec.borrowerTopic] = userTopic

                try {
                    const logs = await src.getLogs({ address: protocol.pool, topics, fromBlock: start, toBlock: end })
                    for (const log of logs) {
                        // One proof carries the whole transaction, so two events of the same kind
                        // in one transaction are a single submission.
                        const key = `${log.transactionHash}:${protocol.id}:${kind}`
                        if (seen.has(key)) continue
                        seen.add(key)
                        hits.push({ protocol, kind, txHash: log.transactionHash, blockNumber: log.blockNumber })
                    }
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e)
                    console.warn(`  scan ${protocol.name} ${kind} ${start}-${end}: ${message}`)
                }
            }
        }
    }

    return hits.slice(0, limit)
}

async function submitProof(asc: Contract, hit: Hit, proof: any, wallet: Wallet, cc: JsonRpcProvider) {
    const args = [
        hit.protocol.id,
        ACTION_INDEX[hit.kind],
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof.root,
        proof.merkleProof.siblings,
        proof.continuityProof.lowerEndpointDigest,
        proof.continuityProof.roots,
    ]

    let gasLimit: bigint
    try {
        const data = asc.interface.encodeFunctionData('submit', args)
        const estimate = await cc.estimateGas({ to: await asc.getAddress(), data, from: wallet.address })
        gasLimit = (estimate * GAS_BUFFER_PCT) / 100n
    } catch (e) {
        // pallet-evm does not always propagate precompile revert reasons during estimation, so a
        // failed estimate does not mean the call would fail. Fall back to a size-based figure.
        const continuityBlocks = proof.continuityProof.roots?.length || 1
        gasLimit = BigInt(21_000 + continuityBlocks * 5_000 + 20_000)
        const message = e instanceof Error ? e.message : String(e)
        console.warn(`  gas estimation failed (${message}); using ${gasLimit}`)
    }

    const tx = await asc.submit(...args, { gasLimit })
    console.log(`  submitted ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`  mined in Creditcoin block ${receipt.blockNumber}`)
}

async function main() {
    const { user, lookback, limit, protocol } = parseArgs()
    const selected = protocol === undefined ? PROTOCOLS : PROTOCOLS.filter((p) => p.id === protocol)
    if (selected.length === 0) throw new Error(`No protocol with id ${protocol} in protocols.ts`)

    const src = new JsonRpcProvider(env('SOURCE_CHAIN_RPC_URL'))
    const cc = new JsonRpcProvider(env('CREDITCOIN_RPC_URL'))
    const wallet = new Wallet(env('CREDITCOIN_WALLET_PRIVATE_KEY'), cc)
    const asc = new Contract(env('LENDING_HISTORY_ASC_ADDRESS'), ABI, wallet)

    const info = new chainInfo.PrecompileChainInfoProvider(cc)
    for (const chainKey of new Set(selected.map((p) => p.chainKey))) {
        const attested = await info.getLatestAttestedHeightAndHash(chainKey)
        console.log(`Chain key ${chainKey}: latest attested height ${attested.height}`)
    }

    console.log(`Scanning ${lookback} blocks across ${selected.map((p) => p.name).join(', ')} for ${user}…`)
    const hits = await findHistory(src, selected, user, lookback, limit)
    if (hits.length === 0) {
        console.log('No lending activity found for this address in the scanned range.')
        return
    }

    console.log(`Found ${hits.length}:`)
    for (const hit of hits) {
        console.log(`  ${hit.protocol.name.padEnd(12)} ${hit.kind.padEnd(12)} block ${hit.blockNumber}  ${hit.txHash}`)
    }

    const builders = new Map<number, proofProvider.service.ProofBuilder>()
    const builderFor = (chainKey: number) => {
        if (!builders.has(chainKey)) {
            builders.set(chainKey, new proofProvider.service.ProofBuilder(chainKey, env('PROOF_BUILDER_URL')))
        }
        return builders.get(chainKey)!
    }

    for (const hit of hits) {
        console.log(`\n${hit.protocol.name} ${hit.kind} @ ${hit.blockNumber}`)
        const builder = builderFor(hit.protocol.chainKey)

        // Attestation of a fresh block takes minutes. Historical blocks should return immediately.
        await builder.waitUntilHeightAttested(hit.protocol.chainKey, hit.blockNumber, 15_000, 1_200_000)

        const proof = await builder.getProof(hit.txHash)
        if (!proof.success) {
            console.error(`  proof generation failed: ${proof.error}`)
            continue
        }
        try {
            await submitProof(asc, hit, proof.data, wallet, cc)
        } catch (e) {
            // A duplicate query or an already-counted repayment is expected on re-runs, not a crash.
            const message = e instanceof Error ? e.message : String(e)
            console.error(`  submit failed: ${message}`)
        }
    }
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
