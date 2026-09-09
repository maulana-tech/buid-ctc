# CreditPass

**Under-collateralised lending on Creditcoin, priced by a credit history that is proved rather than reported.**

A wallet's real borrowing record on Ethereum — Aave V3, Spark, Morpho Blue — is verified on Creditcoin
through the Attestcoin Protocol and turned into a non-transferable credit score. That score sets how
much the wallet can borrow **with no collateral**, from an ERC4626 vault funded by depositors who earn
the interest.

| | |
| --- | --- |
| **Hackathon** | BUIDL CTC 2026 Fall — **DeFi track** |
| **Network** | Creditcoin testnet (chain 102031), reading Ethereum mainnet (chain key 3) |
| **Repository** | https://github.com/maulana-tech/buid-ctc |
| **Contracts** | [CreditRegistry](https://creditcoin-testnet.blockscout.com/address/0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea) · [LendingHistoryASC](https://creditcoin-testnet.blockscout.com/address/0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6) · [CreditLine](https://creditcoin-testnet.blockscout.com/address/0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185) · [ShareMarket](https://creditcoin-testnet.blockscout.com/address/0x9833C746a7ef59BbA70bDb27073d04ED8B9EfE1e) · [TestUSD](https://creditcoin-testnet.blockscout.com/address/0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D) |
| **Demo video** | _to be added_ |
| **Deck** | _to be added_ |
| **Run it locally** | `npm run anvil` · `npm run local` · `cd web && pnpm dev` — no testnet funds needed |
| **License** | MIT |

## In one minute

- **It is deployed and it works.** Three real Ethereum mainnet repayments — one each on Aave V3,
  Spark and Morpho Blue — were verified by Creditcoin's live block-prover precompile and written as
  credit profiles. Every guard was watched refusing bad input on-chain, not just asserted in tests.
- **The score is a public primitive.** Any contract on Creditcoin can call `scoreOf(address)`;
  anything off-chain can `GET /api/score/<address>`. CreditPass ships one consumer of it — the
  lending vault — but the registry is the product.
- **Protocols are configuration.** Adding a lending protocol is a transaction, not a redeploy.
- **Nothing here is taken on trust**, including us: the worker that submits proofs is untrusted
  infrastructure and cannot fabricate history.
- **54 Foundry tests**, including real mainnet transactions replayed through the real decoder;
  nine event signatures verified against live mainnet logs; dashboard ABIs checked against the
  compiled contracts on every build.

---

## The problem

DeFi lending is over-collateralised, so it only serves people who already have capital. The missing
ingredient is reputation. A lender on Creditcoin cannot know whether a borrower has ever repaid
anything, because that history lives on another chain — and any off-chain claim about it has to be
trusted.

## What CreditPass does

1. An off-chain worker finds a wallet's borrow, repay and liquidation events on Aave V3, Spark and
   Morpho Blue. It is untrusted; it only chooses what to present.
2. The Attestcoin Protocol proves each transaction on Creditcoin: Merkle inclusion and continuity are
   verified **inside the contract**, synchronously, in one block.
3. `CreditRegistry` turns the proved entries into a score from 0 to 1000, bound to the address.
4. `CreditLine`, an ERC4626 vault, lends against that score with no collateral. Depositors earn the
   interest; a default is written off against them.
5. `ShareMarket` lets a depositor whose capital is out on loan sell the position instead of waiting.

---

## Attestcoin Protocol integration

_This section is the "Attestcoin Protocol Integration Summary" for the submission form._

**Remove Attestcoin and there is no project left.** "This wallet repaid eleven Aave loans and was
never liquidated" is, without attestation, a claim from somebody's API — and unsecured credit
extended on an unverifiable claim is a faucet with extra steps. The protocol replaces that trust with
proof: a staked attestor set confirms Ethereum block headers on Creditcoin, and the Attestcoin Smart
Contract verifies a specific transaction against them via the native block-prover precompile.

### Surfaces used

| Attestcoin surface | Where | What for |
| --- | --- | --- |
| `ASCBase` (readability base) | `LendingHistoryASC` | proof verification via `execute`, query-id dedupe |
| `INativeQueryVerifier` precompile at `0xFD2` | via `ASCBase` | Merkle inclusion + continuity, synchronous |
| `EvmV1Decoder` | `LendingHistoryASC._borrowerFrom` | transaction type, receipt status, log selection by signature |
| `PrecompileChainInfoProvider` | `worker/`, `script/` | latest attested height per chain key |
| `ProofBuilder` (USC SDK) | `worker/index.ts`, `script/prove.ts` | wait for attestation, fetch proof |
| Source-chain event design | `worker/protocols.ts` → on-chain `EventSpec` | canonical emitter, per-protocol borrower topic index |

### What the ASC enforces

| Check | Why it exists |
| --- | --- |
| **Canonical emitter** — the log must come from that protocol's real pool | anyone can deploy a contract that emits a perfect `Repay` event naming someone else |
| **Chain key pinned per protocol** | a proof from another attested chain, where the attacker controls the emitting address, must not pass the emitter check |
| **Receipt status == 1** | a reverted transaction is still in the block and its proof still verifies; a failed repayment must not count |
| **Query-id dedupe** (`ASCBase`) | one source transaction, one credit entry, forever |
| **`submit()` re-enters `execute()` with context** | `ASCBase` forwards neither `chainKey` nor `blockHeight` to the handler; `submit` stashes both plus the protocol id, and a direct `execute` call reverts on empty context |

### Depth

- **Three protocols, nine event shapes**, stored on-chain as data. Morpho carries the borrower in
  topic 3 where the Aave forks use topic 2 — the reason the index is configuration, not a constant.
- **Historical attestation measured**, not assumed: proofs served for Ethereum blocks back to
  16,600,000 (the Aave V3 launch era, ~3.2 years) in 10–15 seconds each.
- **The decoder was tested on real chain data**: `test/RealProof.t.sol` replays genuine mainnet
  transactions with genuine proofs through the real `EvmV1Decoder`. Only the `0xFD2` precompile is
  mocked, because it is a pallet-evm runtime precompile with no bytecode.
- **Then the real precompile was used.** See *Deployment* below.

### Architecture

```
Ethereum mainnet                    off-chain (untrusted)              Creditcoin testnet
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
                                                                        CreditLine (ERC4626)   ◀──▶  ShareMarket
                                                                          depositors supply, earn        exit while
                                                                          borrow with no collateral      capital is lent
                                                                          default ──▶ score penalty
                                                                                  └▶ depositor loss
```

A default on Creditcoin writes back into the same registry the Ethereum history feeds, so the score
is one reputation across both chains.

---

## Deployment

Creditcoin testnet, chain 102031. Deployed with `npm run deploy:testnet`.

| Contract | Address |
| --- | --- |
| CreditRegistry | [`0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea`](https://creditcoin-testnet.blockscout.com/address/0x6d4d017dE8d0A36dce7856Ee989624C6A18cD9Ea) |
| LendingHistoryASC | [`0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6`](https://creditcoin-testnet.blockscout.com/address/0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6) |
| CreditLine (vault, `cpUSD`) | [`0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185`](https://creditcoin-testnet.blockscout.com/address/0x970C3114C5Dcf853692bc8D3e0598d1AC9D12185) |
| ShareMarket | [`0x9833C746a7ef59BbA70bDb27073d04ED8B9EfE1e`](https://creditcoin-testnet.blockscout.com/address/0x9833C746a7ef59BbA70bDb27073d04ED8B9EfE1e) |
| TestUSD (`tUSD`) | [`0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D`](https://creditcoin-testnet.blockscout.com/address/0x44b99f76f12e0Ece22f6bD76DcB305Afcf25876D) |

**Proofs verified by the live block-prover precompile** — real Ethereum mainnet repayments, one per
protocol, each writing a credit profile:

| Protocol | Ethereum block | Borrower | Creditcoin tx | Gas |
| --- | --- | --- | --- | --- |
| Aave V3 | 25,903,010 | `0x3078a7B4…46f7` | [`0xac1b8a24…ade36`](https://creditcoin-testnet.blockscout.com/tx/0xac1b8a2462811a40c08178e2839c83153eddf55c909ee8e31b76960659aade36) | 313,614 |
| Spark | 25,903,010 | `0x3B7E7B3A…5752` | [`0x3792c74e…a487b`](https://creditcoin-testnet.blockscout.com/tx/0x3792c74e4f0589508293079e218977dbe8be9998d7e7fab2d8e1c1f4cdca487b) | 313,614 |
| Morpho Blue | 25,903,012 | `0x8297492D…1070` | [`0xe424945f…33da2`](https://creditcoin-testnet.blockscout.com/tx/0xe424945f8f7a62d18c091ca25567797aaa0dcf093501f56cb4fec11a23233da2) | 340,942 |

**Guards observed refusing, on-chain:** resubmitting a proof reverts on the query-id dedupe; an Aave
transaction submitted under Morpho's protocol id reverts on the emitter check. Both left no logs and
no state.

**Market exercised on-chain:** two `fillPartial` trades from a second account (3,000 shares @ 0.97,
1,500 @ 0.99); the order book shrank accordingly and both prints appear on the swap chart.

---

## Product

| Route | What it does |
| --- | --- |
| `/` | Landing page. Its figures strip — passports scored, entries proved, vault size, supply APR, utilisation, open offers — is read from the deployed contracts through the same loaders the dashboard uses |
| `/app` | **Passport.** The connected wallet's score, the registry formula term by term (base, repayments, tenure, penalties), points to the next band, recent proofs, and a public link + JSON API. Any address can be looked up read-only |
| `/app/portfolio` | **Portfolio** for the connected wallet: net position, allocation across wallet / vault / market escrow, what needs attention (loan due or overdue, score below the line, capital locked in loans, offers above NAV) with a button to the right page, four summary cards, and one activity timeline merged from every contract the wallet touched |
| `/app/history` | **History.** Every transaction the wallet has proved, each row expanding to its provenance (source block on Etherscan, emitting pool, query id, Creditcoin proof tx) — and **Prove a transaction**: paste an Ethereum tx hash, the app detects the pool and event, fetches the Attestcoin proof, and your wallet submits it to the ASC. The registry's own events say whether it counted |
| `/app/borrow` | Credit line by tier, borrow and repay with interest and headroom projections, due date in days. Below the line, the page becomes the prove-a-transaction flow, with how many counted repayments are needed |
| `/app/earn` | Supply APR and where it comes from; line chart of share price / vault size / utilisation; the connected wallet's position with yield against its entry price; supply and withdraw in one card |
| `/app/withdraw` | Redeem shares, with the liquidity cap shown up front |
| `/app/swap` | Share market as a swap: TradingView candlestick chart of redemption value and trades; "you pay / you receive" plans across the cheapest listed offers with a partial fill on the last, so X means exactly X |
| `GET /api/score/<address>` | The score and history as JSON. No key, no signup |
| `POST /api/proof` `{ txHash }` | Detects the pool and event in an Ethereum transaction and returns the Attestcoin proof ready for `LendingHistoryASC.submit()`. The browser signs; the server never holds a key |

Every address and every proof transaction links to Blockscout. Wallets are discovered via EIP-6963
(Credit Wallet is a mobile app with an in-app browser, not a desktop extension), and the dashboard
switches or adds Creditcoin testnet before signing anything. Dark mode, Inter.

---

## Contracts

| Contract | Role |
| --- | --- |
| `CreditRegistry.sol` | The primitive. One non-transferable profile per address, score 0–1000, bitmask of contributing protocols. Only registered reporters may write |
| `LendingHistoryASC.sol` | The ASC. Verifies an Attestcoin proof and records the entry. Protocols are stored as data: pool, chain key, `topic0` and borrower topic index per event |
| `CreditLine.sol` | ERC4626 vault. Depositors supply and earn; borrowers draw against their score with no collateral; defaults are written off against depositors |
| `ShareMarket.sol` | Escrowed order book for vault shares, whole and partial fills at the listed per-share price |
| `TestUSD.sol` | Testnet-only mintable stablecoin stand-in |

### Protocols

| id | Protocol | Pool (Ethereum) | Repay | Liquidation | Borrow |
| --- | --- | --- | --- | --- | --- |
| 0 | Aave V3 | `0x87870Bca…4E2` | topic 2 | topic 3 | topic 2 |
| 1 | Spark | `0xC13e21B6…987` | topic 2 | topic 3 | topic 2 |
| 2 | Morpho Blue | `0xBBBBBbbB…FCb` | topic 3 | topic 3 | topic 2 |

The table lives in `worker/protocols.ts` and is written on-chain by `npm run register:protocols`.
**Compound V3 is deliberately absent:** repaying in Comet is a `Supply` of the base asset,
indistinguishable from an ordinary supply without reading debt state.

### Scoring

Fully on-chain — no model, no oracle, no off-chain computation:

```
base                300
+ repayments        25 each, capped at 20 counted   (max +500)
+ history age       10 per ~30 days of span         (max +100)
- liquidations      150 each
- defaults          300 each
clamped to [0, 1000]
```

Counts, not amounts: summing token amounts across reserves would need a price feed, and importing a
centralised oracle into a project whose pitch is "no centralised oracle" is not a trade worth making.
Repayments closer together than ~1 day count once, across all protocols — otherwise a wallet farms a
score with micro-loans in an afternoon. Liquidations and defaults are never rate-limited.

Credit limit by score: below 500 closed · 500–599 1× · 600–699 2× · 700–799 5× · 800+ 10× the base
unit. 10% simple APR per block, ~30-day term, `markDefault` is permissionless after the due block.

### The vault

`totalAssets()` = idle cash + principal out on loan. Interest lands when a loan is repaid and lifts the
share price; a default writes principal off and cuts it. Supply APR = borrow APR × utilisation, so an
idle vault truthfully pays zero. `maxWithdraw` is capped by cash on hand; the share market is the
way out when the pool is fully lent.

---

## Verification

| What | How | Result |
| --- | --- | --- |
| Contract logic | `forge test` — 4 suites | **54 passed** |
| Real chain data through the real decoder | `test/RealProof.t.sol` replays mainnet Aave / Spark / Morpho transactions with real proofs from the Proof Builder; only `0xFD2` is mocked | passed |
| Event signatures | `npm run check:sigs` against live mainnet logs | 9 / 9 match, 4 topics each |
| Dashboard ABIs vs compiled contracts | `npm run check:abi`, part of `npm run verify` | no drift |
| Attestation depth | `npm run check:attestation` | proofs served back to block 16.6M (~3.2 years) |
| Live precompile | three proofs on testnet, two guards refusing | see *Deployment* |

Attestation depth, measured against the live testnet Proof Builder:

| Source block | Age | Proof time |
| --- | --- | --- |
| 25,883,406 | 1 day | ~2s |
| 24,902,888 | ~4 months | ~6s |
| 23,402,899 | ~10 months | 15s |
| 18,500,000 | ~2.5 years | 10s |
| 16,600,000 | ~3.2 years | 14s |

A trap worth knowing: the SDK's `ProofBuilder` defaults to a 10-second HTTP timeout, and deep history
takes ~15s. The failure reads "not yet attested", which points at the wrong cause. The worker passes
60s explicitly.

---

## Running it

### Locally, with no funds — the fastest way to see everything

```bash
npm install && forge build
npm run anvil          # terminal 1: anvil --chain-id 102031
npm run local          # terminal 2: deploy, wire, register, seed, replay real proofs, list an offer
cd web && pnpm install && pnpm dev   # terminal 3
```

The one thing a local chain cannot have is the `0xFD2` verifier; `anvil_setCode` installs the test
mock there and **everything else is real**, including mainnet proofs from `test/fixtures`.
`npm run local` writes `web/.env.local`, prints a real borrower to look up, and gives the Anvil dev
account a synthetic history so borrow, repay, supply, withdraw and the market can all be exercised.

### On Creditcoin testnet

See **[DEPLOY.md](./DEPLOY.md)** — wallet, faucet, preflight, verification, the failure paths worth
testing, and troubleshooting. In short:

```bash
cp .env.example .env            # set CREDITCOIN_WALLET_PRIVATE_KEY
npm run verify                  # 54 tests + ABI check, before spending gas
npm run deploy:testnet          # preflight, deploy, wire, register, seed, write web/.env.local
npm run prove -- <txHash> <protocolId> <Repay|Liquidation|Borrow>
```

### Scripts

| Command | Does |
| --- | --- |
| `npm run verify` | `check:abi` + `forge build` + all tests |
| `npm run check:sigs` | every protocol event signature against live mainnet logs |
| `npm run check:attestation [block] [txHash]` | attested heights; probe a block; build a proof — no wallet needed |
| `npm run worker -- <address>` | scan all protocols for an address, prove, submit |
| `npm run prove -- <txHash> <id> <kind>` | prove one known transaction without scanning (free RPCs refuse wide `eth_getLogs`) |
| `npm run register:protocols` | write `worker/protocols.ts` into a deployed ASC — how a protocol is added later |
| `npm run make:fixtures` | refresh the real-proof test fixtures |

### Layout

```
contracts/         CreditRegistry, LendingHistoryASC, CreditLine, ShareMarket, TestUSD
test/              54 Foundry tests · fixtures/ real mainnet proofs · mocks/ the 0xFD2 stand-in
worker/            protocols.ts (one source of truth), index.ts, check-sigs.ts, check-attestation.ts
script/            deploy-testnet.ts, local.ts, prove.ts, register-protocols.ts, make-fixtures.ts, check-abi.ts, Deploy.s.sol
web/               Next.js — landing (/) and dashboard (/app/*: passport, portfolio, history, borrow, earn, withdraw, swap), /api/score and /api/proof, lightweight-charts, EIP-6963 wallets
DEPLOY.md          the testnet walkthrough
```

---

## Known limits

- **No collateral, by design and by necessity.** Attestcoin readability cannot seize an asset on
  Ethereum, and Ethereum cannot read Creditcoin, so cross-chain collateral is not enforceable today.
  Enforcement is reputational: a default costs 300 points and closes the line.
- **Interest reaches `totalAssets` at repayment, not per block.** The share price steps rather than
  drifts, so a depositor joining just before a large repayment captures interest they did not fund.
  A per-block index is the fix when it matters.
- **No reserve fund, no fees.** 100% of interest to depositors, 100% of default loss to depositors.
- **Partial fills have no minimum size.** One-unit fills could spam events; add a floor when the book
  is busy.
- **Yield on Earn is measured against the wallet's own deposit entry price.** Shares bought on the
  market have an entry price the vault never saw; the card says so rather than guessing.
- **Testnet asset.** `TestUSD.mint` is public on purpose. Before mainnet: real asset, remove the
  mint, audit, and revisit the two simplifications above.
- **No one on testnet can borrow yet.** The three proved addresses score 325; the line opens at 500.
  Proving ~8 time-separated repayments for one real borrower closes that loop.

## Ecosystem

| Built in | Equivalent | Note |
| --- | --- | --- |
| Borrower book on Earn | PenguinBase-style discovery | read from registry events |
| Proof provenance per row | a block explorer for our own data | source block linked to Etherscan |
| Public score API | Credal's on-chain credit API | a primitive nobody can call is just an app |
| Share market | PenguinSwap, for something only this app has | an escrowed order book, not an AMM — NAV is already exact |

Wired in: Blockscout on every address and tx; EIP-6963 wallet discovery with network switching;
links to PenguinSwap (CTC for gas), Credit Wallet and the Attestcoin docs. Deliberately not:
**PenguinBridge** (this project argues a bridge is unnecessary), an AMM (PenguinSwap exists, and it
would add no Attestcoin depth), and **Credal** for now — it is an API behind a partnership, but
`CreditRegistry.setReporter()` already lets a Credal adapter plug in as a second reporter with no
change to the vault.

## Roadmap

1. Prove a real borrower past 500 on testnet and run the full loop: borrow → repay → share price moves.
2. More sources: one row in `worker/protocols.ts` plus one transaction each; other chains once Attestcoin attests them.
3. Registry adopted by other Creditcoin dApps as a shared primitive.
4. Credal adapter — real-world credit history alongside DeFi history, one score across both.
5. Reserve fund and per-block interest index; audit; then mainnet and a PenguinBase listing.
6. When Attestcoin **writability** ships: enforceable cross-chain collateral and liquidation, with
   PenguinSwap as the venue. The enforcement layer is kept separate from the scoring layer so it can
   be dropped in without touching the score.

## Team

_Fill in: name · role · country · links._

## License

MIT
