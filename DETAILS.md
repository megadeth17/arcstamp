**A receipt for every USDC payment on Arc.**

Paste a transaction hash. Get a page you can send to anyone — a client, an accountant, a counterparty — showing who paid whom, how much USDC moved, what the payment cost in dollars, whether the chain considers it finally settled, and the memo the payer wrote on chain.

No wallet. No account. No API key. Every line is read from Arc mainnet when the page loads.

**Live:** https://arcstamp.vercel.app  ·  **Repo:** https://github.com/megadeth17/arcstamp

### See it on real payments

These are other people's real mainnet transactions, not a staged demo:

- [A payment tagged `FV-2026-001`](https://arcstamp.vercel.app/r/0x808d379bf646917db27df3e13e60b8a85ea13022364000caad0ae30567fc3254) — an invoice number, written on chain by the payer
- [An agent paying with a memo](https://arcstamp.vercel.app/r/0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e) — it recorded what it was buying: `cronus|signal|BTC-USDC momentum|1789733187299`
- [A plain wallet-to-wallet payment](https://arcstamp.vercel.app/r/0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453) — 21,000 gas, fee $0.0004515

The same data as JSON, CORS open, no key, so an agent can confirm its own spend the way a person would:

```
GET https://arcstamp.vercel.app/api/verify/{txHash}
```

### Why this only works on Arc

Three primitives, none of which exist elsewhere. Remove any one of them and the product stops making sense.

**Memos.** Arc's Memo predeploy attaches text to a payment and records the payer as its author, recovered through the `CallFrom` precompile rather than taken on trust. Arcstamp decodes the memo and verifies its author is the address that signed the transaction. A payment carrying an invoice number is a receipt. Without one it is just a transfer.

**USDC as gas.** The fee is denominated in dollars, so a receipt can say *this payment cost $0.00045 to send* with no oracle, no conversion and no timestamp caveat.

**Deterministic finality.** `eth_getBlockByNumber("finalized")` returns a real block, currently at zero lag behind the head, so a receipt states **settled** as a fact instead of counting confirmations and hoping.

### The part that was hardest to get right

USDC on Arc is one balance behind two interfaces — native at 18 decimals, and an ERC-20 at 6 — and which Transfer logs a payment emits depends on how it was sent:

| Sent as | 18-decimal system log | 6-decimal ERC-20 log |
|---|---|---|
| Native send | yes | no |
| ERC-20 `transfer()` to another address | yes | yes |
| ERC-20 `transfer()` to yourself | **no** | yes |

A verifier watching a single emitter either double-counts the middle row or misses the other two. The `FV-2026-001` payment linked above is the third row, and an earlier version of this code reported that real payment as *no USDC moved*. Arcstamp reads both emitters and reconciles them by floor division, not equality, so one movement is counted once and sub-micro-dollar dust is not rounded away.

### It says what it checked

Every receipt lists its predicates with the evidence behind each one — the transaction resolves on chain 5042, execution succeeded, the logged amount agrees with the transaction's own value field, the memo's author is the signer, the block is at or behind the finalized head. Nothing is ever marked verified without naming what was verified.

### Feedback for Circle and Arc

`feedback.md` in the repo documents eight issues hit while building, each with a reproduction. The three sharpest:

1. A transaction priced below the 20 Gwei floor is **dropped silently** — no error, no receipt to poll, never in a block. Mainnet base fee sits exactly at that floor, so any library default that shades an estimate downward loses transactions with no signal.
2. `docs.arc.io/llms.txt` still says Arc is available on testnet only. That file exists to be read by coding agents, and an agent that follows it in good faith produces exactly the testnet-only build this program lists as ineligible.
3. The gas documentation's own example is wrong by a factor of 10^12: `parseUnits("1", 6)` is commented "1 USDC via native send" on an 18-decimal interface.

`RESEARCH.md` records how every factual claim in the repo can be re-derived against the public RPC, so none of it has to be taken on faith.

### How it is built

Next.js on Vercel, and **no web3 library in the app** — the whole product is four JSON-RPC reads sent as a single batch, which is smaller, faster, and cannot be broken by an upstream SDK regression. All money arithmetic is `BigInt` over base units and amounts cross the API as exact decimal strings, never floats. 25 tests, all offline, run against real captured mainnet transactions rather than mocks.

Offline mode (`ARCSTAMP_MOCK=1`) serves those captured transactions with no network at all, so the demo survives an RPC outage.
