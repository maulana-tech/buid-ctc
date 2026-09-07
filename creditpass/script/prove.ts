/**
 * Proves one known transaction, without scanning for it first.
 *
 * The worker's log scan is the fragile half of the pipeline: it needs an Ethereum RPC generous
 * enough to serve `eth_getLogs` over wide ranges, and free tiers routinely refuse. Proving needs
 * only the transaction hash. When you already know which transaction you want — from an explorer,
 * from a fixture, from a user — this goes straight at it.
 *
 * Run: npm run prove -- <txHash> <protocolId> <Repay|Liquidation|Borrow>
 */
import { readFileSync } from 'node:fs'
import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { proofProvider } from '@gluwa/usc-sdk'
import 'dotenv/config'

import { ACTION_INDEX, PROTOCOLS, type EventKind } from '../worker/protocols'

const ABI = JSON.parse(
    readFileSync(new URL('../out/LendingHistoryASC.sol/LendingHistoryASC.json', import.meta.url), 'utf8')
).abi
const REGISTRY_ABI = ['function scoreOf(address) view returns (uint16)', 'function isKnown(address) view returns (bool)']

// Deep history takes the builder ~15s; the SDK's 10s default gives up first and reports it as
// "not yet attested", which points at entirely the wrong cause.
const PROOF_TIMEOUT_MS = 60_000
const GAS_BUFFER_PCT = 135n

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set in .env`)
    return value
}

async function main() {
    const [txHash, protocolArg, kindArg] = process.argv.slice(2)
    if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
        throw new Error('Usage: npm run prove -- <txHash> <protocolId> <Repay|Liquidation|Borrow>')
    }

    const protocol = PROTOCOLS.find((p) => p.id === Number(protocolArg ?? 0))
    if (!protocol) throw new Error(`No protocol with id ${protocolArg} in worker/protocols.ts`)

    const kind = (kindArg ?? 'Repay') as EventKind
    if (!(kind in ACTION_INDEX)) throw new Error(`Unknown event kind ${kind}`)

    const cc = new JsonRpcProvider(env('CREDITCOIN_RPC_URL'))
    const wallet = new Wallet(env('CREDITCOIN_WALLET_PRIVATE_KEY'), cc)
    const asc = new Contract(env('LENDING_HISTORY_ASC_ADDRESS'), ABI, wallet)
    const registry = new Contract(env('CREDIT_REGISTRY_ADDRESS'), REGISTRY_ABI, cc)

    console.log(`${protocol.name} ${kind}`)
    console.log(`  tx      ${txHash}`)
    console.log(`  chain   ${protocol.chainKey}\n`)

    const builder = new proofProvider.service.ProofBuilder(protocol.chainKey, env('PROOF_BUILDER_URL'), PROOF_TIMEOUT_MS)
    console.log('Fetching proof…')
    const result = await builder.getProof(txHash)
    if (!result.success || !result.data) throw new Error(`Proof generation failed: ${result.error}`)

    const proof = result.data
    const continuity = proof.continuityProof.roots?.length ?? 0
    console.log(`  header ${proof.headerNumber}  txBytes ${proof.txBytes.length} chars  continuity ${continuity} roots\n`)

    const args = [
        protocol.id,
        ACTION_INDEX[kind],
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
        console.log(`Estimated gas ${estimate}, sending with ${gasLimit}`)
    } catch (error) {
        // pallet-evm does not always propagate precompile revert reasons during estimation, so a
        // failed estimate is not proof the call would fail.
        gasLimit = BigInt(21_000 + continuity * 5_000 + 200_000)
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`Gas estimation failed (${message.slice(0, 120)}); using ${gasLimit}`)
    }

    console.log('Submitting to the ASC…')
    const tx = await asc.submit(...args, { gasLimit })
    console.log(`  ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`  status ${receipt.status}  block ${receipt.blockNumber}  gas used ${receipt.gasUsed}`)

    // Read back what the contract actually recorded.
    for (const log of receipt.logs) {
        try {
            const parsed = asc.interface.parseLog({ topics: [...log.topics], data: log.data })
            if (parsed?.name === 'HistoryProved') {
                const user = parsed.args[0] as string
                console.log(`\nHistoryProved  user ${user}  sourceBlock ${parsed.args[3]}`)
                console.log(`  known ${await registry.isKnown(user)}   score ${await registry.scoreOf(user)}`)
            }
        } catch {
            // Logs from the registry and the precompile are not ours to decode here.
        }
    }

    console.log(`\nhttps://creditcoin-testnet.blockscout.com/tx/${tx.hash}`)
}

main().catch((e) => {
    console.error(`\n${e.message ?? e}`)
    process.exit(1)
})
