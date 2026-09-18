// Pure receipt construction. No network access in this file: it takes raw
// JSON-RPC objects and returns a receipt, which is why it can be tested offline
// against captured mainnet fixtures.

import { ARC_MAINNET, publicRpcOrigin, TRANSFER_TOPIC, USDC_EVENT_EMITTER } from './arc.ts'

export type RawLog = {
  address: string
  topics: string[]
  data: string
}

export type RawTx = {
  hash: string
  from: string
  to: string | null
  value: string
  input: string
  nonce: string
  chainId?: string
  blockNumber: string | null
  blockTimestamp?: string
  type: string
}

export type RawTxReceipt = {
  status: string
  gasUsed: string
  effectiveGasPrice: string
  logs: RawLog[]
  blockNumber: string
}

export type RawBlock = {
  number: string
  timestamp: string
  hash: string
}

/** A single USDC movement, decoded from a system-emitted Transfer log. */
export type UsdcTransfer = {
  from: string
  to: string
  /** Amount in native base units (18 decimals). */
  amount: bigint
}

/**
 * One thing that was checked, and whether it held. Every claim the receipt
 * makes is backed by one of these, so nothing is ever marked verified without
 * naming the predicate behind it.
 */
export type Check = {
  id: string
  label: string
  passed: boolean
  detail: string
}

export type Finality = {
  /** True when the containing block is at or behind the chain's finalized head. */
  settled: boolean
  blockNumber: number
  finalizedBlockNumber: number
  headBlockNumber: number
  lagBlocks: number
}

export type Receipt = {
  hash: string
  found: boolean
  succeeded: boolean
  from: string | null
  to: string | null
  /** Native USDC attached to the transaction itself, in base units. */
  value: bigint
  /** Every USDC movement the transaction caused, per the system Transfer logs. */
  transfers: UsdcTransfer[]
  /** Sum of all transfers, in base units. */
  totalMoved: bigint
  /** Fee actually paid, in base units — denominated in dollars, because gas is USDC. */
  fee: bigint
  gasUsed: bigint
  /** Raw calldata carried by the transaction, and its text reading when it has one. */
  note: { hex: string; text: string | null; byteLength: number } | null
  blockNumber: number | null
  timestamp: number | null
  finality: Finality | null
  checks: Check[]
  kind: 'payment' | 'contract-call' | 'no-value' | 'unknown'
}

export const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/

export function isTxHash(value: string): boolean {
  return HASH_PATTERN.test(value.trim())
}

export function normalizeHash(value: string): string {
  return value.trim().toLowerCase()
}

function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

function hexToNumber(hex: string | null | undefined): number | null {
  if (!hex || hex === '0x') return null
  return Number(BigInt(hex))
}

