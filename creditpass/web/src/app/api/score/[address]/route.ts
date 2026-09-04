import { isAddress } from 'ethers'

import { PROTOCOL_NAMES, isConfigured, loadSnapshot } from '@/lib/creditpass'

/**
 * Public read API for a credit passport.
 *
 *   GET /api/score/0x…
 *
 * The registry is meant to be a shared primitive, and a primitive nobody can call is just an
 * application. Contracts on Creditcoin read it with `scoreOf()`; everything off-chain — a lender's
 * risk engine, a dashboard, a spreadsheet — reads it here. No key, no signup, same data.
 */
export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
    const { address } = await context.params

    if (!isAddress(address)) {
        return Response.json({ error: 'Not a valid address' }, { status: 400 })
    }
    if (!isConfigured) {
        return Response.json({ error: 'Contracts are not deployed in this environment' }, { status: 503 })
    }

    try {
        const snapshot = await loadSnapshot(address)

        return Response.json(
            {
                address,
                known: snapshot.known,
                score: snapshot.score,
                minScore: snapshot.minScore,
                creditLimit: snapshot.limit.toString(),
                assetDecimals: snapshot.asset.decimals,
                assetSymbol: snapshot.asset.symbol,
                profile: {
                    repayments: snapshot.profile.repayments,
                    borrows: snapshot.profile.borrows,
                    liquidations: snapshot.profile.liquidations,
                    defaults: snapshot.profile.defaults,
                    firstSeenBlock: snapshot.profile.firstSeenBlock,
                    protocolCount: snapshot.profile.protocolCount,
                },
                history: snapshot.history.map((entry) => ({
                    protocol: PROTOCOL_NAMES[entry.protocolId] ?? `protocol-${entry.protocolId}`,
                    action: entry.action,
                    sourceChainKey: entry.chainKey,
                    sourceBlock: entry.sourceBlock,
                    queryId: entry.queryId,
                    proofTx: entry.txHash,
                })),
            },
            // Scores only move when a proof lands, so a short cache costs nothing and spares the RPC.
            { headers: { 'cache-control': 'public, max-age=30' } }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return Response.json({ error: message }, { status: 502 })
    }
}
