// Minimal JSON-RPC client. No web3 library on purpose: the whole product is
// four read calls, and a dependency-free client cannot be broken by an upstream
// SDK regression.

import { ARC_MAINNET } from './arc.ts'

export type Hex = string

export class RpcError extends Error {
  readonly code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

type RpcCall = { method: string; params: unknown[] }

type RpcResponse = {
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

/**
 * Send several calls as one JSON-RPC batch, so building a receipt costs a
 * single HTTP round trip. Results come back in request order.
 *
 * A per-call error is returned as `null` rather than throwing, because a
 * receipt is still useful when one of its lookups misses (an unknown hash
 * returns null for both the transaction and its receipt).
 */
export async function rpcBatch(calls: RpcCall[], signal?: AbortSignal): Promise<(unknown | null)[]> {
  const body = calls.map((call, index) => ({
    jsonrpc: '2.0',
    id: index,
    method: call.method,
    params: call.params,
  }))

  const res = await fetch(ARC_MAINNET.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new RpcError(`Arc RPC returned HTTP ${res.status}`, res.status)
  }

  const json: unknown = await res.json()
  if (!Array.isArray(json)) {
    const single = json as RpcResponse
    if (single?.error) throw new RpcError(single.error.message, single.error.code)
    throw new RpcError('Arc RPC did not return a batch response', -1)
  }

  const out: (unknown | null)[] = new Array(calls.length).fill(null)
  for (const entry of json as RpcResponse[]) {
    if (typeof entry.id === 'number' && entry.id >= 0 && entry.id < calls.length) {
      out[entry.id] = entry.error ? null : (entry.result ?? null)
    }
  }
  return out
}

export async function rpc<T>(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<T | null> {
  const [result] = await rpcBatch([{ method, params }], signal)
  return result as T | null
}
