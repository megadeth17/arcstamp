// The JSON contract other people's agents will depend on. If a field here
// changes, that is a breaking change and this test should be the thing that
// says so.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { publicRpcOrigin } from '../lib/arc.ts'
import { toApiReceipt } from '../lib/api-shape.ts'
import { buildReceipt, type RawBlock, type RawTx, type RawTxReceipt } from '../lib/receipt.ts'

type Fixture = { hash: string; tx: RawTx; receipt: RawTxReceipt; block: RawBlock }

const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/mainnet-transactions.json', import.meta.url), 'utf8'),
) as { finalitySample: { finalizedBlock: string; headBlock: string }; transactions: Record<string, Fixture> }

const FINALIZED = Number(BigInt(fixtures.finalitySample.finalizedBlock))
const HEAD = Number(BigInt(fixtures.finalitySample.headBlock))

function api(name: string) {
  const fixture = fixtures.transactions[name]
  return toApiReceipt(
    buildReceipt({
      hash: fixture.hash,
      tx: fixture.tx,
      txReceipt: fixture.receipt,
      block: fixture.block,
      finalizedBlockNumber: FINALIZED,
      headBlockNumber: HEAD,
    }),
  )
}

test('the receipt payload carries every documented field', () => {
  const body = api('nativeTransfer')

  assert.deepEqual(
    Object.keys(body).sort(),
    [
      'amountBaseUnits',
      'amountUsdc',
      'block',
      'chainId',
      'checks',
      'explorer',
      'feeUsdc',
      'finality',
      'found',
      'from',
      'gasUsed',
      'hash',
      'kind',
      'note',
      'settled',
      'source',
      'status',
      'to',
      'totalMovedUsdc',
      'transfers',
      'verified',
    ].sort(),
  )
})

test('amounts survive JSON as exact strings, never as floats', () => {
  const body = api('nativeTransfer')

  assert.equal(typeof body.amountUsdc, 'string')
  assert.equal(typeof body.amountBaseUnits, 'string')
  assert.equal(body.amountUsdc, '0.4177985')
  assert.equal(body.amountBaseUnits, '417798500000000000')
  assert.equal(body.feeUsdc, '0.0004515')
  assert.equal(body.gasUsed, '21000')

  // The whole payload must be serializable — a stray bigint would throw here.
  const roundTripped = JSON.parse(JSON.stringify(body))
  assert.equal(roundTripped.amountBaseUnits, '417798500000000000')
})

test('status names the outcome precisely', () => {
  assert.equal(api('nativeTransfer').status, 'settled')
  assert.equal(api('nativeTransfer').verified, true)
  assert.equal(api('zeroValueCall').kind, 'no-value')

  const missing = toApiReceipt(
    buildReceipt({
      hash: '0x' + '22'.repeat(32),
      tx: null,
      txReceipt: null,
      block: null,
      finalizedBlockNumber: FINALIZED,
      headBlockNumber: HEAD,
    }),
  )
  assert.equal(missing.status, 'not_found')
  assert.equal(missing.found, false)
  assert.equal(missing.verified, false)
  assert.equal(missing.settled, false)
})

test('verified is never true while any check failed', () => {
  const fixture = fixtures.transactions.nativeTransfer
  const unsettled = toApiReceipt(
    buildReceipt({
      hash: fixture.hash,
      tx: fixture.tx,
      txReceipt: fixture.receipt,
      block: fixture.block,
      finalizedBlockNumber: Number(BigInt(fixture.tx.blockNumber ?? '0x0')) - 5,
      headBlockNumber: HEAD,
    }),
  )

  assert.equal(unsettled.settled, false)
  assert.equal(unsettled.verified, false)
  assert.equal(unsettled.status, 'awaiting_finality')
})

test('the published endpoint never carries a provider API key', () => {
  // A keyed provider puts the secret in the path or the query string. Only the
  // origin may ever reach a response body or a rendered page.
  assert.equal(publicRpcOrigin('https://arc-mainnet.g.alchemy.com/v2/SECRET_KEY'), 'https://arc-mainnet.g.alchemy.com')
  assert.equal(publicRpcOrigin('https://rpc.example.com/rpc?apikey=SECRET'), 'https://rpc.example.com')
  assert.equal(publicRpcOrigin('https://rpc.mainnet.arc.io'), 'https://rpc.mainnet.arc.io')
  assert.equal(publicRpcOrigin('not a url'), 'unknown')

  const body = JSON.stringify(api('nativeTransfer'))
  assert.ok(!body.includes('SECRET'), 'no credential material may appear in a receipt')
})

test('every transfer is reported with both a human amount and base units', () => {
  const body = api('contractCallWithValue')
  assert.ok(body.transfers.length > 1)
  for (const transfer of body.transfers) {
    assert.match(transfer.from, /^0x[0-9a-f]{40}$/)
    assert.match(transfer.to, /^0x[0-9a-f]{40}$/)
    assert.equal(typeof transfer.amountUsdc, 'string')
    assert.match(transfer.amountBaseUnits, /^[0-9]+$/)
  }
})
