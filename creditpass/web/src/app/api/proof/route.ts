import { JsonRpcProvider, getAddress, id as keccak, isHexString } from 'ethers'

import { PROTOCOLS, ACTION_INDEX, type EventKind } from '@/lib/protocols'

/**
 * Turn an Ethereum transaction hash into everything LendingHistoryASC.submit() needs.
 *
 *   POST /api/proof  { txHash }
 *
 * Detects which registered pool and event the transaction contains (so the user does not have to
 * know protocol ids or action codes), then asks the Creditcoin proof service for the Attestcoin
 * proof. Nothing is signed here — the browser submits the result from the user's own wallet.
 */
export const maxDuration = 60

const SOURCE_RPC = process.env.SOURCE_CHAIN_RPC_URL ?? 'https://ethereum-rpc.publicnode.com'
const PROOF_URL = (process.env.PROOF_BUILDER_URL ?? 'https://proof-gen-api.cc3-testnet.creditcoin.network/').replace(/\/$/, '')
// Deep history takes the proof service ~15s; give it room before calling it "not attested".
const PROOF_TIMEOUT_MS = 50_000

// Repayments are what the score rewards; if one transaction carries several events, prefer that.
const PRIORITY: EventKind[] = ['Repay', 'Liquidation', 'Borrow']

type Detected = { protocolId: number; protocolName: string; kind: EventKind; borrower: string; chainKey: number }

function detect(logs: readonly { address: string; topics: readonly string[] }[]): Detected | null {
    for (const kind of PRIORITY) {
        for (const protocol of PROTOCOLS) {
            const spec = protocol.events[kind]
            const topic0 = keccak(spec.signature)
            const log = logs.find((l) => l.address.toLowerCase() === protocol.pool.toLowerCase() && l.topics[0] === topic0)
            if (!log) continue
            const raw = log.topics[spec.borrowerTopic]
            if (!raw) continue
            return { protocolId: protocol.id, protocolName: protocol.name, kind, borrower: getAddress(`0x${raw.slice(-40)}`), chainKey: protocol.chainKey }
        }
    }
    return null
}

export async function POST(request: Request) {
    let txHash: unknown
    try {
        ;({ txHash } = (await request.json()) as { txHash?: unknown })
    } catch {
        return Response.json({ error: 'Send JSON with a txHash field.' }, { status: 400 })
    }
    if (typeof txHash !== 'string' || !isHexString(txHash, 32)) {
        return Response.json({ error: 'That is not a transaction hash (0x + 64 hex characters).' }, { status: 400 })
    }

    const receipt = await new JsonRpcProvider(SOURCE_RPC).getTransactionReceipt(txHash).catch(() => null)
    if (!receipt) return Response.json({ error: 'Transaction not found on Ethereum mainnet.' }, { status: 404 })
    if (receipt.status !== 1) return Response.json({ error: 'That transaction reverted, so it proves nothing.' }, { status: 400 })

    const found = detect(receipt.logs)
    if (!found) {
        return Response.json(
            { error: 'No repayment, borrow or liquidation from Aave V3, Spark or Morpho Blue in this transaction.' },
            { status: 400 }
        )
    }

    let proof: {
        headerNumber: number
        txBytes: string
        merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] }
        continuityProof: { lowerEndpointDigest: string; roots: string[] }
    }
    try {
        const res = await fetch(`${PROOF_URL}/api/v1/proof-by-tx/${found.chainKey}/${txHash}`, { signal: AbortSignal.timeout(PROOF_TIMEOUT_MS) })
        if (!res.ok) return Response.json({ error: `Proof service answered ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 })
        proof = await res.json()
    } catch (e) {
        const timedOut = e instanceof Error && e.name === 'TimeoutError'
        return Response.json({ error: timedOut ? 'The proof service took too long. Try again in a minute.' : String(e) }, { status: 504 })
    }

    return Response.json({
        txHash,
        protocolId: found.protocolId,
        protocolName: found.protocolName,
        action: ACTION_INDEX[found.kind],
        actionName: found.kind,
        borrower: found.borrower,
        chainKey: found.chainKey,
        sourceBlock: proof.headerNumber,
        txBytes: proof.txBytes,
        merkleRoot: proof.merkleProof.root,
        siblings: proof.merkleProof.siblings,
        lowerEndpointDigest: proof.continuityProof.lowerEndpointDigest,
        continuityRoots: proof.continuityProof.roots ?? [],
    })
}
