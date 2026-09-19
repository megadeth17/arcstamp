import { ARC_MAINNET, publicRpcOrigin } from '../../../lib/arc.ts'
import { fixtureReceipts } from '../../../lib/fetch-receipt.ts'

// Usage document, served as JSON so an agent can discover the endpoint it needs
// without reading a README.
export function GET() {
  const example = fixtureReceipts()[0]

  return Response.json(
    {
      service: 'arcstamp',
      description:
        'Verifiable receipts for USDC payments on Arc mainnet. Reads the chain directly; no key, no account, CORS open.',
      chain: { name: ARC_MAINNET.name, chainId: ARC_MAINNET.chainId, rpc: publicRpcOrigin() },
      endpoints: [
        {
          method: 'GET',
          path: '/api/verify/{txHash}',
          returns: '200 with a receipt, 404 when the hash is unknown to Arc mainnet, 400 for a malformed hash.',
          example: `/api/verify/${example?.hash ?? '0x…'}`,
        },
      ],
      fields: {
        verified: 'true only when every predicate in `checks` passed.',
        settled: 'true when the containing block is at or behind Arc’s finalized head. Arc finality is deterministic.',
        amountUsdc: 'Exact decimal string. Native accounting on Arc uses 18 decimals, finer than USDC’s canonical 6.',
        feeUsdc: 'What the payment cost to send. Gas on Arc is paid in USDC, so this is a dollar figure.',
        transfers:
          'Every USDC movement, reconciled across Arc’s 18-decimal system log and its 6-decimal ERC-20 log so one payment is counted once. precision is "exact" when read from the system log, "truncated" when only the 6-decimal view recorded it.',
        memo: 'The memo attached through Arc’s Memo predeploy, with the payer that wrote it. null when the payment carried none.',
        checks: 'The predicates evaluated, each with the evidence behind it.',
      },
      source: 'https://github.com/megadeth17/arcstamp',
    },
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    },
  )
}
