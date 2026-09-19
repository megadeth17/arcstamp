// The public JSON contract. Kept in its own module so a test can freeze the
// shape other people's agents will depend on.

import { ARC_MAINNET, explorerTx, publicRpcOrigin } from './arc.ts'
import { formatUnits, isFullyVerified, type Receipt } from './receipt.ts'

export type ApiReceipt = {
  hash: string
  chainId: number
  status: 'settled' | 'awaiting_finality' | 'pending' | 'failed' | 'not_found'
  found: boolean
  /** True only when every check in `checks` passed. */
  verified: boolean
  settled: boolean
  kind: Receipt['kind']
  from: string | null
  to: string | null
  /** Human amount in USDC, exact decimal string. */
  amountUsdc: string
  /** Same amount in native base units (18 decimals), as a string to survive JSON. */
  amountBaseUnits: string
  totalMovedUsdc: string
  transfers: { from: string; to: string; amountUsdc: string; amountBaseUnits: string; precision: 'exact' | 'truncated' }[]
  /** The memo the payer attached through Arc's Memo predeploy, if any. */
  memo: Receipt['memo']
  /** Fee paid, in USDC — on Arc the fee is denominated in dollars. */
  feeUsdc: string
  gasUsed: string
  note: { hex: string; text: string | null; byteLength: number } | null
  block: { number: number | null; timestamp: number | null; iso: string | null }
  finality: Receipt['finality']
  checks: Receipt['checks']
  explorer: string
  source: string
}

function statusOf(receipt: Receipt): ApiReceipt['status'] {
  if (!receipt.found) return 'not_found'
  if (receipt.blockNumber === null) return 'pending'
  if (!receipt.succeeded) return 'failed'
  return receipt.finality?.settled ? 'settled' : 'awaiting_finality'
}

export function toApiReceipt(receipt: Receipt): ApiReceipt {
  const headline = receipt.kind === 'contract-call' ? receipt.totalMoved : receipt.value

  return {
    hash: receipt.hash,
    chainId: ARC_MAINNET.chainId,
    status: statusOf(receipt),
    found: receipt.found,
    verified: receipt.found && isFullyVerified(receipt),
    settled: receipt.finality?.settled ?? false,
    kind: receipt.kind,
    from: receipt.from,
    to: receipt.to,
    amountUsdc: formatUnits(headline),
    amountBaseUnits: headline.toString(),
    totalMovedUsdc: formatUnits(receipt.totalMoved),
    transfers: receipt.transfers.map((transfer) => ({
      from: transfer.from,
      to: transfer.to,
      amountUsdc: formatUnits(transfer.amount),
      amountBaseUnits: transfer.amount.toString(),
      precision: transfer.precision,
    })),
    memo: receipt.memo,
    feeUsdc: formatUnits(receipt.fee),
    gasUsed: receipt.gasUsed.toString(),
    note: receipt.note,
    block: {
      number: receipt.blockNumber,
      timestamp: receipt.timestamp,
      iso: receipt.timestamp ? new Date(receipt.timestamp * 1000).toISOString() : null,
    },
    finality: receipt.finality,
    checks: receipt.checks,
    explorer: explorerTx(receipt.hash),
    source: publicRpcOrigin(),
  }
}
