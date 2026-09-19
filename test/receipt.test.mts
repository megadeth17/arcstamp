// Offline tests. Every expectation below is real Arc mainnet data captured by
// scripts/capture-fixtures.mjs, so these run with no network and still prove the
// decoder against the actual chain.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildReceipt,
  decodeMemo,
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

test('an ERC-20 payment that also emits a system log is counted once, at full precision', () => {
  // This transaction emits two Transfer logs for one movement: 18 decimals from
  // the system address and 6 decimals from the ERC-20 interface.
  const fixture = fixtures.transactions.memoPayment
  const transfers = decodeUsdcTransfers(fixture.receipt.logs)

  assert.equal(transfers.length, 1, 'one movement, not two')
  assert.equal(formatUnits(transfers[0].amount), '0.02')
  assert.equal(transfers[0].precision, 'exact', 'the 18-decimal log wins over the 6-decimal one')

  const receipt = receiptFor('memoPayment')
  assert.equal(receipt.kind, 'payment', 'a memo goes through a predeploy but it is still a payment')
  assert.equal(formatUnits(receipt.totalMoved), '0.02')
})

test('a payment visible only through the 6-decimal view is still found', () => {
  // Regression: an ERC-20 self-transfer emits NO system log. Reading only the
  // system emitter reports this real payment as "no USDC moved".
  const fixture = fixtures.transactions.memoSelfTransfer
  const systemLogs = fixture.receipt.logs.filter(
    (log) => log.address.toLowerCase() === '0xfffffffffffffffffffffffffffffffffffffffe',
  )
  assert.equal(systemLogs.length, 0, 'fixture must be one with no system log, or it proves nothing')

  const transfers = decodeUsdcTransfers(fixture.receipt.logs)
  assert.equal(transfers.length, 1)
  assert.equal(transfers[0].precision, 'truncated')
  assert.equal(formatUnits(transfers[0].amount), '0.0001')

  const receipt = receiptFor('memoSelfTransfer')
  assert.notEqual(receipt.kind, 'no-value')
  assert.ok(receipt.totalMoved > 0n)
})

test('dust survives reconciliation between the two views', () => {
  // The 6-decimal view truncates, so matching the two logs has to be floor
  // division. With equality matching this payment would be counted twice.
  const from = '0x' + '11'.repeat(20)
  const to = '0x' + '22'.repeat(20)
  const topic = (address: string) => '0x' + '0'.repeat(24) + address.slice(2)
  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const native = 4086042559998641628n // 4.086042559998641628 USDC
  const erc20 = native / 10n ** 12n // 4086042 — the explorer's truncated view

  const transfers = decodeUsdcTransfers([
    {
      address: '0xfffffffffffffffffffffffffffffffffffffffe',
      topics: [TRANSFER, topic(from), topic(to)],
      data: '0x' + native.toString(16).padStart(64, '0'),
    },
    {
      address: '0x3600000000000000000000000000000000000000',
      topics: [TRANSFER, topic(from), topic(to)],
      data: '0x' + erc20.toString(16).padStart(64, '0'),
    },
  ])

  assert.equal(transfers.length, 1, 'one movement seen through two interfaces')
  assert.equal(transfers[0].amount, native, 'the dust must not be rounded away')
  assert.equal(formatUnits(transfers[0].amount), '4.086042559998641628')
})

test('a memo is decoded with its author and read as text', () => {
  const memo = decodeMemo(fixtures.transactions.memoPayment.receipt.logs)

  assert.ok(memo, 'the memo event must be found')
  assert.equal(memo?.text, 'cronus|signal|BTC-USDC momentum|1789733187299')
  assert.equal(memo?.byteLength, 45)
  assert.equal(memo?.target, '0x3600000000000000000000000000000000000000')
  assert.match(memo?.memoId ?? '', /^0x[0-9a-f]{64}$/)
  assert.match(memo?.index ?? '', /^[0-9]+$/)

  // The Memo predeploy preserves the original caller, so the memo's author is
  // the payer rather than the predeploy itself.
  assert.equal(memo?.sender, fixtures.transactions.memoPayment.tx.from.toLowerCase())
})

test('a receipt with a memo states who wrote it and hides the raw calldata', () => {
  const receipt = receiptFor('memoSelfTransfer')

  assert.equal(receipt.memo?.text, 'FV-2026-001')
  assert.equal(receipt.note, null, 'the Memo call wrapper is not shown as a second, unreadable note')

  const attribution = receipt.checks.find((check) => check.id === 'memo-attributed')
  assert.ok(attribution, 'a memo must come with an attribution check')
  assert.equal(attribution?.passed, true)
})

test('transactions with no memo report none', () => {
  assert.equal(decodeMemo(fixtures.transactions.nativeTransfer.receipt.logs), null)
  assert.equal(receiptFor('nativeTransfer').memo, null)
})

test('hash validation rejects near-misses', () => {
  assert.equal(isTxHash('0x' + 'ab'.repeat(32)), true)
  assert.equal(isTxHash('  0x' + 'AB'.repeat(32) + '  '), true)
  assert.equal(isTxHash('0x' + 'ab'.repeat(31)), false)
  assert.equal(isTxHash('ab'.repeat(32)), false)
  assert.equal(isTxHash('0xzz' + 'ab'.repeat(31)), false)
  assert.equal(isTxHash(''), false)
})
