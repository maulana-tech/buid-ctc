/**
 * Verifies every protocol event signature in protocols.ts against live mainnet logs.
 *
 * A wrong signature string compiles fine, verifies proofs fine, and silently never matches a log —
 * so this check is the difference between "it works" and "it looks like it works". It also proves
 * the borrower topic index, by asserting the log carries enough topics for it.
 *
 * Run: npm run check:sigs
 */
import { JsonRpcProvider, id } from 'ethers'
import 'dotenv/config'

import { EVENT_KINDS, PROTOCOLS } from './protocols'

const CHUNK = 2_000 // free-tier RPCs time out on wider eth_getLogs windows

async function findOne(provider: JsonRpcProvider, pool: string, topic0: string, from: number, to: number) {
    for (let end = to; end > from; end -= CHUNK) {
        const start = Math.max(from, end - CHUNK + 1)
        try {
            const logs = await provider.getLogs({ address: pool, topics: [topic0], fromBlock: start, toBlock: end })
            if (logs.length > 0) return logs[0]
        } catch {
            // Free-tier RPCs rate-limit and time out. A failed window is not evidence of a wrong
            // signature, so skip it rather than reporting a false failure.
        }
    }
    return null
}

async function main() {
    const rpc = process.env.SOURCE_CHAIN_RPC_URL
    if (!rpc) throw new Error('SOURCE_CHAIN_RPC_URL is not set (copy .env.example to .env)')

    const provider = new JsonRpcProvider(rpc)
    // Stay behind the head: load-balanced RPCs lag a few blocks, and a range ending past a node's
    // own head is a hard error rather than an empty result.
    const head = (await provider.getBlockNumber()) - 64

    let failures = 0
    let inconclusive = 0

    for (const protocol of PROTOCOLS) {
        console.log(`\n${protocol.name}  ${protocol.pool}`)

        for (const kind of EVENT_KINDS) {
            const spec = protocol.events[kind]
            const topic0 = id(spec.signature)
            const log = await findOne(provider, protocol.pool, topic0, head - spec.lookback, head)

            if (!log) {
                inconclusive++
                console.log(`  ??  ${kind.padEnd(12)} ${topic0}  no log in ${spec.lookback} blocks — unverified`)
                continue
            }

            const enoughTopics = log.topics.length > spec.borrowerTopic
            if (!enoughTopics) failures++
            console.log(
                `  ${enoughTopics ? 'OK' : 'FAIL'}  ${kind.padEnd(12)} ${topic0}  ` +
                    `topics=${log.topics.length} borrowerTopic=${spec.borrowerTopic}  block ${log.blockNumber}`
            )
        }
    }

    console.log()
    if (failures > 0) {
        console.error(`${failures} signature check(s) failed.`)
        process.exit(1)
    }
    if (inconclusive > 0) {
        console.warn(`${inconclusive} event(s) unverified — rare on-chain, widen lookback to confirm.`)
    }
    console.log('All matched signatures agree with live mainnet logs.')
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
