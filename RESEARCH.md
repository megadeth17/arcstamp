# How every claim in this repo was verified

Arcstamp makes factual claims about Arc. This file is how to disprove them. Everything here was read from `https://rpc.mainnet.arc.io` on 2026-09-18, needs no API key, and can be re-run by anyone.

A JSON-RPC call in this file looks like:

```bash
curl -s https://rpc.mainnet.arc.io -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

## Network

| Claim | How to check | Observed |
|---|---|---|
| Mainnet is live, chain id 5042 | `eth_chainId` | `0x13b2` |
| Node is stock Reth | `web3_clientVersion` | `reth/v2.2.0-88505c7` |
| Base fee sits at the 20 Gwei floor | `eth_gasPrice` | `20000001000` wei |
| Block gas limit 30M | `eth_getBlockByNumber` `latest` | `0x1c9c380` |
| Finality is queryable and current | `eth_getBlockByNumber` with `finalized` | returns a block, lag 0 at time of capture |
| `pending` is not served | `eth_getBlockByNumber` with `pending` | `requested data not available` |
| No custom RPC namespace | `arc_getTransactionMemo`, `arc_chainInfo` | `method not supported` |

There is no `arc_*` namespace and no memo RPC. Anything memo-related has to come from logs — which is what drove the design below.

## Gas is denominated in dollars

A plain 21,000-gas native transfer, taken from a real receipt:

```
tx        0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453
gasUsed   21000
effectiveGasPrice 21500000000
fee       21000 × 21500000000 = 451500000000000 wei = 0.0004515 USDC
```

`scripts/capture-fixtures.mjs` re-captures this receipt from mainnet, so the number in the tests is not hand-written.

## The two interfaces, and the log matrix

USDC on Arc is one balance behind two interfaces:

- native, 18 decimals, movements emitted from the system address `0xffffffffffffffffffffffffffffffffffffffFE`
- ERC-20, 6 decimals, at `0x3600000000000000000000000000000000000000`

Both emit a standard `Transfer` topic, `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`. Which of them fires depends on how the payment was sent. This was established by reading the receipts of three real transactions:

| Transaction | How it was sent | System log | ERC-20 log |
|---|---|---|---|
| `0x7da85a09…f4453` | native send | yes | no |
| `0x3b84ca8d…e47e` | ERC-20 `transfer()` to another address | yes (`20000000000000000`) | yes (`20000`) |
| `0x808d379b…3254` | ERC-20 `transfer()` to self | **no** | yes (`100`) |

Row two is one movement seen twice. Row three is a real payment with no system log at all.

The reconciliation rule is floor division, not equality, because the 6-decimal number is the 18-decimal amount truncated:

```
erc20Amount == nativeAmount / 10^12     (integer division)
```

Equality fails whenever a payment carries dust. `test/receipt.test.mts` covers the exact case: `4.086042559998641628` USDC reported by the explorer as `4.086042`.

## Memos

Memos are not a transaction field, a calldata convention, or a precompile. They are a call to the Memo predeploy, which forwards the inner call through `CallFrom` so the payer stays `msg.sender`, and emits the memo beside it.

```
Memo predeploy  0x5294e9927c3306dcbadb03fe70b92e01ccede505
Memo topic0     0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4
memoIndex()     selector 0xf884e355
```

Confirming memos are live on mainnet, and counting them:

```bash
curl -s https://rpc.mainnet.arc.io -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x5294e9927c3306dcbadb03fe70b92e01ccede505","data":"0xf884e355"},"latest"]}'
```

At capture time this returned 298 — the total number of memo calls in the chain's history.

Event shape, taken from the verified source on the explorer rather than the published ABI, which omits `memoIndex` and the `MemoFailed` error:

```
Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)
```

So the unindexed data is three head words — call-data hash, an offset to the memo bytes, and the memo index — with the bytes themselves at that offset. `decodeMemo` in `lib/receipt.ts` implements exactly that, and the test asserts it against a real memo.

Real memos decoded from mainnet while building, by scanning `eth_getLogs` on the predeploy:

| Memo | Transaction |
|---|---|
| `FV-2026-001` | `0x808d379b…3254` |
| `cronus\|signal\|BTC-USDC momentum\|1789733187299` | `0x3b84ca8d…e47e` |
| `arc first signal` | `0x045234230876…3c66` |

Two constraints worth knowing before designing around memos: `CallFrom` does not forward value, so a memo cannot ride a native send and must wrap the ERC-20 `transfer()`; and smart contract wallets are rejected as the direct caller, so memos are EOA-only.

## Limits found the hard way

- `eth_getLogs` is capped at a 10,000-block range, and separately rate-limited. Scanning recent history for memos, roughly one in three sequential calls returned `rate limit exceeded`. The rate limit is not published.
- `eth_newFilter` and the rest of the filter family return `method not supported`. `eth_subscribe` over WebSocket works.
- Because history is only searchable 10,000 blocks at a time, looking up a memo by its indexed `memoId` does not scale past about 84 minutes of chain. Store the transaction hash.

## What was not verified

Stated plainly, because a claim that was never checked is worth less than no claim.

- **No transaction was ever sent from this project.** Everything above is reads. The write path in the feedback about the 20 Gwei floor comes from Arc's own documentation plus the observed mainnet base fee, not from a dropped transaction of ours.
- **Maximum memo size is unknown.** The contract has no length check and `eth_estimateGas` accepted 200,000 bytes, but the binding limit is whatever the mempool enforces, which is not documented and which we did not probe.
- **Browser-origin RPC calls were not tested end to end.** The CORS headers are open and were read directly, but every call in this file was made server-side. Arcstamp reads the chain from the server, so this does not affect the product.
- **Explorer truncation** was observed in the research pass that preceded this build; the copy of that finding here is reported from that pass rather than re-measured for this file.

## Sources

Primary throughout: the Arc JSON-RPC endpoint above, and the Memo contract's verified source on `explorer.arc.io`. Documentation at `docs.arc.io` was used for intent, and is contradicted in three places by the live chain — those contradictions are the first items in [feedback.md](./feedback.md).
