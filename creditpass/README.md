# CreditPass

**Under-collateralised lending on Creditcoin, priced by a credit history that is proved rather than reported.**

Submission for BUIDL CTC 2026 Fall — DeFi track. Built on the [Attestcoin Protocol](https://docs.attestcoin.org/).

---

## The problem

DeFi lending is over-collateralised, so it only serves people who already have capital. The missing
ingredient is reputation: a lender cannot know whether a borrower has ever repaid anything, because
that history lives on another chain and any off-chain claim about it has to be trusted.

## What CreditPass does

CreditPass reads a wallet's real borrowing history from **Aave V3, Spark and Morpho Blue** on
Ethereum, verifies it cryptographically on Creditcoin through the Attestcoin Protocol, and turns it
into a non-transferable on-chain credit score. That score sets how much the wallet can borrow
**without posting collateral**, out of an ERC4626 vault funded by ordinary depositors who earn the
interest borrowers pay.

The score is a public primitive: any contract on Creditcoin can read `CreditRegistry.scoreOf(address)`.
CreditPass ships one consumer of it, but the registry is the product.

## Why this needs the Attestcoin Protocol

Remove Attestcoin and there is no project left. "This wallet repaid eleven Aave loans and was never
liquidated" is, without attestation, a claim from somebody's API — and a lending protocol that
extends unsecured credit on an unverifiable claim is just a faucet with extra steps.

The Attestcoin Protocol replaces that trust with proof. An independent, staked attestor set confirms
Ethereum block headers on Creditcoin; the ASC then verifies Merkle inclusion and continuity for a
specific transaction **inside the contract**, synchronously, via the block-prover precompile. Nobody
is trusted, including us: the worker that submits proofs is untrusted infrastructure and cannot
fabricate history, because a proof either verifies against attested state or it does not.

Integration depth, concretely:

| Attestcoin surface | Where |
| --- | --- |
| `ASCBase` readability base, proof verification + query dedupe | `LendingHistoryASC` |
| `INativeQueryVerifier` block-prover precompile (`0xFD2`) | via `ASCBase.execute` |
| `EvmV1Decoder` — transaction type, receipt status, log selection by event signature | `LendingHistoryASC._borrowerFrom` |
| `PrecompileChainInfoProvider` — attested height tracking | `worker/index.ts` |
| `ProofBuilder` — attestation wait + proof generation | `worker/index.ts` |
| Source-chain event design (canonical emitter binding, per-protocol topic indexing) | `LendingHistoryASC` decoders |

## Architecture

```
Ethereum mainnet                    off-chain (untrusted)              Creditcoin
─────────────────                   ──────────────────────             ──────────────────────
Aave V3 / Spark / Morpho            worker/index.ts                    LendingHistoryASC  (ASC)
  Repay          ──── logs ───▶       scan every protocol                verify proof (precompile)
  Liquidation                         wait for attestation               dedupe by queryId
  Borrow                              fetch proof  ────────────────▶     decode receipt + logs
                                                                        emitter == that pool
                                                                        topic index per protocol
                                                                              │
                                                                              ▼
                                                                        CreditRegistry
                                                                          score 0..1000
                                                                          protocol bitmask
                                                                              │
                                                                              ▼
                                                                        CreditLine (ERC4626)
                                                                          depositors supply, earn
                                                                          borrow with no collateral
                                                                          default ──▶ score penalty
                                                                                  └▶ depositor loss
```

The loop closes: a default on Creditcoin writes back into the same registry that the Ethereum
history feeds, so the score is one reputation across both chains.

## Contracts

| Contract | Role |
| --- | --- |
| `CreditRegistry.sol` | The primitive. One non-transferable profile per address; scores 0–1000, plus a bitmask of which protocols contributed. Only registered reporters may write. |
| `LendingHistoryASC.sol` | The ASC. Verifies an Attestcoin proof and records the entry. Protocols are **configuration, not code**: pool address, event signature and borrower topic index are stored per protocol id. |
| `CreditLine.sol` | ERC4626 vault. Depositors supply and earn; borrowers draw against their score with no collateral; defaults are written off against depositors. |
| `ShareMarket.sol` | Escrowed order book for vault shares, with whole and partial fills at the listed per-share price. Exists because `maxWithdraw` is capped by liquidity: a depositor whose capital is out on loan sells the position instead of waiting. |
| `TestUSD.sol` | Testnet-only mintable stablecoin stand-in. |

### Protocols

| id | Protocol | Repay | Liquidation | Borrow |
| --- | --- | --- | --- | --- |
| 0 | Aave V3 | topic 2 | topic 3 | topic 2 |
| 1 | Spark | topic 2 | topic 3 | topic 2 |
| 2 | Morpho Blue | topic 3 | topic 3 | topic 2 |

All nine signatures are verified against live mainnet logs by `npm run check:sigs`. Morpho puts the
borrower one topic further along than the Aave forks do — which is exactly why the topic index is
data rather than a constant, and why adding a protocol is a transaction rather than a redeploy.

**Compound V3 is deliberately absent.** Repaying in Comet is a `Supply` of the base asset,
indistinguishable from an ordinary supply without reading debt state. Guessing there would mint
credit history for people who never borrowed.

### The vault

Depositors mint ERC4626 shares. `totalAssets()` is idle cash plus principal out on loan, so:

- interest lands when a borrower repays, stepping the share price up;
- a default writes the principal off, stepping it down — depositors carry the credit risk, which is
  the honest arrangement when there is no collateral to seize;
- `maxWithdraw` is capped by available liquidity, so "your money is lent out" is shown as a limit
  rather than delivered as a failed transaction.

Supply APR is the borrow rate scaled by utilisation. Idle cash earns nothing, so an empty pool
truthfully pays zero.

### Scoring

Transparent and fully on-chain — no model, no oracle, no off-chain computation:

```
base                300
+ repayments        25 each, capped at 20 counted   (max +500)
+ history age       10 per ~30 days of span         (max +100)
- liquidations      150 each
- defaults          300 each
clamped to [0, 1000]
```

Counts, not amounts. Summing raw token amounts across reserves with different decimals and prices
would need a price feed — and importing a centralised price oracle into a project whose entire pitch
is "no centralised oracle" is not a trade worth making.

Two design points worth naming:

- **Spam guard.** Repayments closer together than ~1 day of Ethereum blocks count once. Without it,
  a wallet farms a perfect score with twenty micro-loans in an afternoon.
- **Asymmetry.** Liquidations and defaults are never rate-limited. Bad news always counts.

### Security

- **Canonical emitter binding.** A log is only accepted if it was emitted by that protocol's real
  pool. Anyone can deploy a contract that emits a perfectly-shaped `Repay` event naming someone else.
- **Source chain pinning.** `submit()` rejects proofs whose chain key is not the one registered for
  that protocol. `ASCBase` forwards neither `chainKey` nor `blockHeight` to the handler, so
  `submit()` stashes both plus the protocol id and re-enters through `this.execute(...)`; calling
  `execute` directly finds an empty context and reverts.
- **Receipt status.** A reverted transaction is still included in a block and its proof still
  verifies. Without checking `receiptStatus == 1`, a failed repayment would count as a good one.
- **Replay.** Handled by `ASCBase`'s query-id dedupe — one source transaction, one credit entry.
- **Permissionless submission.** Anyone may submit a proof for anyone, and anyone may call
  `markDefault` on an overdue loan. Authority comes from the proof, not the sender.

## Layout

```
contracts/                    Solidity — registry, ASC, ERC4626 credit line
test/                         Foundry tests (54)
test/fixtures/                real mainnet proofs, replayed through the real decoder
test/mocks/                   stand-in for the 0xFD2 precompile
worker/protocols.ts           The protocol table — one source of truth
worker/index.ts               Off-chain readability worker, all protocols
worker/check-sigs.ts          Verifies every signature against live mainnet logs
script/Deploy.s.sol           Deployment + reporter wiring
script/register-protocols.ts  Writes the protocol table on-chain
script/local.ts               Whole stack on a local Anvil chain, no funds needed
script/make-fixtures.ts       Captures real proofs for the tests
script/check-abi.ts           Dashboard ABIs vs compiled contracts
web/                          Next.js landing page + dashboard
```

### Pages

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/app` | Passport — score, profile, attested history across protocols |
| `/app/borrow` | Credit line, borrow and repay |
| `/app/earn` | Supply APR, utilisation, deposit |
| `/app/directory` | Every passport in the registry — discovery, not just lookup |
| `/app/withdraw` | Redeem shares, with the liquidity cap shown up front |
| `/app/swap` | Secondary market for vault shares, laid out as a swap: TradingView chart of redemption value and trades on the left, "you pay / you receive" on the right |
| `GET /api/score/<address>` | The score as JSON. No key, no signup |

## Getting started

### 0. Prerequisites

| Tool | Why | Check |
| --- | --- | --- |
| Node 20+ | worker, scripts, dashboard | `node -v` |
| pnpm | the dashboard uses it | `pnpm -v` |
| Foundry | contracts | `forge --version` |

Foundry, if you do not have it:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

You also need a Creditcoin **testnet** wallet with some CTC for gas. Everything up to step 4 works
with no wallet and no funds at all.

---

### 1. Install and configure

```bash
git clone <your-fork> creditpass && cd creditpass
npm install
cp .env.example .env
```

Open `.env`. Only one field must change before you can deploy:

```ini
CREDITCOIN_WALLET_PRIVATE_KEY=0x<your testnet key>
```

The rest have working defaults. `SOURCE_CHAIN_RPC_URL` points at a free public Ethereum RPC; if the
signature check in step 3 keeps timing out, swap it for your own Alchemy or Infura URL.

> `.env` is gitignored. Never put a key holding real value in it — this is a testnet project.

---

### 2. Build and test the contracts

No network needed. Nothing here touches a chain.

```bash
forge build
forge test        # 30 tests
```

Expect `30 passed; 0 failed`. These cover the scoring rules, the anti-farming guard, per-protocol
topic indexing, emitter binding, chain-key pinning, and the vault's deposit / borrow / repay /
withdraw / default paths.

---

### 3. Verify the event signatures against mainnet

```bash
npm run check:sigs
```

This reads live Aave V3, Spark and Morpho Blue logs from Ethereum and checks that all nine event
signatures in `worker/protocols.ts` still match, and that each log carries enough topics for the
borrower index the decoder assumes.

**Run this before every deploy.** A wrong signature string compiles fine, verifies proofs fine, and
then silently never matches a log — the failure mode looks exactly like "no history found". This
check is the only thing standing between you and that.

Occasional `??  unverified` lines are fine: they mean the event is rare and did not appear in the
scanned window, not that it is wrong. `FAIL` lines are real.

---

### 3.5 Run the whole thing locally, with no testnet funds

Before touching a real network, bring the full stack up on Anvil. The one thing a local chain cannot
have is the `0xFD2` verifier — it is a pallet-evm runtime precompile with no bytecode, so there is
nothing to fork or deploy. `anvil_setCode` puts the test mock there instead; **everything else is
the real thing**, including real mainnet proofs replayed from `test/fixtures`.

```bash
npm run anvil          # terminal 1 — anvil --chain-id 102031, matching Creditcoin testnet
npm run local          # terminal 2 — deploy, wire, register, seed, submit real proofs
cd web && pnpm dev     # terminal 3
```

`npm run local` writes `web/.env.local` for you and prints two addresses worth looking up:

- a **real Ethereum borrower** whose Aave, Spark or Morpho repayment was proved onto the local chain
- the **Anvil dev account**, given a synthetic 8-repayment history so the borrow, repay, supply and
  withdraw flows can actually be exercised. That history is local-only and deliberately synthetic —
  the fixtures prove one repayment each, nowhere near the 500 the credit line opens at.

Import the printed dev key into a wallet and every button on the dashboard works, against a real
chain, for free. This is also the fastest way to rehearse the demo.

### 4. Deploy to Creditcoin testnet

**See [DEPLOY.md](./DEPLOY.md) for the full walkthrough** — wallet, faucet, preflight, verification
and the failure paths worth testing. The short version:

```bash
npm run deploy:testnet
```

It preflights the chain, the key and the balance before spending anything, then deploys all five
contracts, wires the reporters, registers the three protocols, seeds the vault, and writes
`web/.env.local`. It prints the addresses — paste them into `.env` too, so the worker can find the
ASC:

```ini
CREDIT_REGISTRY_ADDRESS=0x…
LENDING_HISTORY_ASC_ADDRESS=0x…
CREDIT_LINE_ADDRESS=0x…
SHARE_MARKET_ADDRESS=0x…
```

---

### 5. Adding a protocol later

`npm run register:protocols` writes the table from `worker/protocols.ts` into an already-deployed
ASC — one `registerSource` plus three `setEventSpec` calls per protocol. Adding a fourth protocol is
that command, not a redeploy: add it to `protocols.ts`, run `check:sigs`, run this.

---

### 6. Prove a real history

Pick an Ethereum address that has actually borrowed and repaid on Aave, Spark or Morpho — your own,
or any active borrower you find in an explorer.

```bash
npm run worker -- 0xYourEthereumAddress --lookback 200000 --limit 5
```

What happens: the worker scans the source chain for that address's events, waits for the containing
block to be attested on Creditcoin, fetches a proof from the Proof Builder, and submits it. The
contract verifies it and writes the score.

Useful flags:

| Flag | Meaning |
| --- | --- |
| `--lookback 200000` | how many source blocks back to scan |
| `--limit 5` | how many proofs to submit this run |
| `--protocol 2` | only one protocol (0 Aave, 1 Spark, 2 Morpho) |

Re-running is safe. A transaction already proved is rejected on-chain by the query-id dedupe, and
the worker logs it rather than crashing.

---

### 7. Run the dashboard

```bash
cd web
pnpm install
cp .env.local.example .env.local
```

Fill `.env.local` with the same addresses, prefixed for the browser:

```ini
NEXT_PUBLIC_CREDIT_REGISTRY_ADDRESS=0x…
NEXT_PUBLIC_LENDING_HISTORY_ASC_ADDRESS=0x…
NEXT_PUBLIC_CREDIT_LINE_ADDRESS=0x…
```

```bash
pnpm dev      # http://localhost:3000
```

Leave the addresses blank and the dashboard still runs — it renders a clearly-labelled demo profile
with the write actions disabled, so you can work on the UI before anything is deployed.

To build for production:

```bash
pnpm build && pnpm start
```

---

### Regenerating the proof fixtures

```bash
npm run make:fixtures         # newest Repay per protocol
npm run make:fixtures Repay Borrow Liquidation
```

Fixtures are committed so the tests run offline. Regenerate them when the protocol table changes, or
when you want the tests pinned to fresher chain data. Each one records the transaction hash and the
borrower the test asserts on, so a fixture is auditable against the explorer.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `check:sigs` times out | free RPC rate limit | use your own `SOURCE_CHAIN_RPC_URL` |
| Worker finds nothing | address has no history in the window | widen `--lookback`, or pick a busier address |
| `waitUntilHeightAttested` hangs | that block is not attested yet | recent blocks take minutes; historical ones should be instant |
| `UnknownProtocol` on submit | step 5 was skipped | `npm run register:protocols` |
| `WrongEmitter` | pool address wrong for that chain | check `worker/protocols.ts` against the explorer |
| Gas estimation warning | pallet-evm does not always surface precompile reverts | harmless, the worker falls back to a size-based limit |
| `check:abi` reports DRIFT | a contract changed, the dashboard did not | update the ABI string it names in `web/src/lib/creditpass.ts` |
| Fixture test fails after a contract change | the event or decoder path moved | re-read the failure; the fixtures are real chain data and do not go stale on their own |
| Dashboard shows the demo banner | `NEXT_PUBLIC_*` addresses unset | fill `web/.env.local`, restart `pnpm dev` |
| `npm run local` says "no chain" | Anvil is not running | `npm run anvil` in another terminal |
| `anvil_setCode did not take` | the RPC is not Anvil | point `LOCAL_RPC_URL` at an Anvil instance |
| Local borrow button disabled | wallet is not the dev account | import the key `npm run local` prints |

### Environments

Creditcoin **testnet** can read Ethereum **mainnet** as chain key `3` (Sepolia is chain key `1`).
That is what makes the demo real: the deployment is a testnet deployment, but the credit history
being scored is genuine mainnet borrowing history from genuine wallets.

## Status and honest limits

- **`check:sigs` passes** against live mainnet logs for all three protocols — nine signatures, each
  carrying the four topics the decoders assume.
- **54 Foundry tests pass** across four suites. The unit suite covers scoring, the spam guard,
  per-protocol topic indexing, emitter binding, chain-key pinning, and the vault's deposit / borrow /
  repay / withdraw / default paths.
- **The decoder has been run against real Ethereum transactions.** `test/RealProof.t.sol` replays
  genuine Aave V3, Spark and Morpho Blue mainnet transactions, with genuine proofs fetched from the
  live Proof Builder, through the real `EvmV1Decoder` — RLP receipt decoding, log selection, emitter
  binding, topic indexing, and the query-id dedupe. Only the `0xFD2` precompile is mocked, because it
  is a pallet-evm runtime precompile with no bytecode and so cannot be forked or deployed locally.
  Everything downstream of the cryptographic check is exercised for real.
- **Dashboard ABIs are checked against the contracts** by `npm run check:abi`, so a renamed function
  fails the build rather than the first on-chain read.
- **Historical attestation is confirmed, and it goes deep.** This was the project's biggest open
  risk: if Ethereum were only attested near the tip, "years of borrowing history" would not exist.
  It does. Measured against the live testnet proof builder (`npm run check:attestation`):

  | Source block | Age | Result |
  | --- | --- | --- |
  | 25,883,406 | 1 day | proof in ~2s |
  | 25,702,887 | ~1 month | proof in ~3s |
  | 24,902,888 | ~4 months | proof in ~6s |
  | 23,402,899 | ~10 months | proof in 15s |
  | 20,900,000 | ~20 months | proof in 15s |
  | 18,500,000 | ~2.5 years | proof in 10s |
  | 16,600,000 | ~3.2 years | proof in 14s |

  Creditcoin testnet reports Ethereum mainnet attested to height 25,902,840 — effectively the chain
  tip — and the builder serves proofs all the way back to the Aave V3 launch era.

  One trap found doing this: the SDK's `ProofBuilder` defaults to a **10 second** HTTP timeout, and
  deep history takes ~15s to assemble. The failure surfaces as "not yet attested", which points at
  exactly the wrong cause. The worker now passes 60s explicitly.

- **Deployed, and the precompile accepts our proofs.** This was the last unknown a mock could not
  answer. On Creditcoin testnet (chain 102031):

  | Contract | Address |
  | --- | --- |
  | CreditRegistry | [`0x6d4d017d…D9Ea`](https://creditcoin-testnet.blockscout.com/address/0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea) |
  | LendingHistoryASC | [`0xD04A92C8…33E6`](https://creditcoin-testnet.blockscout.com/address/0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6) |
  | CreditLine | [`0x970C3114…2185`](https://creditcoin-testnet.blockscout.com/address/0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185) |
  | ShareMarket | [`0x9833C746…fE1e`](https://creditcoin-testnet.blockscout.com/address/0x9833C746a7ef59BbA70bDb27073d04ED8B9EfE1e) |
  | TestUSD | [`0x44b99f76…876D`](https://creditcoin-testnet.blockscout.com/address/0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D) |

  Three real Ethereum mainnet repayments proved through the live block-prover precompile — one per
  protocol, each writing a credit profile:

  | Protocol | Source block | Borrower | Gas |
  | --- | --- | --- | --- |
  | Aave V3 | 25,903,010 | `0x3078a7B4…46f7` | 313,614 |
  | Spark | 25,903,010 | `0x3B7E7B3A…5752` | 313,614 |
  | Morpho Blue | 25,903,012 | `0x8297492D…1070` | 340,942 |

  And the guards were watched refusing things, not just asserted: resubmitting a proof reverts on the
  query-id dedupe, and an Aave transaction submitted under Morpho's protocol id reverts on the
  emitter check. Both left no logs and no state.
- **The frontend is not wired to a chain yet.** With the contract addresses unset it renders a
  clearly-labelled demo, and the ABIs in `web/src/lib/creditpass.ts` are hand-written from the
  contracts — a mismatch would only surface on first deploy.
- **No collateral, by design — and by necessity.** Attestcoin readability cannot seize an asset on
  Ethereum, and Ethereum cannot read Creditcoin, so cross-chain collateral is not enforceable today.
  Calling a locked balance "collateral" would be a lie. Enforcement here is reputational, which is
  how real-world credit works: nobody repossesses your house over a late card payment, your score
  takes the hit.
- **Partial fills have no minimum size.** A buyer can take one raw unit of an offer, which costs
  the seller a rounding of at most one unit in their favour and could be used to spam
  `PartiallyFilled` events. Add a minimum fill if the book ever gets busy enough for that to matter.
- **Interest is not accrued into `totalAssets` until repayment.** The share price steps up when a
  loan is repaid rather than drifting up per block, so a depositor who joins just before a large
  repayment captures interest they did not fund. A per-block index fixes it when that is worth
  defending against.

## Ecosystem integration

Built in rather than linked out — an outbound link is not a feature:

| Feature | Ecosystem equivalent | What it does |
| --- | --- | --- |
| **Passport directory** (`/app/directory`) | PenguinBase's discovery hub | Lists every address the registry has scored, read from its own events. Without it you must already know an address, which rather undermines "the score is public" |
| **Proof provenance** (expand any history row) | a block explorer, for our own data | Names the source chain, block, emitting pool, query id and Creditcoin proof transaction — with the source block linked to Etherscan so the original borrowing can be read at first hand |
| **Public score API** (`/api/score/<address>`) | Credal's on-chain credit API | Contracts read the registry with `scoreOf()`; everything off-chain reads it here. A primitive nobody can call is just an application |
| **Test asset faucet** | a faucet, not a swap | TestUSD mints freely, so the supply and repay buttons can actually be pressed |
| **Share market** (`/app/swap`) | PenguinSwap, but for something only this app has | A secondary market for vault shares with a swap's shape: **you pay / you receive**, a flip, and a TradingView candlestick chart (`lightweight-charts`). Each candle is honest OHLC over its window of everything the share was worth — the vault's redemption value at sampled blocks plus any price a buyer actually paid — so a flat vault draws flat candles and a trade below NAV draws a real wick. Up/down is emerald against orange-red, validated for colour-blindness in both modes; the classic green/red pair collapses under deuteranopia, and a candle's whole message is which of the two it is. Underneath it is an escrowed order book, not an AMM — the vault already reports NAV exactly, so offers priced against it need no curve, no liquidity providers and no oracle. "You pay X" plans across the cheapest listed offers and fills the last one partially, so X means exactly X. It shows the pool's credit quality — utilisation, eligible borrowers, average borrower score — because a share is a claim on uncollateralised loans, and those borrowers are only assessable at all because their records were proved through Attestcoin |

Wired in:

| What | Where | Why |
| --- | --- | --- |
| **Blockscout** (`creditcoin-testnet.blockscout.com`) | every contract address and every proof transaction in the dashboard | the whole claim is "check it yourself" — the addresses have to be one click away |
| **EIP-6963 wallet discovery** | `web/src/lib/wallet.ts` | Credit Wallet is a mobile app with an in-app browser, not a desktop extension, so assuming a single `window.ethereum` is wrong. Announced providers cover extensions, in-app browsers, and several wallets at once, with a legacy fallback |
| **Network switching** | `ensureCreditcoinNetwork` | without it a borrow or deposit is signed on whatever chain the wallet happened to be on. Adds Creditcoin testnet (chainId 102031) if the wallet does not know it |
| **PenguinSwap / PenguinBase / Credit Wallet** | dashboard footer bar and site footer | where to get CTC for gas, a wallet to hold it, and where the dApp will be listed |

Deliberately **not** wired in:

- **PenguinBridge.** This project exists to show a bridge is not needed for cross-chain reads.
  Linking one would undercut the argument.
- **A swap of our own.** PenguinSwap is the ecosystem's official DEX. Building a competing one
  inside a hackathon run by that ecosystem is a poor trade, and it would add no Attestcoin depth.
- **PenguinSwap as a liquidation venue.** The right integration, but it needs Attestcoin
  writability first — there is nothing to liquidate until enforcement can reach the source chain.
- **Credal.** Gluwa's on-chain credit API records real-world loans; CreditPass reads on-chain loans
  from other chains. Opposite directions, one borrower, one reputation. Access is through an API and
  a partnership rather than a permissionless contract call, so it stays a roadmap item — but
  `CreditRegistry.setReporter()` already separates who may write from how the score is computed, so
  a Credal adapter plugs in as a second reporter with no change to `CreditLine`.

## Roadmap

1. End-to-end proof on Creditcoin testnet, mainnet history.
2. More sources — the table in `worker/protocols.ts` plus one transaction each. Other chains once
   Attestcoin attests them.
3. Registry adopted by other Creditcoin dApps as a shared primitive.
4. Credal adapter — real-world credit history alongside DeFi history, one score across both.
5. PenguinBase listing, then mainnet.
4. When Attestcoin **writability** ships: real cross-chain collateral, enforceable liquidation, and
   with it a genuine cross-chain money market. The enforcement layer is kept separate from the
   scoring layer so it can be dropped in without touching the score.
