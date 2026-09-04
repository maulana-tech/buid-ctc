/**
 * Fetches real proofs from the live Proof Builder and writes them to test/fixtures/.
 *
 * The unit tests build synthetic log structs, which means the RLP decoder has never seen a real
 * Ethereum transaction. These fixtures fix that: the contract test replays actual mainnet
 * transactions through the actual decoder, with only the precompile mocked out.
 *
 * Run: npm run make:fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { JsonRpcProvider, id, zeroPadValue } from 'ethers'
import { proofProvider } from '@gluwa/usc-sdk'
import 'dotenv/config'

import { ACTION_INDEX, EVENT_KINDS, PROTOCOLS, type EventKind, type Protocol } from '../worker/protocols'

const OUT_DIR = new URL('../test/fixtures/', import.meta.url)
const CHUNK = 2_000
const PROOF_TIMEOUT_MS = 60_000

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set (copy .env.example to .env)`)
    return value
}

/** Newest log of this kind, so the proof builder has the least work to do. */
async function findLog(src: JsonRpcProvider, protocol: Protocol, kind: EventKind, head: number) {
    const spec = protocol.events[kind]
    for (let end = head; end > head - spec.lookback; end -= CHUNK) {
        const start = end - CHUNK + 1
        try {
            const logs = await src.getLogs({
                address: protocol.pool,
                topics: [id(spec.signature)],
                fromBlock: start,
                toBlock: end,
            })
            if (logs.length > 0) return logs[logs.length - 1]
        } catch {
            // Free-tier RPCs rate-limit; a failed window is not a missing event.
        }
    }
    return null
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true })

    const src = new JsonRpcProvider(env('SOURCE_CHAIN_RPC_URL'))
    const head = (await src.getBlockNumber()) - 64
    const wanted: EventKind[] = (process.argv.slice(2).filter((a) => EVENT_KINDS.includes(a as EventKind)) as EventKind[])
    const kinds = wanted.length > 0 ? wanted : (['Repay'] as EventKind[])

    for (const protocol of PROTOCOLS) {
        const builder = new proofProvider.service.ProofBuilder(protocol.chainKey, env('PROOF_BUILDER_URL'), PROOF_TIMEOUT_MS)

        for (const kind of kinds) {
            const spec = protocol.events[kind]
            const log = await findLog(src, protocol, kind, head)
            if (!log) {
                console.log(`${protocol.name} ${kind}: no log found, skipping`)
                continue
            }

            const borrower = '0x' + log.topics[spec.borrowerTopic].slice(26)
            console.log(`${protocol.name} ${kind}  block ${log.blockNumber}  borrower ${borrower}`)

            const proof = await builder.getProof(log.transactionHash)
            if (!proof.success || !proof.data) {
                console.log(`  proof failed: ${proof.error}`)
                continue
            }

            const data = proof.data
            // Sanity: the proof must be for the block we found the log in, or the fixture is a lie.
            if (Number(data.headerNumber) !== log.blockNumber) {
                throw new Error(`proof header ${data.headerNumber} != log block ${log.blockNumber}`)
            }

            const name = `${protocol.name.toLowerCase().replace(/\s+/g, '-')}-${kind.toLowerCase()}`
            const fixture = {
                protocolId: protocol.id,
                protocolName: protocol.name,
                action: ACTION_INDEX[kind],
                actionName: kind,
                pool: protocol.pool,
                chainKey: Number(data.chainKey),
                blockHeight: Number(data.headerNumber),
                txHash: log.transactionHash,
                expectedBorrower: borrower,
                borrowerTopic: spec.borrowerTopic,
                txBytes: data.txBytes,
                merkleRoot: data.merkleProof.root,
                siblings: data.merkleProof.siblings,
                lowerEndpointDigest: data.continuityProof.lowerEndpointDigest,
                continuityRoots: data.continuityProof.roots ?? [],
            }

            writeFileSync(new URL(`${name}.json`, OUT_DIR), JSON.stringify(fixture, null, 2))
            console.log(`  wrote test/fixtures/${name}.json  (${data.continuityProof.roots?.length ?? 0} continuity roots)`)

            // Verify the borrower topic really is where protocols.ts says it is.
            if (!data.txBytes.toLowerCase().includes(zeroPadValue(borrower, 32).slice(2).toLowerCase())) {
                console.log('  note: borrower not found verbatim in txBytes (may be inside a nested structure)')
            }
        }
    }
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
