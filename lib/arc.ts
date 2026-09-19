// Arc mainnet constants.
//
// Every value here was read from the live chain on 2026-09-18, not copied from
// a blog post. The verification commands are in RESEARCH.md so anyone can
// reproduce them.

export const ARC_MAINNET = {
  chainId: 5042,
  chainIdHex: '0x13b2',
  name: 'Arc',
  rpcUrl: process.env.ARC_RPC_URL ?? 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  // USDC is the native gas token. Native accounting uses 18 decimals, which is
  // finer-grained than USDC's canonical 6 decimals, so amounts can carry more
  // precision than a dollar figure implies.
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
} as const

// Arc mirrors every native USDC movement as a standard ERC-20 Transfer log
// emitted by this system address. This is what makes payments on Arc indexable
// with ordinary tooling even though USDC is the native asset rather than a
// contract balance.
//
// Verified: the receipt of 0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453
// (a plain 21000-gas native transfer with empty calldata) contains exactly one
// log, emitted by this address, with the topic below.
export const USDC_EVENT_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe'

// keccak256("Transfer(address,address,uint256)")
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// The same USDC balance is also exposed through an ordinary ERC-20 interface at
// a fixed address, with 6 decimals instead of 18. One balance, two views.
//
// Both emit a Transfer log, so a payment sent through the ERC-20 interface
// usually produces two logs for one movement — and a self-transfer produces
// only the ERC-20 one. A verifier that watches a single emitter either
// double-counts or misses real payments; this one reads both and reconciles
// them. Verified on 0x3b84ca8d…e47e (both logs) and 0x808d379b…3254 (ERC-20 only).
export const USDC_ERC20 = '0x3600000000000000000000000000000000000000'

// Native accounting carries 10^12 more precision than the ERC-20 view, so the
// ERC-20 number is the native amount truncated toward zero.
export const NATIVE_PER_ERC20 = 10n ** 12n

// Arc's Memo predeploy. It forwards a call while keeping the caller's own
// address as msg.sender, and emits the memo alongside it — which is how a
// payment on Arc can carry an invoice number or an order id on chain.
export const MEMO_CONTRACT = '0x5294e9927c3306dcbadb03fe70b92e01ccede505'

// keccak256("Memo(address,address,bytes32,bytes32,bytes,uint256)")
export const MEMO_TOPIC = '0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4'

/**
 * The endpoint is quoted in receipts and in the API so a reader can reproduce
 * the lookup. A provider URL can carry an API key in its path or query
 * (…/v2/KEY), so only the origin is ever published.
 */
export function publicRpcOrigin(url: string = ARC_MAINNET.rpcUrl): string {
  try {
    return new URL(url).origin
  } catch {
    return 'unknown'
  }
}

export function explorerTx(hash: string): string {
  return `${ARC_MAINNET.explorerUrl}/tx/${hash}`
}

export function explorerAddress(address: string): string {
  return `${ARC_MAINNET.explorerUrl}/address/${address}`
}
