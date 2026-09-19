# Arcstamp

**A receipt for every USDC payment on Arc.** → **[arcstamp.vercel.app](https://arcstamp.vercel.app)**

Paste an Arc mainnet transaction hash. Get a page you can send to anyone: who paid whom, how much USDC moved, what the payment cost in dollars, whether the chain considers it finally settled, and the memo the payer wrote on chain.

No wallet. No account. No API key. Every line is read from Arc mainnet when the page loads.

```
GET https://arcstamp.vercel.app/api/verify/0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e
```

```json
{
  "status": "settled",
  "verified": true,
  "amountUsdc": "0.02",
  "feeUsdc": "0.001411537991057686",
  "memo": { "text": "cronus|signal|BTC-USDC momentum|1789733187299", "index": "287" },
  "checks": [ "…six predicates, each with its evidence…" ]
}
```

## Why this is an Arc project and not a generic block explorer

Three things Arcstamp is built on exist on Arc and essentially nowhere else. Remove any of them and the product stops making sense.

**Memos.** Arc has a Memo predeploy that attaches text to a payment and records the payer as its author, recovered through the `CallFrom` precompile rather than taken on trust. That turns a transfer into a receipt: `FV-2026-001` is an invoice number, and `cronus|signal|BTC-USDC momentum|1789733187299` is an agent writing down what it just paid for. A receipt without a reference to what was bought is a bank statement; Arc is the chain where the reference is on chain.

**Fees denominated in dollars.** Gas on Arc is USDC, so a receipt can say *this payment cost $0.00045 to send* with no oracle, no conversion, and no disclaimer. On any other chain that sentence needs a price feed and a timestamp.

**Deterministic finality you can query.** `eth_getBlockByNumber("finalized")` returns a real block, currently at zero lag behind the head. So a receipt states **settled** as a fact rather than counting confirmations. Every check on the page is a predicate against the chain, and nothing is marked verified without the predicate being named next to it.

## What it actually verifies

Each receipt lists what was checked and what the evidence was. Nothing claims more than the chain returned.

| Check | What it proves |
|---|---|
| Transaction exists on Arc mainnet | The hash resolves on chain 5042 |
| Signed for Arc mainnet | The transaction's own chain id is 5042, so it is not a hash from somewhere else |
| Execution succeeded | Receipt status is `0x1` |
| USDC movement recorded by the chain | Transfer logs reconciled across both of Arc's interfaces (below) |
| Logged amount matches the transaction value | The system log and the transaction's own value field agree — if they disagreed, one of them would be lying |
| Memo was written by the payer | The memo's author equals the address that signed the transaction |
| Settled with deterministic finality | The containing block is at or behind the finalized head |

## The part that was hardest to get right

USDC on Arc is one balance behind two interfaces: the native asset at 18 decimals, and an ERC-20 contract at 6. Which logs a payment emits depends on how it was sent, and this is not documented anywhere we could find:

| How it was sent | 18-decimal system log | 6-decimal ERC-20 log |
|---|---|---|
| Native send | yes | no |
| ERC-20 `transfer()` between two addresses | yes | yes |
| ERC-20 `transfer()` to yourself | **no** | yes |

A verifier watching one emitter either double-counts row two or misses rows one and three. [`0x808d379b…3254`](https://arcstamp.vercel.app/r/0x808d379bf646917db27df3e13e60b8a85ea13022364000caad0ae30567fc3254) is a real mainnet payment carrying an invoice number that an earlier version of this code reported as *no USDC moved*.

Arcstamp reads both emitters and reconciles them by **floor division**, not equality — the 6-decimal view is the 18-decimal amount truncated, so a payment of `4.086042559998641628` shows as `4.086042` there. Equality matching would count that payment twice; naive matching would round the dust away. There is a test for exactly this.

## Running it

Requires Node 24. There is nothing else to configure — the public Arc RPC needs no key.

```bash
npm install
npm test        # 25 tests, no network, real captured mainnet data
npm run dev
```

Offline mode serves captured mainnet transactions and never touches the network, so the demo survives an RPC outage:

```bash
ARCSTAMP_MOCK=1 npm run dev
```

Re-capture the fixtures from live mainnet at any time — the script is the proof that the fixtures were not hand-written:

```bash
npm run fixtures
```

## Writing a memo

The app only reads, but `scripts/send-memo.mjs` sends one memo'd USDC payment so you can watch the whole loop close — the receipt it prints is a page on this site. It pays your own address, so the USDC returns and only gas is spent, and it refuses to sign if the worst-case fee exceeds a hard cap.

```bash
ARC_PRIVATE_KEY=0x… node scripts/send-memo.mjs          # dry run, signs nothing
ARC_PRIVATE_KEY=0x… node scripts/send-memo.mjs --send
```

It prices gas at 30 Gwei deliberately: Arc drops anything under 20 Gwei **silently**, with no receipt to poll.

## Design notes

**No web3 library in the app.** The whole product is four JSON-RPC reads. A dependency-free client sent as one batched request is smaller, faster, and cannot be broken by an upstream SDK regression. `lib/rpc.ts` is 70 lines. `viem` is a dev dependency used only by the write script above.

**Money is never a float.** All arithmetic is `BigInt` over base units; decimal strings are produced by string manipulation. The API returns amounts as strings in both views (`amountUsdc` and `amountBaseUnits`) so no consumer has to parse a float.

**Pure core.** `lib/receipt.ts` takes raw RPC objects and returns a receipt, with no network access, which is why the whole decoder is tested offline against real captured transactions rather than mocks.

**No fabricated numbers.** Every figure on the site and in this README is read from the chain at request time or is a cited transaction hash you can open.

## Layout

```
lib/receipt.ts        pure decoder: transfers, memos, checks, money arithmetic
lib/rpc.ts            batched JSON-RPC, no dependencies
lib/api-shape.ts      the public JSON contract, frozen by a test
lib/arc.ts            mainnet constants, each with how it was verified
app/r/[hash]          the receipt page
app/api/verify/[hash] the same receipt as JSON, CORS open
fixtures/             real mainnet transactions, captured by scripts/capture-fixtures.mjs
test/                 25 tests, offline
```

## Where this goes

Receipts are the first primitive of accounting. Next: memo-indexed history per payer, an embeddable receipt for merchants, and a machine-readable feed so an agent can reconcile its own spend without trusting this site.

## Feedback for Circle and Arc

Eight things we hit building this, including a silently-dropped-transaction failure mode and a documentation example that is wrong by a factor of 10^12: **[feedback.md](./feedback.md)**. The verification method for every claim in this repo is in **[RESEARCH.md](./RESEARCH.md)**.

---

MIT. Built by [mega2608](https://github.com/megadeth17) for [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail).
