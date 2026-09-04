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
test/                         Foundry tests (30)
worker/protocols.ts           The protocol table — one source of truth
worker/index.ts               Off-chain readability worker, all protocols
worker/check-sigs.ts          Verifies every signature against live mainnet logs
script/Deploy.s.sol           Deployment + reporter wiring
script/register-protocols.ts  Writes the protocol table on-chain
web/                          Next.js landing page + dashboard
```

### Pages

| Route | What it does |
| --- | --- |
| `/` | Landing page |
| `/app` | Passport — score, profile, attested history across protocols |
| `/app/borrow` | Credit line, borrow and repay |
| `/app/earn` | Supply APR, utilisation, deposit |
| `/app/withdraw` | Redeem shares, with the liquidity cap shown up front |

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

### 4. Deploy to Creditcoin testnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url $CREDITCOIN_RPC_URL --broadcast \
  --private-key $CREDITCOIN_WALLET_PRIVATE_KEY
```

It prints four addresses. Paste them into `.env`:

```ini
CREDIT_REGISTRY_ADDRESS=0x…
LENDING_HISTORY_ASC_ADDRESS=0x…
CREDIT_LINE_ADDRESS=0x…
```

The script also seeds the vault with test liquidity, so there is something to borrow.

---

### 5. Register the protocols on-chain

```bash
npm run register:protocols
```

This writes the table from `worker/protocols.ts` into the ASC — one `registerSource` plus three
`setEventSpec` calls per protocol. Until you run it, every proof is rejected with `UnknownProtocol`.

This is also how you add a fourth protocol later: add it to `protocols.ts`, run `check:sigs`, run
this again. No redeploy.

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

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `check:sigs` times out | free RPC rate limit | use your own `SOURCE_CHAIN_RPC_URL` |
| Worker finds nothing | address has no history in the window | widen `--lookback`, or pick a busier address |
| `waitUntilHeightAttested` hangs | that block is not attested yet | recent blocks take minutes; historical ones should be instant |
| `UnknownProtocol` on submit | step 5 was skipped | `npm run register:protocols` |
| `WrongEmitter` | pool address wrong for that chain | check `worker/protocols.ts` against the explorer |
| Gas estimation warning | pallet-evm does not always surface precompile reverts | harmless, the worker falls back to a size-based limit |
| Dashboard shows the demo banner | `NEXT_PUBLIC_*` addresses unset | fill `web/.env.local`, restart `pnpm dev` |

### Environments

Creditcoin **testnet** can read Ethereum **mainnet** as chain key `3` (Sepolia is chain key `1`).
That is what makes the demo real: the deployment is a testnet deployment, but the credit history
being scored is genuine mainnet borrowing history from genuine wallets.

## Status and honest limits

- **`check:sigs` passes** against live mainnet logs for all three protocols — nine signatures, each
  carrying the four topics the decoders assume.
- **30 Foundry tests pass**, covering scoring, the spam guard, per-protocol topic indexing, emitter
  binding, chain-key pinning, and the vault's deposit / borrow / repay / withdraw / default paths.
- **Not yet verified end-to-end on Creditcoin testnet.** The open question is whether historical
  mainnet blocks are attested far enough back for the proof builder to serve proofs for them. If
  attestation only covers recent blocks, the scan window collapses to whatever is attested. This is
  the first thing to test, before anything else gets built on top.
- **The frontend is not wired to a chain yet.** With the contract addresses unset it renders a
  clearly-labelled demo, and the ABIs in `web/src/lib/creditpass.ts` are hand-written from the
  contracts — a mismatch would only surface on first deploy.
- **No collateral, by design — and by necessity.** Attestcoin readability cannot seize an asset on
  Ethereum, and Ethereum cannot read Creditcoin, so cross-chain collateral is not enforceable today.
  Calling a locked balance "collateral" would be a lie. Enforcement here is reputational, which is
  how real-world credit works: nobody repossesses your house over a late card payment, your score
  takes the hit.
- **Interest is not accrued into `totalAssets` until repayment.** The share price steps up when a
  loan is repaid rather than drifting up per block, so a depositor who joins just before a large
  repayment captures interest they did not fund. A per-block index fixes it when that is worth
  defending against.

## Roadmap

1. End-to-end proof on Creditcoin testnet, mainnet history.
2. More sources — the table in `worker/protocols.ts` plus one transaction each. Other chains once
   Attestcoin attests them.
3. Registry adopted by other Creditcoin dApps as a shared primitive.
4. When Attestcoin **writability** ships: real cross-chain collateral, enforceable liquidation, and
   with it a genuine cross-chain money market. The enforcement layer is kept separate from the
   scoring layer so it can be dropped in without touching the score.
