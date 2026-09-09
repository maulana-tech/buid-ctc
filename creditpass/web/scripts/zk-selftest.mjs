// Proves the Foundry fixture's statement with the same libraries the browser uses (noir_js +
// bb.js), then verifies it. If this passes, the page's prover produces what the on-chain verifier
// accepts — the fixture itself was already checked against the contract by forge test.
//
// Run: npm run zk:selftest
import { readFileSync } from 'node:fs'
import { Noir } from '@noir-lang/noir_js'
import { UltraHonkBackend } from '@aztec/bb.js'
import { poseidon1, poseidon2 } from 'poseidon-lite'

const circuit = JSON.parse(readFileSync(new URL('../src/lib/zk/credit_threshold.json', import.meta.url), 'utf8'))
const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/zk-threshold.json', import.meta.url), 'utf8'))

const DEPTH = 16
const hex = (v) => `0x${v.toString(16).padStart(64, '0')}`
const secret = BigInt(fixture.secret)
const commitment = poseidon1([secret])
const nullifier = poseidon2([secret, 1n])
if (hex(commitment) !== fixture.commitment) throw new Error('poseidon-lite commitment differs from the fixture')
if (hex(nullifier) !== fixture.nullifier) throw new Error('poseidon-lite nullifier differs from the fixture')

// Rebuild Alice's path exactly as script/make-zk-fixture.ts did.
const leaf = (a, s, c) => poseidon2([poseidon2([a, s]), c])
const zeros = [0n]
for (let i = 1; i <= DEPTH; i++) zeros.push(poseidon2([zeros[i - 1], zeros[i - 1]]))
const siblings = [leaf(BigInt(fixture.bob), BigInt(fixture.bobScore), 0n), ...zeros.slice(1, DEPTH)]

const started = performance.now()
const noir = new Noir(circuit)
const { witness } = await noir.execute({
    root: fixture.root,
    threshold: fixture.threshold,
    nullifier_defaults: fixture.defaults,
    nullifier: fixture.nullifier,
    secret: fixture.secret,
    address: hex(BigInt(fixture.alice)),
    score: fixture.aliceScore,
    index: 0,
    siblings: siblings.map(hex),
})
const backend = new UltraHonkBackend(circuit.bytecode)
const proof = await backend.generateProof(witness, { keccakZK: true })
const ok = await backend.verifyProof(proof, { keccakZK: true })
await backend.destroy()

console.log(`proof      ${proof.proof.length} bytes in ${((performance.now() - started) / 1000).toFixed(1)}s`)
console.log(`public     ${proof.publicInputs.map((p) => p.slice(0, 10) + '…').join(' ')}`)
console.log(`verified   ${ok}`)
if (!ok) process.exit(1)
if (proof.publicInputs.length !== 4 || BigInt(proof.publicInputs[0]) !== BigInt(fixture.root) || BigInt(proof.publicInputs[3]) !== nullifier) {
    throw new Error('public inputs are not [root, threshold, defaults, nullifier] in that order')
}
console.log('public inputs match the contract ordering')
