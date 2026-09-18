// Capture real Arc mainnet transactions as offline test fixtures.
// Reproducible: anyone can re-run this against the public RPC and diff the output.
//   node scripts/capture-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs'

const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.mainnet.arc.io'
const OUT = new URL('../fixtures/', import.meta.url)

let id = 0
async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`${method}: ${json.error.message}`)
  return json.result
}

// Hashes picked by scanning recent mainnet blocks for one of each shape.
const HASHES = {
  // plain native USDC transfer, input=0x, 21000 gas, exactly one system Transfer log
  nativeTransfer: '0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453',
  // contract call that also moves native USDC, several logs incl. system Transfer
  contractCallWithValue: '0x5d57982024b6ad3ca91e398c9a0248179f13dba9821d5e000377c8e4812ec835',
  // zero-value contract call, no system Transfer log
  zeroValueCall: '0x7fb9c7748ff6bd9d68f313571b6fe151d7b2e03b2637e4a7fc940da6501ad6e2',
}

const out = { capturedFrom: RPC, chainId: await rpc('eth_chainId'), transactions: {} }

for (const [name, hash] of Object.entries(HASHES)) {
  const tx = await rpc('eth_getTransactionByHash', [hash])
  const receipt = await rpc('eth_getTransactionReceipt', [hash])
  const block = await rpc('eth_getBlockByNumber', [tx.blockNumber, false])
  out.transactions[name] = { hash, tx, receipt, block: { number: block.number, timestamp: block.timestamp, hash: block.hash } }
  console.log(`captured ${name} ${hash} (${receipt.logs.length} logs)`)
}

const finalized = await rpc('eth_getBlockByNumber', ['finalized', false])
const latest = await rpc('eth_blockNumber')
out.finalitySample = { finalizedBlock: finalized.number, headBlock: latest }
console.log(`finality: head ${parseInt(latest, 16)}, finalized ${parseInt(finalized.number, 16)}, lag ${parseInt(latest, 16) - parseInt(finalized.number, 16)} blocks`)

mkdirSync(OUT, { recursive: true })
writeFileSync(new URL('mainnet-transactions.json', OUT), JSON.stringify(out, null, 2) + '\n')
console.log(`wrote fixtures/mainnet-transactions.json`)
