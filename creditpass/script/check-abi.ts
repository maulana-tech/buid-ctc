/**
 * Checks the hand-written ABIs in the dashboard against the compiled contracts.
 *
 * `web/src/lib/creditpass.ts` declares its ABIs as human-readable strings so the browser bundle does
 * not have to carry Foundry artifacts. The cost of that is drift: rename a function or change an
 * argument and the dashboard keeps compiling, keeps building, and then fails at the first on-chain
 * read — long after the change that caused it. This closes that loop.
 *
 * Run: npm run check:abi
 */
import { readFileSync } from 'node:fs'
import { Fragment, Interface } from 'ethers'

import { ASC_ABI, LINE_ABI, REGISTRY_ABI } from '../web/src/lib/creditpass'

type Target = { label: string; declared: readonly string[]; artifact: string }

const TARGETS: Target[] = [
    { label: 'CreditRegistry', declared: REGISTRY_ABI, artifact: 'CreditRegistry.sol/CreditRegistry.json' },
    { label: 'CreditLine', declared: LINE_ABI, artifact: 'CreditLine.sol/CreditLine.json' },
    { label: 'LendingHistoryASC', declared: ASC_ABI, artifact: 'LendingHistoryASC.sol/LendingHistoryASC.json' },
]

function artifactSignatures(path: string): Set<string> {
    const url = new URL(`../out/${path}`, import.meta.url)
    const abi = JSON.parse(readFileSync(url, 'utf8')).abi
    const signatures = new Set<string>()
    for (const entry of abi) {
        if (entry.type !== 'function' && entry.type !== 'event') continue
        signatures.add(Fragment.from(entry).format('sighash'))
    }
    return signatures
}

function main() {
    let failures = 0

    for (const target of TARGETS) {
        const onChain = artifactSignatures(target.artifact)
        console.log(`\n${target.label}`)

        for (const declared of target.declared) {
            const fragment = Fragment.from(declared)
            const signature = fragment.format('sighash')

            if (onChain.has(signature)) {
                console.log(`  OK    ${signature}`)
            } else {
                failures++
                console.log(`  DRIFT ${signature}`)
                // Point at the likely culprit: same name, different arguments.
                const name = (fragment as unknown as { name?: string }).name
                const near = [...onChain].filter((s) => name && s.startsWith(`${name}(`))
                if (near.length > 0) console.log(`        contract has: ${near.join(', ')}`)
            }
        }
    }

    // The dashboard also assumes a plain ERC20 for the vault asset; verify against the test token.
    const token = artifactSignatures('TestUSD.sol/TestUSD.json')
    const erc20 = ['decimals()', 'symbol()', 'balanceOf(address)', 'approve(address,uint256)']
    console.log('\nAsset token (ERC20)')
    for (const signature of erc20) {
        if (token.has(signature)) console.log(`  OK    ${signature}`)
        else {
            failures++
            console.log(`  DRIFT ${signature}`)
        }
    }

    console.log()
    if (failures > 0) {
        console.error(`${failures} ABI mismatch(es) between the dashboard and the contracts.`)
        process.exit(1)
    }
    console.log('Dashboard ABIs match the compiled contracts.')
}

try {
    main()
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('Did you run `forge build` first?')
    process.exit(1)
}
