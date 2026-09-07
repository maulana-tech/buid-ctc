# Deploying CreditPass

Testnet only. Nothing here is meant for a network holding real value.

Everything up to step 4 has already been proved locally — the decoder against real mainnet
transactions, the Proof Builder back to 2023, the whole dashboard against a live chain. What a
deployment adds is the one thing a local mock cannot answer: **does Creditcoin's own block-prover
precompile accept our proofs?**

---

## Prerequisites

| Tool | Check |
| --- | --- |
| Node 20+ | `node -v` |
| pnpm | `pnpm -v` |
| Foundry | `forge --version` |

```bash
npm install
forge build
npm run verify          # ABI check + 54 tests. Do this before spending gas.
```

---

## 1. A throwaway wallet

Make a **new** account for this. Do not use one holding anything you care about — the private key
goes into a file on disk.

Creditcoin testnet parameters, if you want to add the network by hand:

| Field | Value |
| --- | --- |
| Chain ID | `102031` |
| RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| Currency | `CTC` |
| Explorer | `https://creditcoin-testnet.blockscout.com` |

You do not have to add it manually. The dashboard calls `wallet_addEthereumChain` the first time you
connect, and refuses to sign anything until the wallet is actually on Creditcoin.

## 2. Testnet CTC

In the [Creditcoin Discord](https://discord.com/invite/creditcoin), channel **`#token-faucet`**:

```
/faucet address:0xYourEvmAddress
```

The bot replies `CTC faucet submitted`, then `CTC Faucet successful`.

You need **at least 1 CTC**. Five deployments plus reporter wiring and nine event specs, at the
network's 0.5 gwei, leaves plenty of room. See the
[faucet guide](https://docs.creditcoin.org/wallets/using-testnet-faucet).

## 3. Configure

```bash
cp .env.example .env      # if you have not already
```

Set one field:

```ini
CREDITCOIN_WALLET_PRIVATE_KEY=0x<your testnet key>
```

`.env` is gitignored. Everything else in it already has a working default.

## 4. Deploy

```bash
npm run deploy:testnet
```

It runs a preflight before spending anything: the RPC really is chain 102031, the key parses, and
the balance covers the deployment. If it does not, it prints the faucet command with your address
already in it.

Then, in one pass:

| Step | What lands on chain |
| --- | --- |
| Deploy | `CreditRegistry`, `LendingHistoryASC`, `TestUSD`, `CreditLine`, `ShareMarket` |
| Wire | Only the ASC and CreditLine may write credit profiles |
| Register | Aave V3, Spark, Morpho Blue — three sources, nine event specs |
| Seed | 1,000,000 tUSD supplied to the vault as ordinary ERC4626 shares |

Every address is printed with its Blockscout link, and `web/.env.local` is written for you.

Copy the printed addresses into `.env` as well — the worker needs `LENDING_HISTORY_ASC_ADDRESS`.

> `deploy-testnet.ts` is deliberately separate from `local.ts`. The local script installs a mock
> verifier and mints synthetic credit history: correct on Anvil, a lie on a real network. Keeping
> them apart means those steps cannot reach testnet by accident.

## 5. Prove a real history

This is the step everything else was built for.

```bash
npm run worker -- 0xAnAddressWithAaveHistory --lookback 200000 --limit 3
```

Pick an address that has actually borrowed and repaid on Aave, Spark or Morpho — your own, or any
active borrower from an explorer. The worker scans the source chain, waits for attestation, fetches
a proof, and submits it. The contract verifies it against attested Ethereum state and writes the
score.

Then read it back:

```bash
npm run check:attestation                 # how far back Ethereum is attested
curl localhost:3000/api/score/0x…         # once the dashboard is running
```

## 6. Run the dashboard

```bash
cd web
pnpm install
pnpm dev
```

`web/.env.local` was written in step 4, so the demo banner should be gone and every number should be
read from chain.

## 7. Check it yourself

The point of the project is that nothing has to be taken on trust, so verify it the way a stranger
would:

- open each contract on Blockscout from the dashboard footer;
- expand a row in **Attested history** — it names the source chain, block, the pool that emitted the
  event, the query id, and the Creditcoin transaction that carried the proof;
- follow the source block link to Etherscan and read the original borrowing;
- fetch `/api/score/<address>` and compare it with what the page shows.

---

## Testing the failure paths

A guarantee is only a claim until you watch it refuse something.

| Try | Expected |
| --- | --- |
| Re-run the worker on the same transaction | `Query already processed` |
| Register a protocol with the wrong pool address, then submit | `WrongEmitter` |
| Submit with a chain key the protocol was not registered for | `WrongSourceChain` |
| Borrow more than the score allows | `ExceedsCreditLimit` |
| Withdraw more than the vault holds in cash | capped by `maxWithdraw`, not a revert |

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `CREDITCOIN_WALLET_PRIVATE_KEY looks empty` | step 3 not done | set it in `.env` |
| `Not enough CTC for gas` | faucet not received yet | the error prints the exact faucet command |
| `Expected Creditcoin testnet (102031)` | `CREDITCOIN_RPC_URL` points elsewhere | restore the default in `.env` |
| `UnknownProtocol` on submit | deploy half-finished | re-run `npm run deploy:testnet`, or `npm run register:protocols` against the existing ASC |
| `waitUntilHeightAttested` hangs | that block is not attested yet | recent blocks take minutes; historical ones return immediately |
| Gas estimation warning | pallet-evm does not always surface precompile reverts | harmless — the worker falls back to a size-based limit |
| Dashboard still shows the demo banner | `web/.env.local` not picked up | restart `pnpm dev` |
| `check:abi` reports DRIFT | a contract changed, the dashboard did not | update the ABI string it names in `web/src/lib/creditpass.ts` |
| Fixture test fails after a contract change | the event or decoder path moved | the fixtures are real chain data and do not go stale on their own — re-read the failure |
| `npm run local` says "no chain" | Anvil is not running | `npm run anvil` in another terminal |
| `anvil_setCode did not take` | the RPC is not Anvil | point `LOCAL_RPC_URL` at an Anvil instance |
| Local borrow button disabled | wallet is not the dev account | import the key `npm run local` prints |
| Chart throws `Failed to parse color: lab(…)` | lightweight-charts only parses hex/rgb/hsl; the theme tokens are OKLCH | `web/src/lib/chart-theme.ts` rasterises tokens to hex — route new colours through `chartPalette()` |
| Earn shows `0 in · 0 out` for a wallet that deposited | `NEXT_PUBLIC_DEPLOY_BLOCK` is above the vault's first events | set it to the block *before* `CreditRegistry` was created (Blockscout: address → creation tx → block); `deploy:testnet` records it before deploying |

---

## Redeploying

Just run `npm run deploy:testnet` again. It deploys a fresh set and rewrites `web/.env.local`; the
old contracts stay on chain, ignored. There is no migration, because there is no state worth
migrating — every credit profile can be rebuilt by re-running the worker, which is rather the point
of history that lives on another chain.

## Mainnet

The Attestcoin Protocol is live on Creditcoin mainnet, so nothing here is testnet-only by design.
Before going there, at minimum: replace `TestUSD` with a real asset, remove the public `mint`, have
the contracts audited, and reconsider the two documented simplifications — interest that accrues
into `totalAssets` only at repayment, and whole-offer-only fills in `ShareMarket`.
