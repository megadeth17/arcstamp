# Feedback for Circle and Arc

Written while building Arcstamp against Arc mainnet on 2026-09-18, two days after public launch. Everything below was hit in practice, not read about. Where a claim comes from a live call, the call is included so it can be checked or disproved.

Ordered by how much damage it can do to a builder who does not already know.

---

## 1. A transaction priced below 20 Gwei is dropped silently

This is the one that will cost people the most time.

`maxFeePerGas` below the 20 Gwei floor does not produce an error, a revert, or a pending receipt. The transaction is accepted by the client and then never appears in a block. There is nothing to poll, nothing to look up, and no way to distinguish it from a transaction that was never sent.

Mainnet `baseFeePerGas` sits *exactly at* that floor (`0x4a817c800` = 20 Gwei), so any library default that shades a gas estimate downward, or any code that hardcodes a lower value because it is used to an L2, silently loses transactions.

Two suggestions, in order of value:

- Reject the transaction at submission with an explicit error naming the floor. A dropped transaction with no signal is the worst available failure mode.
- The floor is documented on the gas page, but that page is still labelled "current Arc Testnet configuration" that "may change before mainnet launch". Mainnet is live and matches those numbers. Please relabel; right now the only statement of the rule a builder can find is one they have been told not to trust for mainnet.

## 2. `llms.txt` tells every agent that Arc is testnet-only

`https://docs.arc.io/llms.txt` still says Arc is *"currently available on Testnet only"* and points the reader at the faucet.

This matters more than an ordinary stale line, because `llms.txt` exists specifically to be read by coding agents, and the same file instructs the reader to install Circle's `use-arc` skill first. An agent that follows those instructions in good faith builds against chain 5042002 and produces a testnet-only project — which, for this very microgrant program, is explicitly ineligible.

We noticed only because we called `eth_chainId` against mainnet before trusting the docs. A builder who trusts the file loses the work.

## 3. The documented gas example is wrong by a factor of 10^12

On the gas and fees page:

```ts
value: ethers.parseUnits("1", 6),   // 1 USDC via native send
```

The native interface has 18 decimals, so this sends 0.000000000001 USDC, not 1 USDC. The correct form is `parseEther("1")`.

The error is invisible in testing because the transaction succeeds — it just moves an amount a thousand billion times too small. In the other direction, the same confusion overpays by 10^12. This snippet is the first thing a builder copies.

## 4. The two decimal views need one explicit rule, and the docs give two

Native USDC is 18 decimals; the ERC-20 interface at `0x3600…0000` is 6. Same balance, two views. That part is documented clearly and we found it elegant.

What is not settled is which one an application should hold:

- `evm-differences` warns: do not use the 6-decimal value when crediting or recording balances, because truncation records less than was transferred.
- The `use-arc` skill says the ERC-20 view is the one to use for all balances, transfers, approvals, and display.

Both are defensible and they point opposite ways. A single sentence — *send through either, account in 18* — would close it. As written, two builders reading two official sources will disagree about the same payment, and they will only find out when they reconcile.

## 5. One payment, three possible log shapes — and one of them is invisible

This cost us a real bug, and it is the finding we would most like to see documented.

How a USDC payment appears in the logs depends on how it was sent:

| How it was sent | 18-decimal system log | 6-decimal ERC-20 log |
|---|---|---|
| Native send | yes | no |
| ERC-20 `transfer()` between two addresses | yes | yes |
| ERC-20 `transfer()` to yourself | **no** | yes |

