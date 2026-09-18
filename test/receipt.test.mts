// Offline tests. Every expectation below is real Arc mainnet data captured by
// scripts/capture-fixtures.mjs, so these run with no network and still prove the
// decoder against the actual chain.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildReceipt,
  decodeNote,
  decodeUsdcTransfers,
  formatUnits,
  formatUsd,
  isFullyVerified,
  isTxHash,
  type RawBlock,
  type RawTx,
  type RawTxReceipt,
} from '../lib/receipt.ts'

type Fixture = { hash: string; tx: RawTx; receipt: RawTxReceipt; block: RawBlock }

const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/mainnet-transactions.json', import.meta.url), 'utf8'),
) as {
  chainId: string
  finalitySample: { finalizedBlock: string; headBlock: string }
  transactions: Record<string, Fixture>
}

const FINALIZED = Number(BigInt(fixtures.finalitySample.finalizedBlock))
const HEAD = Number(BigInt(fixtures.finalitySample.headBlock))

function receiptFor(name: string) {
  const fixture = fixtures.transactions[name]
  assert.ok(fixture, `fixture ${name} is missing`)
  return buildReceipt({
    hash: fixture.hash,
    tx: fixture.tx,
    txReceipt: fixture.receipt,
    block: fixture.block,
    finalizedBlockNumber: FINALIZED,
    headBlockNumber: HEAD,
  })
}

test('fixtures were captured from Arc mainnet', () => {
  assert.equal(BigInt(fixtures.chainId), 5042n)
})

test('formatUnits is exact and trims trailing zeros', () => {
  assert.equal(formatUnits(417798500000000000n), '0.4177985')
  assert.equal(formatUnits(1000000000000000000n), '1')
  assert.equal(formatUnits(0n), '0')
  assert.equal(formatUnits(1n), '0.000000000000000001')
  // A value that a float would mangle.
  assert.equal(formatUnits(1486991738300000000000n), '1486.9917383')
})

test('formatUsd keeps small amounts visible instead of rounding them to zero', () => {
  assert.equal(formatUsd(451500000000000n), '0.00045')
  assert.equal(formatUsd(417798500000000000n), '0.41')
  assert.equal(formatUsd(1000000000000000000n), '1.00')
  assert.equal(formatUsd(0n), '0.00')
})

test('a plain native transfer decodes to exactly one USDC movement', () => {
  const fixture = fixtures.transactions.nativeTransfer
  const transfers = decodeUsdcTransfers(fixture.receipt.logs)

  assert.equal(transfers.length, 1)
  assert.equal(transfers[0].from, fixture.tx.from.toLowerCase())
  assert.equal(transfers[0].to, (fixture.tx.to ?? '').toLowerCase())
  // The system log agrees with the transaction's own value field.
  assert.equal(transfers[0].amount, BigInt(fixture.tx.value))
})

test('the native transfer receipt passes every stated check', () => {
  const receipt = receiptFor('nativeTransfer')

  assert.equal(receipt.found, true)
  assert.equal(receipt.succeeded, true)
  assert.equal(receipt.kind, 'payment')
  assert.equal(formatUnits(receipt.value), '0.4177985')
  assert.equal(receipt.transfers.length, 1)
  assert.equal(receipt.totalMoved, receipt.value)
  assert.equal(receipt.gasUsed, 21000n)
  // Gas is paid in USDC, so the fee is a dollar figure.
  assert.equal(formatUnits(receipt.fee), '0.0004515')
  assert.equal(receipt.note, null)
  assert.equal(receipt.finality?.settled, true)
  assert.equal(isFullyVerified(receipt), true)

  const ids = receipt.checks.map((check) => check.id)
  assert.deepEqual(ids, ['tx-found', 'chain-id', 'tx-succeeded', 'usdc-transfer-logged', 'amount-agrees', 'finalized'])
})

test('a contract call that moves USDC is classified apart from a direct payment', () => {
  const receipt = receiptFor('contractCallWithValue')

  assert.equal(receipt.kind, 'contract-call')
  assert.ok(receipt.transfers.length > 1, 'expected several USDC movements in a routed payment')
  assert.ok(receipt.totalMoved > receipt.value, 'a routed payment moves more than the value it carries')
  assert.ok(receipt.note, 'a contract call carries calldata')
  assert.equal(receipt.note?.text, null, 'ABI-encoded calldata is not readable text and must not be shown as one')
})

test('a zero-value call reports no payment rather than a false one', () => {
  const receipt = receiptFor('zeroValueCall')

  assert.equal(receipt.value, 0n)
  assert.equal(receipt.transfers.length, 0)
  assert.equal(receipt.totalMoved, 0n)
  assert.equal(receipt.kind, 'no-value')
  assert.ok(
    !receipt.checks.some((check) => check.id === 'amount-agrees'),
    'no amount cross-check should be claimed when there is no amount',
  )
})

test('an unknown hash yields a not-found receipt with a failed check, not a crash', () => {
  const receipt = buildReceipt({
    hash: '0x' + '11'.repeat(32),
    tx: null,
    txReceipt: null,
    block: null,
    finalizedBlockNumber: FINALIZED,
    headBlockNumber: HEAD,
  })

  assert.equal(receipt.found, false)
  assert.equal(isFullyVerified(receipt), false)
  assert.equal(receipt.checks.length, 1)
  assert.equal(receipt.checks[0].id, 'tx-found')
  assert.equal(receipt.checks[0].passed, false)
})

test('a block ahead of the finalized head is reported as not settled', () => {
  const fixture = fixtures.transactions.nativeTransfer
  const receipt = buildReceipt({
    hash: fixture.hash,
    tx: fixture.tx,
    txReceipt: fixture.receipt,
    block: fixture.block,
    finalizedBlockNumber: Number(BigInt(fixture.tx.blockNumber ?? '0x0')) - 1,
    headBlockNumber: HEAD,
  })

  assert.equal(receipt.finality?.settled, false)
  assert.equal(isFullyVerified(receipt), false)
})

test('notes are only read as text when the bytes really are text', () => {
  assert.equal(decodeNote('0x'), null)
  assert.equal(decodeNote(''), null)

  const hello = decodeNote('0x' + Buffer.from('invoice 2026-09 · thanks', 'utf8').toString('hex'))
  assert.equal(hello?.text, 'invoice 2026-09 · thanks')
  assert.equal(hello?.byteLength, Buffer.from('invoice 2026-09 · thanks', 'utf8').length)

  // A 32-byte reference is not text and must not be presented as one.
  const reference = decodeNote('0x' + 'a3'.repeat(32))
  assert.ok(reference)
  assert.equal(reference?.text, null)
  assert.equal(reference?.byteLength, 32)
})

test('hash validation rejects near-misses', () => {
  assert.equal(isTxHash('0x' + 'ab'.repeat(32)), true)
  assert.equal(isTxHash('  0x' + 'AB'.repeat(32) + '  '), true)
  assert.equal(isTxHash('0x' + 'ab'.repeat(31)), false)
  assert.equal(isTxHash('ab'.repeat(32)), false)
  assert.equal(isTxHash('0xzz' + 'ab'.repeat(31)), false)
  assert.equal(isTxHash(''), false)
})