/** Exact decimal string from base units. No floating point anywhere near money. */
export function formatUnits(value: bigint, decimals = ARC_MAINNET.nativeCurrency.decimals): string {
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = magnitude / base
  const fraction = magnitude % base
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fractionText ? `.${fractionText}` : ''}`
}

/**
 * Render an amount the way a receipt should read: always at least two decimal
 * places, and enough extra places to avoid rounding a small amount to zero.
 */
export function formatUsd(value: bigint, decimals = ARC_MAINNET.nativeCurrency.decimals): string {
  const exact = formatUnits(value, decimals)
  const [whole, fraction = ''] = exact.split('.')
  if (fraction === '') return `${whole}.00`
  const firstSignificant = fraction.search(/[1-9]/)
  const places = firstSignificant < 0 ? 2 : Math.max(2, Math.min(firstSignificant + 2, fraction.length))
  return `${whole}.${fraction.slice(0, places).padEnd(places, '0')}`
}

function addressFromTopic(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase()
}

/**
 * Decode USDC movements from a transaction's logs.
 *
 * On Arc, moving the native asset emits an ordinary ERC-20 Transfer log from a
 * system address, so one decoder covers both a plain wallet-to-wallet payment
 * and a payment routed through a contract.
 */
export function decodeUsdcTransfers(logs: RawLog[]): UsdcTransfer[] {
  const emitter = USDC_EVENT_EMITTER.toLowerCase()
  const out: UsdcTransfer[] = []
  for (const log of logs) {
    if (log.address?.toLowerCase() !== emitter) continue
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue
    if (log.topics.length < 3) continue
    out.push({
      from: addressFromTopic(log.topics[1]),
      to: addressFromTopic(log.topics[2]),
      amount: hexToBigInt(log.data),
    })
  }
  return out
}

/**
 * Read a transaction's calldata as a note.
 *
 * Text is only offered when the bytes decode as UTF-8 and are overwhelmingly
 * printable; otherwise the receipt shows the bytes and says nothing about their
 * meaning, rather than guessing.
 */
export function decodeNote(input: string): Receipt['note'] {
  if (!input || input === '0x') return null
  const hex = input.startsWith('0x') ? input.slice(2) : input
  if (hex.length === 0 || hex.length % 2 !== 0) return null

  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  let text: string | null = null
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const printable = [...decoded].filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
    }).length
    if (decoded.length > 0 && printable / decoded.length >= 0.9) {
      text = decoded
    }
  } catch {
    text = null
  }

  return { hex: input, text, byteLength: bytes.length }
}

function classify(value: bigint, transfers: UsdcTransfer[], input: string): Receipt['kind'] {
  const hasCalldata = Boolean(input) && input !== '0x'
  if (transfers.length === 0 && value === 0n) return 'no-value'
  if (!hasCalldata && transfers.length > 0) return 'payment'
  if (transfers.length > 0) return 'contract-call'
  return 'unknown'
}

export type ReceiptInput = {
  hash: string
  tx: RawTx | null
  txReceipt: RawTxReceipt | null
  block: RawBlock | null
  finalizedBlockNumber: number | null
  headBlockNumber: number | null
}

export function buildReceipt(input: ReceiptInput): Receipt {
  const { hash, tx, txReceipt, block } = input

  if (!tx) {
    return {
      hash,
      found: false,
      succeeded: false,
      from: null,
      to: null,
      value: 0n,
      transfers: [],
      totalMoved: 0n,
      fee: 0n,
      gasUsed: 0n,
      note: null,
      blockNumber: null,
      timestamp: null,
      finality: null,
      kind: 'unknown',
      checks: [
        {
          id: 'tx-found',
          label: 'Transaction exists on Arc mainnet',
          passed: false,
          detail: `No transaction with this hash was returned by ${publicRpcOrigin()}. It may be from another chain, or not yet propagated.`,
        },
      ],
    }
  }

  const value = hexToBigInt(tx.value)
  const transfers = txReceipt ? decodeUsdcTransfers(txReceipt.logs ?? []) : []
  const totalMoved = transfers.reduce((sum, transfer) => sum + transfer.amount, 0n)
  const gasUsed = hexToBigInt(txReceipt?.gasUsed)
  const fee = gasUsed * hexToBigInt(txReceipt?.effectiveGasPrice)
  const succeeded = txReceipt?.status === '0x1'
  const blockNumber = hexToNumber(tx.blockNumber)
  const timestamp = hexToNumber(block?.timestamp ?? tx.blockTimestamp ?? null)
  const note = decodeNote(tx.input)

  let finality: Finality | null = null
  if (blockNumber !== null && input.finalizedBlockNumber !== null && input.headBlockNumber !== null) {
    finality = {
      settled: blockNumber <= input.finalizedBlockNumber,
      blockNumber,
      finalizedBlockNumber: input.finalizedBlockNumber,
      headBlockNumber: input.headBlockNumber,
      lagBlocks: input.headBlockNumber - input.finalizedBlockNumber,
    }
  }

  const checks: Check[] = [
    {
      id: 'tx-found',
      label: 'Transaction exists on Arc mainnet',
      passed: true,
      detail: `Returned by ${publicRpcOrigin()} in block ${blockNumber ?? 'pending'}.`,
    },
    {
      id: 'chain-id',
      label: `Signed for Arc mainnet (chain ${ARC_MAINNET.chainId})`,
      passed: tx.chainId === undefined || BigInt(tx.chainId) === BigInt(ARC_MAINNET.chainId),
      detail:
        tx.chainId === undefined
          ? 'This is a legacy transaction, which carries no chain id of its own; the node that served it only serves Arc mainnet.'
          : `Transaction chainId is ${BigInt(tx.chainId)}.`,
    },
    {
      id: 'tx-succeeded',
      label: 'Execution succeeded',
      passed: succeeded,
      detail: txReceipt ? `Receipt status is ${txReceipt.status}.` : 'No receipt yet — the transaction is still pending.',
    },
  ]

  if (transfers.length > 0) {
    checks.push({
      id: 'usdc-transfer-logged',
      label: 'USDC movement recorded by the chain',
      passed: true,
      detail: `${transfers.length} Transfer log${transfers.length === 1 ? '' : 's'} emitted by Arc's system address ${USDC_EVENT_EMITTER}, totalling ${formatUnits(totalMoved)} USDC.`,
    })

    // Cross-check: the system log and the transaction's own value field must
    // agree for a direct payment. Disagreement would mean one of the two is
    // lying, so it is worth stating either way.
    if (value > 0n) {
      const direct = transfers.find((transfer) => transfer.amount === value)
      checks.push({
        id: 'amount-agrees',
        label: 'Logged amount matches the transaction value',
        passed: Boolean(direct),
        detail: direct
          ? `The transaction carries ${formatUnits(value)} USDC and a system log records the same amount.`
          : `The transaction carries ${formatUnits(value)} USDC but no single system log matches that amount; the payment was split or routed.`,
      })
    }
  } else if (value > 0n) {
    checks.push({
      id: 'usdc-transfer-logged',
      label: 'USDC movement recorded by the chain',
      passed: false,
      detail: 'The transaction carries value but no system Transfer log was found in its receipt.',
    })
  }

  if (finality) {
    checks.push({
      id: 'finalized',
      label: 'Settled with deterministic finality',
      passed: finality.settled,
      detail: finality.settled
        ? `Block ${finality.blockNumber} is at or behind Arc's finalized head (${finality.finalizedBlockNumber}). On Arc finality is deterministic, so this is settled rather than probably settled.`
        : `Block ${finality.blockNumber} is ahead of the finalized head (${finality.finalizedBlockNumber}) and is not final yet.`,
    })
  }

  return {
    hash: tx.hash ?? hash,
    found: true,
    succeeded,
    from: tx.from?.toLowerCase() ?? null,
    to: tx.to?.toLowerCase() ?? null,
    value,
    transfers,
    totalMoved,
    fee,
    gasUsed,
    note,
    blockNumber,
    timestamp,
    finality,
    checks,
    kind: classify(value, transfers, tx.input),
  }
}

/** True only when every stated check held. */
export function isFullyVerified(receipt: Receipt): boolean {
  return receipt.checks.length > 0 && receipt.checks.every((check) => check.passed)
}
