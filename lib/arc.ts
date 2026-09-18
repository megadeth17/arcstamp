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

export function explorerTx(hash: string): string {
  return `${ARC_MAINNET.explorerUrl}/tx/${hash}`
}

export function explorerAddress(address: string): string {
  return `${ARC_MAINNET.explorerUrl}/address/${address}`
}
