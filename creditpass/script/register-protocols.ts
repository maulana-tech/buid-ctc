/**
 * Writes the protocol table from worker/protocols.ts into LendingHistoryASC.
 *
 * Adding a protocol is a transaction, not a redeploy — which is the whole point of storing event
 * shapes as data. Re-running is safe: registerSource overwrites and setEventSpec is idempotent.
 *
 * Run: npm run register:protocols
 */
import { Contract, JsonRpcProvider, Wallet, id } from 'ethers'
import 'dotenv/config'

import { ACTION_INDEX, EVENT_KINDS, PROTOCOLS } from '../worker/protocols'

const ASC_ABI = [
    'function registerSource(uint16 protocolId, string name, address pool, uint64 chainKey)',
    'function setEventSpec(uint16 protocolId, uint8 action, bytes32 topic0, uint8 borrowerTopic)',
    'function registeredProtocolIds() view returns (uint16[])',
]

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set (copy .env.example to .env)`)
    return value
}

async function main() {
    const provider = new JsonRpcProvider(env('CREDITCOIN_RPC_URL'))
    const wallet = new Wallet(env('CREDITCOIN_WALLET_PRIVATE_KEY'), provider)
    const asc = new Contract(env('LENDING_HISTORY_ASC_ADDRESS'), ASC_ABI, wallet)

    for (const protocol of PROTOCOLS) {
        console.log(`\n${protocol.name} (id ${protocol.id})`)

        const register = await asc.registerSource(protocol.id, protocol.name, protocol.pool, protocol.chainKey)
        await register.wait()
        console.log(`  source registered  ${protocol.pool}  chainKey ${protocol.chainKey}`)

        for (const kind of EVENT_KINDS) {
            const spec = protocol.events[kind]
            const topic0 = id(spec.signature)
            const tx = await asc.setEventSpec(protocol.id, ACTION_INDEX[kind], topic0, spec.borrowerTopic)
            await tx.wait()
            console.log(`  ${kind.padEnd(12)} ${topic0} → topic ${spec.borrowerTopic}`)
        }
    }

    const ids = await asc.registeredProtocolIds()
    console.log(`\nRegistered protocol ids: ${ids.join(', ')}`)
}

main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
})
