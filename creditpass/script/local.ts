/**
 * Brings up the whole stack on a local Anvil chain, end to end, with no testnet funds.
 *
 * The one thing a local chain cannot have is the `0xFD2` verifier: it is a pallet-evm runtime
 * precompile with no bytecode, so there is nothing to fork or deploy. `anvil_setCode` puts the test
 * mock there instead — every other part of the flow is the real thing, including real mainnet
 * proofs replayed from test/fixtures.
 *
 *   anvil --chain-id 102031          # in another terminal
 *   npm run local
 *
 * Run: npm run local
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, id, parseUnits } from 'ethers'
import { globSync } from 'node:fs'

import { ACTION_INDEX, EVENT_KINDS, PROTOCOLS } from '../worker/protocols'

const RPC = process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545'
/** Anvil's first default account. Local only — this key is public knowledge by design. */
const DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PRECOMPILE = '0x0000000000000000000000000000000000000FD2'

const LIMIT_UNIT = parseUnits('100', 6)
const VAULT_SEED = parseUnits('1000000', 6)

function artifact(path: string) {
    return JSON.parse(readFileSync(new URL(`../out/${path}`, import.meta.url), 'utf8'))
}

async function deploy(name: string, path: string, wallet: NonceManager, args: unknown[] = []) {
    const { abi, bytecode } = artifact(path)
    const factory = new ContractFactory(abi, bytecode.object ?? bytecode, wallet)
    const contract = await factory.deploy(...args)
    await contract.waitForDeployment()
    const address = await contract.getAddress()
    console.log(`  ${name.padEnd(20)} ${address}`)
    return new Contract(address, abi, wallet)
}

