// Network layer: turn a hash into a receipt with a single RPC round trip.

import { rpcBatch } from './rpc.ts'
import { buildReceipt, normalizeHash, type RawBlock, type RawTx, type RawTxReceipt, type Receipt } from './receipt.ts'
import fixtures from '../fixtures/mainnet-transactions.json'

/**
 * Degraded mode. With ARCSTAMP_MOCK=1 the app serves captured mainnet
 * transactions and never touches the network, so the demo still works if the
 * RPC is down or rate limited. The fixtures are real mainnet data, not invented
 * numbers.
 */
export const MOCK_MODE = process.env.ARCSTAMP_MOCK === '1'

type Fixture = {
  hash: string
  tx: RawTx
  receipt: RawTxReceipt
  block: RawBlock
}

const FIXTURES = fixtures as unknown as {
  finalitySample: { finalizedBlock: string; headBlock: string }
  transactions: Record<string, Fixture>
}

export function fixtureReceipts(): Receipt[] {
  const finalized = Number(BigInt(FIXTURES.finalitySample.finalizedBlock))
  const head = Number(BigInt(FIXTURES.finalitySample.headBlock))
  return Object.values(FIXTURES.transactions).map((fixture) =>
    buildReceipt({
      hash: fixture.hash,
      tx: fixture.tx,
      txReceipt: fixture.receipt,
      block: fixture.block,
      finalizedBlockNumber: finalized,
      headBlockNumber: head,
    }),
  )
}

function fixtureFor(hash: string): Fixture | null {
  const wanted = normalizeHash(hash)
  for (const fixture of Object.values(FIXTURES.transactions)) {
    if (fixture.hash.toLowerCase() === wanted) return fixture
  }
  return null
}

export async function fetchReceipt(rawHash: string, signal?: AbortSignal): Promise<Receipt> {
  const hash = normalizeHash(rawHash)

  if (MOCK_MODE) {
    const fixture = fixtureFor(hash)
    return buildReceipt({
      hash,
      tx: fixture?.tx ?? null,
      txReceipt: fixture?.receipt ?? null,
      block: fixture?.block ?? null,
      finalizedBlockNumber: Number(BigInt(FIXTURES.finalitySample.finalizedBlock)),
      headBlockNumber: Number(BigInt(FIXTURES.finalitySample.headBlock)),
    })
  }

  const [tx, txReceipt, head, finalized] = (await rpcBatch(
    [
      { method: 'eth_getTransactionByHash', params: [hash] },
      { method: 'eth_getTransactionReceipt', params: [hash] },
      { method: 'eth_blockNumber', params: [] },
      { method: 'eth_getBlockByNumber', params: ['finalized', false] },
    ],
    signal,
  )) as [RawTx | null, RawTxReceipt | null, string | null, RawBlock | null]

  // Reth serves a blockTimestamp on the transaction itself, which saves a call.
  // Fall back to fetching the block when it is absent.
  let block: RawBlock | null = null
  if (tx?.blockNumber && !tx.blockTimestamp) {
    const [fetched] = (await rpcBatch(
      [{ method: 'eth_getBlockByNumber', params: [tx.blockNumber, false] }],
      signal,
    )) as [RawBlock | null]
    block = fetched
  }

  return buildReceipt({
    hash,
    tx,
    txReceipt,
    block,
    finalizedBlockNumber: finalized?.number ? Number(BigInt(finalized.number)) : null,
    headBlockNumber: head ? Number(BigInt(head)) : null,
  })
}