The third row is the trap. [`0x808d379b…3254`](https://explorer.arc.io/tx/0x808d379bf646917db27df3e13e60b8a85ea13022364000caad0ae30567fc3254) is a real mainnet payment carrying the memo `FV-2026-001`, and it emits **no** system log at all. An indexer watching only the system emitter reports it as no payment. An indexer watching only the ERC-20 address misses every native send. An indexer watching both, naively, double-counts row two.

We only found it because a fixture happened to be a self-transfer. Anyone building accounting, reconciliation, or an indexer on Arc will hit this, and the current framing — "native transfers emit a Transfer event" — does not warn them.

Suggestion: state the matrix, and state the reconciliation rule, which is floor division rather than equality (see the next item).

## 6. The explorer truncates amounts, so it disagrees with the chain

A payment of `4.086042559998641628` USDC is displayed by the explorer as `4.086042`. The dust is real, on chain, and spendable — it simply does not fit the 6-decimal view.

For a block explorer this is a display choice. It becomes a correctness problem the moment anyone builds "does the paid amount match the invoice?" on top of the displayed number, because two different amounts render identically. A tooltip with the exact 18-decimal value, or a trailing ellipsis, would make the truncation visible rather than silent.

## 7. Memos are good, and almost nothing says so

The Memo predeploy is the most distinctive thing we found on Arc and it is the reason this project exists. A payment that carries `FV-2026-001`, verifiable by anyone, with the author recovered through `CallFrom` so the memo is provably the payer's — that is a primitive other chains do not have, and it is the missing half of what makes a stablecoin usable as money rather than as a transfer.

At the time of writing there had been **298 memos chain-wide**. That number seems far too low for the capability. Some friction we hit:

- The documented ABI omits `memoIndex` and the `MemoFailed` error. We had to read the verified source on the explorer to get the complete interface.
- Memos are EOA-only: `CallFrom` rejects smart contract wallets, which excludes ERC-4337 accounts, Safes, and Circle's own modular wallets. That is a defensible design, but it is a hard stop for anyone building memo'd payments on an account-abstraction onboarding path, and it deserves a prominent warning rather than one line.
- `CallFrom` does not forward value, so a memo cannot ride a native send — it must wrap the ERC-20 `transfer()`. Combined with item 4, a builder following the "use native sends, they are cheaper" advice discovers late that they cannot attach a memo at all.
- There is no documented maximum memo size. We measured `eth_estimateGas` accepting 200,000 bytes, and the contract has no length check, but the real limit is whatever the mempool enforces, which is not stated anywhere.

## 8. `eth_getLogs` is capped in two different ways, and the second one is undocumented

The 10,000-block range cap is documented and reasonable. Two things were not obvious:

- There is also a result-count ceiling, and a separate per-client rate limit. While scanning for memos across recent history we received `rate limit exceeded` on a modest sequence of sequential `eth_getLogs` calls — roughly one in three failed. The limit is not published, so there is no way to pace requests correctly other than by backing off blindly.
- Filters are unavailable: `eth_newFilter` and the rest of that family return "method not supported". `eth_subscribe` over WebSocket does work, which is the right answer, but the gap between "standard JSON-RPC" and "what this node serves" should be listed somewhere a builder will find before writing the code.

Consequence worth naming: because memos are indexed by `memoId` but history is only searchable 10,000 blocks at a time, "find my memo by its id" does not scale past about 84 minutes of chain history. Anyone using `memoId` as a lookup key needs to store the transaction hash themselves. That is a reasonable design, but it inverts what the indexed field appears to promise.

---

## What went well, specifically

Not padding — these are the things that made a one-day build possible.

- **The public RPC is genuinely public.** No key, no sign-up, CORS open, and it served every read this project makes. Being able to ship a working product against mainnet with zero credentials is rare and it is the single biggest reason this exists.
- **`finalized` and `safe` block tags work, with zero lag.** Deterministic finality that is actually queryable means a receipt can state *settled* as a fact instead of counting confirmations and hoping. Every other chain forces a heuristic here.
- **Receipts carry `blockTimestamp` on the transaction and on every log.** It is non-standard and it removed an entire round trip from our hot path. Please keep it.
- **Fees denominated in dollars.** A receipt that reads "this payment cost $0.00045 to send" needed no price oracle, no conversion, and no disclaimer. It is a small thing that changes what a receipt can say.
- **The Memo contract source is verified on the explorer.** When the published ABI turned out to be incomplete, the verified source was there and settled the question in a minute.

---

Written by [mega2608](https://github.com/megadeth17) while building [Arcstamp](https://arcstamp.vercel.app). Every measurement above is reproducible against `https://rpc.mainnet.arc.io`; the commands are in [RESEARCH.md](./RESEARCH.md).
