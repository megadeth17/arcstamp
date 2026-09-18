import { toApiReceipt } from '../../../../lib/api-shape.ts'
import { fetchReceipt } from '../../../../lib/fetch-receipt.ts'
import { isTxHash, normalizeHash } from '../../../../lib/receipt.ts'

export const revalidate = 10

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=10, stale-while-revalidate=60',
}

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params

  if (!isTxHash(hash)) {
    return Response.json(
      {
        error: 'invalid_hash',
        message: 'Expected a transaction hash: 0x followed by 64 hexadecimal characters.',
        received: hash.slice(0, 80),
      },
      { status: 400, headers: JSON_HEADERS },
    )
  }

  try {
    const receipt = await fetchReceipt(normalizeHash(hash))
    const body = toApiReceipt(receipt)
    return Response.json(body, { status: receipt.found ? 200 : 404, headers: JSON_HEADERS })
  } catch (error) {
    return Response.json(
      {
        error: 'upstream_unavailable',
        message: error instanceof Error ? error.message : 'The Arc RPC did not answer.',
      },
      { status: 502, headers: JSON_HEADERS },
    )
  }
}
