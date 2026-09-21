# Arc Microgrants — submission

**Project:** Arcstamp
**Live on Arc mainnet:** https://arcstamp.vercel.app
**Repo:** https://github.com/megadeth17/arcstamp
**Builder:** [github.com/megadeth17](https://github.com/megadeth17) · [x.com/mega2608](https://x.com/mega2608)

## One line

Every USDC payment on Arc gets a public, shareable receipt that states what the chain proves — who paid whom, how much moved, what it cost in dollars, whether it is finally settled, and the memo the payer wrote on chain.

## Three things it does that only work on Arc

- **Reads memos.** Arc's Memo predeploy lets a payer attach `FV-2026-001` to a payment and records them as its author through `CallFrom`. Arcstamp decodes it and checks the author is the signer. That turns a transfer into a receipt.
- **States the fee in dollars.** Gas on Arc is USDC, so a receipt says *this cost $0.00045 to send* with no oracle and no conversion.
- **States settlement as a fact.** `finalized` is queryable and currently at zero lag, so the receipt says settled instead of counting confirmations.

## Demo path for a reviewer, ten seconds, no wallet

1. Open https://arcstamp.vercel.app
2. Click the receipt labelled *an agent paying with a memo* — a real mainnet payment whose memo reads `cronus|signal|BTC-USDC momentum|1789733187299`
3. Read the six checks at the bottom. Each names the predicate and the evidence.
4. Same data as JSON, no key: https://arcstamp.vercel.app/api/verify/0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e

---

# Answers to the 12 submission questions

Copy these verbatim. DoraHacks states the organizer's answers **cannot be edited after submitting**, so they are final here. Each is under the 960-character cap; the count is noted.

**1. Project name** *(8 characters)*

```
Arcstamp
```

**2. Your name, alias, or team name** *(8 characters)*

```
mega2608
```

**3. Contact email** *(24 characters)*

```
mercigerencia2@gmail.com
```

**4. Public builder profiles (GitHub, X, Farcaster)** *(52 characters)*

```
https://github.com/megadeth17
https://x.com/mega2608
```

**5. Link to your live deployment on Arc mainnet** *(27 characters)*

```
https://arcstamp.vercel.app
```

**6. Arc mainnet contract address or a transaction hash we can verify** *(684 characters)*

Leads with the hash, because a screener scans before it reads.

```
0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e

A memo'd USDC payment on Arc mainnet, memo "cronus|signal|BTC-USDC momentum|1789733187299". Open it as a receipt at https://arcstamp.vercel.app/r/0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e and compare it against explorer.arc.io.

Two more the live deployment resolves:

0x808d379bf646917db27df3e13e60b8a85ea13022364000caad0ae30567fc3254
tagged "FV-2026-001", and it emits no system Transfer log at all, only the 6-decimal one

0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453
a plain native transfer, 21000 gas, fee 0.0004515 USDC

Arcstamp deploys no contract of its own. It is a reader, and these are mainnet transactions it verifies live at https://arcstamp.vercel.app/r/<hash>
```

**7. Public repo** *(38 characters)*

```
https://github.com/megadeth17/arcstamp
```

**8. In two sentences, what does your project do?** *(331 characters)*

```
Arcstamp turns any Arc mainnet transaction hash into a public, shareable receipt: who paid whom, how much USDC moved, what the payment cost in dollars, the memo the payer wrote on chain, and whether the chain considers it finally settled. Every line is a named predicate checked against mainnet, with no wallet, account or API key.
```

**9. What does it use Arc for?** *(952 characters)*

```
Three Arc primitives, none of which exist elsewhere, and the project stops making sense without them.

Memos: it decodes the Memo predeploy's event and verifies the memo's author, recovered through CallFrom, is the address that signed the transaction. A payment that carries an invoice number is a receipt rather than a transfer.

USDC as gas: because the fee is denominated in dollars, a receipt states "this cost $0.00045 to send" with no oracle and no conversion.

Deterministic finality: it queries the finalized block tag and reports settlement as a fact instead of counting confirmations.

It also reconciles something Arc-specific that is easy to get wrong: USDC is one balance behind an 18-decimal native interface and a 6-decimal ERC-20 one, and which Transfer logs a payment emits depends on how it was sent. Watching one emitter double-counts or misses real payments. Arcstamp reads both and reconciles by floor division so dust is not lost.
```

**10. Had you deployed to Arc before this project?** — single select

```
Testnet
```

*(Earlier work on Arc testnet during an unrelated 2026 hackathon. Nothing of this project ran before it was built for this program, and no code was carried over.)*

**11. Have you received a Circle or Arc grant, bounty, or prize for this project?** — single select

```
No
```

**12. Anything else we should see?** *(831 characters)*

```
Two things.

feedback.md in the repo: eight issues hit while building, with reproductions. The sharpest are that a transaction priced below the 20 Gwei floor is dropped silently with no receipt to poll; that docs.arc.io/llms.txt still tells coding agents Arc is testnet-only, which produces exactly the ineligible submissions this program excludes; and that the gas documentation's own example is wrong by a factor of 10^12 (parseUnits("1",6) is commented "1 USDC" on an 18-decimal interface).

RESEARCH.md: the method behind every factual claim in the repo, as re-runnable RPC calls, including the log matrix showing that an ERC-20 self-transfer emits no system Transfer log at all. That one was a real bug in this code first, caught by a fixture. 0x808d379b..3254 is a real payment an earlier version reported as "no USDC moved".
```

---

## BUIDL profile fields (the DoraHacks object, separate from the questions above)

Read off the live form on 2026-09-20. The Profile step asks for these, and the starred ones block submission.

| Field | Value |
|---|---|
| BUIDL (project) name * | Arcstamp |
| BUIDL logo * | `public/logo-512.png` — 512×512 PNG, 26 KB, also served at https://arcstamp.vercel.app/logo-512.png |
| Vision * | Crypto payments arrive with no receipt. A transaction hash is not something you can send to a client or an accountant — it is a string on a block explorer. Arcstamp turns any payment on Arc into a receipt anyone can open and verify, including the memo the payer wrote on chain. |
| Category * | **Crypto / Web3** — the options are a fixed set: Crypto / Web3, Quantum Computing, Space, AI / Robotics, Other |
| GitHub/Gitlab/Bitbucket * | https://github.com/megadeth17/arcstamp — **hard block, the form refuses without it** |
| Project website (optional) | https://arcstamp.vercel.app |
| Demo video (optional) | leave empty — none produced, and this hackathon does not require one |
| Social links (at least 1) * | https://x.com/mega2608 |
| Project Source | Hackathon |

## Submission mechanics, verified

- Submitting costs **$0**: no wallet, no signature, no gas anywhere in the hackathon submit path.
- The **GitHub link is a hard block** — the submit modal refuses without it.
- The 12 organizer answers are **one-shot**; the BUIDL profile itself stays editable until the deadline.
- Review is **rolling**, and the program says earlier submissions get earlier answers. Submit as soon as the answers above are pasted.
- As of 2026-09-18 the BUIDLs tab showed **no public submissions** against 246 registered hackers. Submissions awaiting organizer approval are not visible, so this is a floor, not a count.

## Demo video

Not required by this program, and not produced. A 60-second screen recording of the flow — paste hash, read receipt, read the checks — would still help a reviewer and is the cheapest remaining improvement.
