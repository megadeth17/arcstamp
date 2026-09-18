# Rubric → Feature map

Written **before the first line of application code**, as required by the `sponsor-stack-fit` skill. Program criteria are quoted verbatim from https://dorahacks.io/hackathon/arc-microgrants/detail (read 2026-09-18).

## Hard submission requirements

| Requirement (verbatim) | How Arcstamp satisfies it | Status |
|---|---|---|
| "A live deployment on Arc mainnet, with a link we can open." | Public Vercel deployment that reads Arc **mainnet** (chainId 5042) over `https://rpc.mainnet.arc.io`. Opens with no wallet, no login, no API key. Landing page ships with pre-resolved real mainnet receipts so the link works on first click. | planned |
| "A public repo." | `github.com/megadeth17/arcstamp`, MIT, git history from hour 0. | planned |
| "A short description of what your project does and what it uses Arc for." | `SUBMISSION.md` — one-liner + 3 bullets naming the exact Arc primitives used. | planned |
| "A public builder profile. GitHub, X, or Farcaster." | GitHub `megadeth17`, X `mega2608`. | have |
| Not eligible: "testnet-only builds" | Mainnet only. There is no testnet code path in this repo. The chain config is a single mainnet constant. | by design |
| Not eligible: "projects with no Arc component" | The entire product is an Arc-specific reader. It cannot be ported to another chain without deleting its reason to exist (see below). | by design |
| Not eligible: "work already funded by a Circle or Arc program" | New repo, initialized 2026-09-18, never submitted anywhere, no Circle/Arc funding. Prior hackathon code is referenced for patterns only and is declared in `SUBMISSION.md`. | by design |

## Scoring criteria

> "What we look for: Relevance to Arc, technical credibility, the quality of what you built, and whether the project is worth taking further. Promise counts for more than traction here."

### 1. Relevance to Arc — the core bet

Arcstamp is built on three things that are **specific to Arc** and would be meaningless or impossible on a generic EVM chain:

| Arc primitive | Verified how | Where it shows in the product |
|---|---|---|
| **USDC is the native gas token** (18-decimal native accounting) | Read live: `eth_gasPrice` = 20 gwei, a 21000-gas transfer cost **0.0004515 USDC** (receipt `0x7da85a09…f4453`) | Receipt shows the fee denominated in **dollars**, not in a volatile gas token. A receipt that says "this payment cost $0.00045 to send" is an Arc-only sentence. |
| **Native transfers emit a standard ERC-20 `Transfer` log** from the system address `0xfffffffffffffffffffffffffffffffffffffffe` | Read live: receipt of `0x7da85a09…f4453` has exactly 1 log, `topic0 = 0xddf252ad…b3ef`, from/to in topics, amount in data | This is what makes *every* payment on Arc verifiable with standard tooling. Arcstamp turns that log into a human receipt. |
| **Deterministic sub-second finality**, queryable via `finalized` / `safe` block tags | Read live: `eth_getBlockByNumber("finalized")` returns a concrete block (≈1 block behind head) | The receipt states **settled / not yet final** as a fact derived from the chain, not a confirmation count heuristic. On a probabilistic chain this claim cannot be made. |

Target: ≥70% of the pitch is Arc's own stack (skill requirement). Actual: the product is 100% Arc primitives — there is no third-party protocol in the critical path.

### 2. Technical credibility

- Every number in the UI and README is read from mainnet at request time or is a cited real transaction hash. **Zero fabricated metrics** (the `honesty pass` lesson from Cassandra).
- Pure verification logic is unit-tested against captured real mainnet fixtures, so tests pass offline and in CI.
- The receipt exposes exactly what was checked and what was not — no "verified ✓" without stating the predicate.

### 3. Quality of what you built

- One user action, end-to-end: paste a tx hash → get a shareable receipt. Nothing else ships (no auth, no dashboard, no multi-chain).
- Works with no wallet, no key, no signup. A reviewer verifies it in about ten seconds.
- Degraded mode (`MOCK=1`) renders from captured fixtures with no network at all, so the demo cannot be broken by an RPC outage.

### 4. Worth taking further

Receipts are the first primitive of accounting. Roadmap named in three lines in `SUBMISSION.md`: (1) memo-indexed receipts per payer, (2) embeddable receipt widget for merchants, (3) machine-readable receipt feed so an agent can reconcile its own spend. Stated as a direction, not as traction.

### 5. Traction — deliberately not the strategy

The program says promise counts for more than traction. The Agora post-mortem (2026-06-11) lost on traction, which cost us a build that was otherwise the strongest in its field. Here we spend zero hours on user acquisition and all of them on the four criteria above. This is a declared choice, not an oversight.

## Budget constraint

Operator's hard cap: **$1.00 USD total**. The product is read-only against public RPC, so building and running it costs **$0.00**. Verified gas cost of a demo transfer is $0.00045, so even optional demo transactions are immaterial; the only real cost is the one-time fee to move USDC onto Arc, and the submission does not depend on it.
