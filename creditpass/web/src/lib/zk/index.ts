/**
 * Selective disclosure, browser side.
 *
 * An identity is {scored address, secret}. The address publishes commitment = H(secret) once; from
 * then on any wallet can prove "that address scores at least T" without naming it. Everything here
 * runs locally: the secret never leaves the browser, the proof is generated in WASM, and only the
 * proof plus four public inputs go on chain.
 */
import { poseidon1, poseidon2 } from 'poseidon-lite'

import circuit from './credit_threshold.json'

export const FIELD_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const NULLIFIER_DOMAIN = 1n
const STORAGE_KEY = 'creditpass:identity'

export type Identity = { address: string; secret: string }

export const hex = (v: bigint) => `0x${v.toString(16).padStart(64, '0')}`

export function randomSecret(): bigint {
    const bytes = new Uint8Array(31) // 248 bits: always below the field prime
    crypto.getRandomValues(bytes)
    return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`)
}

export const commitmentOf = (secret: bigint) => poseidon1([secret])
export const nullifierOf = (secret: bigint) => poseidon2([secret, NULLIFIER_DOMAIN])

export function loadIdentity(): Identity | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? (JSON.parse(raw) as Identity) : null
    } catch {
        return null
    }
}

export function saveIdentity(identity: Identity | null) {
    try {
        if (identity) localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
        else localStorage.removeItem(STORAGE_KEY)
    } catch {
        // Private mode or blocked storage: the user still has the secret on screen.
    }
}

export type ThresholdWitness = {
    secret: bigint
    address: string
    score: number
    index: number
    siblings: bigint[]
    root: bigint
    threshold: number
    defaults: number
}

export type ThresholdProof = { proof: string; publicInputs: string[]; nullifier: bigint }

/**
 * Generate the UltraHonk proof in the browser. Keccak transcript so the Solidity verifier can
 * check it; ZK flavour so the proof itself reveals nothing about the witness.
 */
export async function proveThreshold(w: ThresholdWitness, onStatus?: (s: string) => void): Promise<ThresholdProof> {
    onStatus?.('Loading prover…')
    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([import('@noir-lang/noir_js'), import('@aztec/bb.js')])

    const nullifier = nullifierOf(w.secret)
    onStatus?.('Executing circuit…')
    const noir = new Noir(circuit as never)
    const { witness } = await noir.execute({
        root: hex(w.root),
        threshold: w.threshold,
        nullifier_defaults: w.defaults,
        nullifier: hex(nullifier),
        secret: hex(w.secret),
        address: hex(BigInt(w.address)),
        score: w.score,
        index: w.index,
        siblings: w.siblings.map(hex),
    })

    onStatus?.('Generating proof…')
    const backend = new UltraHonkBackend((circuit as { bytecode: string }).bytecode)
    try {
        const { proof, publicInputs } = await backend.generateProof(witness, { keccakZK: true })
        return { proof: `0x${Array.from(proof, (b) => b.toString(16).padStart(2, '0')).join('')}`, publicInputs, nullifier }
    } finally {
        await backend.destroy()
    }
}
