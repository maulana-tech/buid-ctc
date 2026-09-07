/**
 * Deploys the stack to Creditcoin testnet, wires it, and points the dashboard at it.
 *
 * Deliberately separate from `local.ts`. That script installs a mock verifier and mints synthetic
 * credit history, which is exactly right for Anvil and would be a lie on a real network. Keeping
 * them apart means the local-only steps cannot reach testnet by accident.
 *
 * Run: npm run deploy:testnet
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet, formatEther, id, parseUnits } from 'ethers'
import 'dotenv/config'

import { ACTION_INDEX, EVENT_KINDS, PROTOCOLS } from '../worker/protocols'

const EXPLORER = 'https://creditcoin-testnet.blockscout.com'
const EXPECTED_CHAIN_ID = 102031n
const LIMIT_UNIT = parseUnits('100', 6)
const VAULT_SEED = parseUnits('1000000', 6)
/** Five deployments plus wiring and nine event specs. Comfortably under a whole CTC at 0.5 gwei. */
const MIN_BALANCE_WEI = 1_000_000_000_000_000_000n // 1 CTC

function env(key: string): string {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is not set in .env`)
    return value
}

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
    console.log(`  ${' '.repeat(20)} ${EXPLORER}/address/${address}`)
    return new Contract(address, abi, wallet)
}

async function main() {
    const rpcUrl = env('CREDITCOIN_RPC_URL')
    const key = env('CREDITCOIN_WALLET_PRIVATE_KEY')
    if (key === '0x' || key.length !== 66) {
        throw new Error('CREDITCOIN_WALLET_PRIVATE_KEY looks empty or malformed in .env')
    }

    const provider = new JsonRpcProvider(rpcUrl)
    const network = await provider.getNetwork()
    if (network.chainId !== EXPECTED_CHAIN_ID) {
        throw new Error(`Expected Creditcoin testnet (${EXPECTED_CHAIN_ID}) but the RPC reports ${network.chainId}`)
    }

    const account = new Wallet(key, provider)
    const balance = await provider.getBalance(account.address)
    console.log(`Creditcoin testnet ${network.chainId}`)
    console.log(`  deployer  ${account.address}`)
    console.log(`  balance   ${formatEther(balance)} CTC\n`)

    if (balance < MIN_BALANCE_WEI) {
        throw new Error(
            `Not enough CTC for gas. Request some in the Creditcoin Discord #token-faucet channel:\n` +
                `  /faucet address:${account.address}\n`
        )
    }

    // Nonce is tracked locally: back-to-back deploys otherwise race the RPC's view of the account.
    const wallet = new NonceManager(account)

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
    const market = await deploy('ShareMarket', 'ShareMarket.sol/ShareMarket.json', wallet, [await line.getAddress()])

    console.log('\nWiring reporters')
    await (await registry.setReporter(await asc.getAddress(), true)).wait()
    await (await registry.setReporter(await line.getAddress(), true)).wait()
    console.log('  only the ASC and CreditLine may write credit profiles')

    console.log('\nRegistering protocols')
    for (const protocol of PROTOCOLS) {
        await (await asc.registerSource(protocol.id, protocol.name, protocol.pool, protocol.chainKey)).wait()
        for (const kind of EVENT_KINDS) {
            const spec = protocol.events[kind]
            await (await asc.setEventSpec(protocol.id, ACTION_INDEX[kind], id(spec.signature), spec.borrowerTopic)).wait()
        }
        console.log(`  ${protocol.name.padEnd(12)} chainKey ${protocol.chainKey}  ${protocol.pool}`)
    }

    console.log('\nSeeding the vault')
    await (await usd.mint(account.address, VAULT_SEED)).wait()
    await (await usd.approve(await line.getAddress(), VAULT_SEED)).wait()
    await (await line.deposit(VAULT_SEED, account.address)).wait()
    console.log(`  ${VAULT_SEED / 1_000_000n} tUSD supplied — ordinary ERC4626 shares, no special rights`)

    // One live offer, so the swap page opens with a book rather than an empty state.
    console.log('\nListing a share offer')
    const offerShares = parseUnits('25000', 6)
    await (await line.approve(await market.getAddress(), offerShares)).wait()
    const nav = (await line.convertToAssets(offerShares)) as bigint
    const ask = (nav * 97n) / 100n // 3% off redemption value — the price of leaving early
    await (await market.list(offerShares, ask)).wait()
    console.log(`  25,000 shares asking ${ask / 1_000_000n} tUSD against ${nav / 1_000_000n} redemption value`)

    // The dashboard scans logs from here rather than block 0 — the public RPC times out at 10s and
    // will not serve an unbounded range.
    const deployBlock = await provider.getBlockNumber()

    const addresses = {
        CREDIT_REGISTRY_ADDRESS: await registry.getAddress(),
        LENDING_HISTORY_ASC_ADDRESS: await asc.getAddress(),
        CREDIT_LINE_ADDRESS: await line.getAddress(),
        SHARE_MARKET_ADDRESS: await market.getAddress(),
        TEST_USD_ADDRESS: await usd.getAddress(),
    }

    writeFileSync(
        new URL('../web/.env.local', import.meta.url),
        [
            `NEXT_PUBLIC_CREDITCOIN_RPC_URL=${rpcUrl}`,
            `NEXT_PUBLIC_CREDITCOIN_EXPLORER=${EXPLORER}`,
            `NEXT_PUBLIC_CREDIT_REGISTRY_ADDRESS=${addresses.CREDIT_REGISTRY_ADDRESS}`,
            `NEXT_PUBLIC_LENDING_HISTORY_ASC_ADDRESS=${addresses.LENDING_HISTORY_ASC_ADDRESS}`,
            `NEXT_PUBLIC_CREDIT_LINE_ADDRESS=${addresses.CREDIT_LINE_ADDRESS}`,
            `NEXT_PUBLIC_SHARE_MARKET_ADDRESS=${addresses.SHARE_MARKET_ADDRESS}`,
            `NEXT_PUBLIC_DEPLOY_BLOCK=${deployBlock}`,
            '',
        ].join('\n')
    )

    console.log('\nAdd these to .env so the worker can find the ASC:\n')
    for (const [name, address] of Object.entries(addresses)) console.log(`${name}=${address}`)
    console.log('\nWrote web/.env.local already.')
    console.log('\nNext: npm run worker -- 0xAnAddressWithAaveHistory --lookback 200000 --limit 3')
}

main().catch((e) => {
    console.error(`\n${e.message ?? e}`)
    process.exit(1)
})