async function main() {
    const provider = new JsonRpcProvider(RPC)

    let chainId: bigint
    try {
        chainId = (await provider.getNetwork()).chainId
    } catch {
        throw new Error(`No chain at ${RPC}. Start one first:\n\n  anvil --chain-id 102031\n`)
    }
    console.log(`Local chain ${chainId} at ${RPC}\n`)

    // Anvil mines instantly, but ethers still reads the nonce per transaction and can race itself
    // across back-to-back deploys. NonceManager keeps its own counter.
    const account = new Wallet(DEV_KEY, provider)
    const wallet = new NonceManager(account)

    // 1. Install the verifier the chain cannot have on its own.
    console.log('Installing mock verifier at 0xFD2')
    const mock = artifact('MockNativeQueryVerifier.sol/MockNativeQueryVerifier.json')
    const runtime = mock.deployedBytecode.object ?? mock.deployedBytecode
    await provider.send('anvil_setCode', [PRECOMPILE, runtime])
    const installed = await provider.getCode(PRECOMPILE)
    if (installed === '0x') throw new Error('anvil_setCode did not take — is this really Anvil?')
    console.log(`  ${installed.length} chars of bytecode in place\n`)

    // 2. Deploy.
    console.log('Deploying')
    const registry = await deploy('CreditRegistry', 'CreditRegistry.sol/CreditRegistry.json', wallet)
    const asc = await deploy('LendingHistoryASC', 'LendingHistoryASC.sol/LendingHistoryASC.json', wallet, [
        await registry.getAddress(),
    ])
    const usd = await deploy('TestUSD', 'TestUSD.sol/TestUSD.json', wallet)
    const line = await deploy('CreditLine', 'CreditLine.sol/CreditLine.json', wallet, [
        await usd.getAddress(),
        await registry.getAddress(),
        LIMIT_UNIT,
    ])

    // 3. Only these two may write credit profiles.
    console.log('\nWiring reporters')
    await (await registry.setReporter(await asc.getAddress(), true)).wait()
    await (await registry.setReporter(await line.getAddress(), true)).wait()
    console.log('  ASC and CreditLine registered')

    // 4. Protocol table, from the same source of truth the worker uses.
    console.log('\nRegistering protocols')
    for (const protocol of PROTOCOLS) {
        await (await asc.registerSource(protocol.id, protocol.name, protocol.pool, protocol.chainKey)).wait()
        for (const kind of EVENT_KINDS) {
            const spec = protocol.events[kind]
            await (await asc.setEventSpec(protocol.id, ACTION_INDEX[kind], id(spec.signature), spec.borrowerTopic)).wait()
        }
        console.log(`  ${protocol.name} (id ${protocol.id})`)
    }

    // 5. Liquidity, so there is something to borrow.
    console.log('\nSeeding the vault')
    await (await usd.mint(account.address, VAULT_SEED)).wait()
    await (await usd.approve(await line.getAddress(), VAULT_SEED)).wait()
    await (await line.deposit(VAULT_SEED, account.address)).wait()
    console.log(`  ${VAULT_SEED / 1_000_000n} tUSD supplied`)

    // 6. Real mainnet proofs, replayed onto the local chain. These give the dashboard real
    //    addresses with real proved history to display.
    console.log('\nSubmitting real proofs from test/fixtures')
    const borrowers: string[] = []
    for (const file of globSync('test/fixtures/*.json')) {
        const f = JSON.parse(readFileSync(file, 'utf8'))
        try {
            const tx = await asc.submit(
                f.protocolId,
                f.action,
                f.chainKey,
                f.blockHeight,
                f.txBytes,
                f.merkleRoot,
                f.siblings.map((s: { hash: string; isLeft: boolean }) => [s.hash, s.isLeft]),
                f.lowerEndpointDigest,
                f.continuityRoots
            )
            await tx.wait()
            const score = await registry.scoreOf(f.expectedBorrower)
            borrowers.push(f.expectedBorrower)
            console.log(`  ${f.protocolName.padEnd(12)} ${f.expectedBorrower}  score ${score}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.log(`  ${f.protocolName.padEnd(12)} failed: ${message.slice(0, 100)}`)
        }
    }

    // 7. Give the dev account a borrowable score.
    //     Local only, and deliberately synthetic: the fixtures prove one repayment each, which is
    //     nowhere near the 500 the credit line opens at. Without this there is no way to exercise
    //     borrow, repay, earn or withdraw against a local chain.
    console.log('\nBuilding a borrowable history for the dev account (local only)')
    await (await registry.setReporter(account.address, true)).wait()
    const GAP = 7201n // the registry's spam guard: repayments must be ~a day apart to count
    let sourceBlock = 20_000_000n
    for (let i = 0; i < 8; i++) {
        await (await registry.recordRepayment(account.address, 0, sourceBlock)).wait()
        sourceBlock += GAP
    }
    await (await registry.setReporter(account.address, false)).wait()
    const devScore = await registry.scoreOf(account.address)
    const devLimit = await line.creditLimit(account.address)
    console.log(`  ${account.address}  score ${devScore}  limit ${devLimit / 1_000_000n} tUSD`)

    // 8. Point the dashboard at all of it.
    const env = [
        `NEXT_PUBLIC_CREDITCOIN_RPC_URL=${RPC}`,
        'NEXT_PUBLIC_CREDITCOIN_EXPLORER=',
        `NEXT_PUBLIC_CREDIT_REGISTRY_ADDRESS=${await registry.getAddress()}`,
        `NEXT_PUBLIC_LENDING_HISTORY_ASC_ADDRESS=${await asc.getAddress()}`,
        `NEXT_PUBLIC_CREDIT_LINE_ADDRESS=${await line.getAddress()}`,
        '',
    ].join('\n')
    writeFileSync(new URL('../web/.env.local', import.meta.url), env)

    console.log('\nWrote web/.env.local\n')
    console.log('Next:')
    console.log('  cd web && pnpm dev')
    console.log(`  proved history:  ${borrowers[0] ?? '(none)'}`)
    console.log(`  borrowable:      ${account.address}`)
    console.log(`\nImport this key into your wallet for local testing:\n  ${DEV_KEY}`)
}

main().catch((e) => {
    console.error(`\n${e.message ?? e}`)
    process.exit(1)
})
