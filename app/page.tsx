import Link from 'next/link'
import HashForm from './components/HashForm.tsx'
import { ARC_MAINNET } from '../lib/arc.ts'
import { fixtureReceipts } from '../lib/fetch-receipt.ts'
import { formatUnits, formatUsd } from '../lib/receipt.ts'
import { rpcBatch } from '../lib/rpc.ts'

// The landing page is cheap to serve and its chain status is a few seconds stale
// at worst, which is fine for a status line.
export const revalidate = 15

// Keyed by hash because several of these are payments and the interesting part
// is how each one was sent, not what kind it is.
const EXAMPLE_NOTE: Record<string, string> = {
  '0x3b84ca8db4672dbd24ad40aa2418236dbea61bb98634c633b196feea8328e47e':
    'an agent paying with a memo — it recorded what the payment was for, on chain',
  '0x808d379bf646917db27df3e13e60b8a85ea13022364000caad0ae30567fc3254':
    'a payment tagged with an invoice number, and visible only through the 6-decimal view',
  '0x7da85a09e8b636ce5d3d7de8b99833d3eacfd6d81dcb4f18b6d68ac1190f4453':
    'a plain wallet-to-wallet payment, 21,000 gas',
  '0x5d57982024b6ad3ca91e398c9a0248179f13dba9821d5e000377c8e4812ec835':
    'a payment routed through a contract, several movements in one transaction',
  '0x7fb9c7748ff6bd9d68f313571b6fe151d7b2e03b2637e4a7fc940da6501ad6e2':
    'a contract call that moved no USDC — the receipt says so instead of inventing a payment',
}

async function chainStatus() {
  try {
    const [head, finalized] = (await rpcBatch([
      { method: 'eth_blockNumber', params: [] },
      { method: 'eth_getBlockByNumber', params: ['finalized', false] },
    ])) as [string | null, { number: string } | null]
    if (!head || !finalized?.number) return null
    const headNumber = Number(BigInt(head))
    const finalNumber = Number(BigInt(finalized.number))
    return { headNumber, finalNumber, lag: headNumber - finalNumber }
  } catch {
    // A status line is never worth breaking the page for.
    return null
  }
}

export default async function Home() {
  const [status, examples] = await Promise.all([chainStatus(), Promise.resolve(fixtureReceipts())])
  const memoExample = examples.find((receipt) => receipt.memo?.text)

  return (
    <>
      <section className="lede">
        <h1>A receipt for every USDC payment on Arc.</h1>
        <p>
          Paste a transaction hash. Get a page you can send to anyone: who paid whom, how much USDC moved, what the
          payment cost in dollars, whether the chain considers it finally settled, and the memo the payer wrote on
          chain — an invoice number, an order id, whatever the payment was for.
        </p>
        <p>
          No wallet, no account, no API key. Every line is read from {ARC_MAINNET.name} mainnet when you load the page.
        </p>
      </section>

      <HashForm autoFocus />

      {status ? (
        <p className="section-note" style={{ marginTop: 14 }}>
          Live: head block {status.headNumber.toLocaleString('en-US')}, finalized{' '}
          {status.finalNumber.toLocaleString('en-US')} — {status.lag === 0 ? 'no lag' : `${status.lag} block behind`}.
          On Arc, finality is deterministic, so a settled payment is settled rather than probably settled.
        </p>
      ) : null}

      <h2 className="section-title">Try a real one</h2>
      <p className="section-note">
        Five transactions taken from Arc mainnet, one of each shape a payment can take. These are other people&apos;s
        real payments, not a staged demo.
      </p>
      <ul className="examples">
        {examples.map((receipt) => {
          const amount = receipt.totalMoved > 0n ? receipt.totalMoved : receipt.value
          return (
            <li key={receipt.hash}>
              <Link className="example" href={`/r/${receipt.hash}`}>
                <span className="example-main">
                  <span className="example-amount">
                    {amount > 0n ? `$${formatUsd(amount)} USDC` : 'No USDC moved'}
                    {receipt.memo?.text ? <span className="example-memo">“{receipt.memo.text}”</span> : null}
                  </span>
                  <span className="example-desc">{EXAMPLE_NOTE[receipt.hash] ?? 'a transaction on Arc'}</span>
                </span>
                <span className="example-hash">
                  {receipt.hash.slice(0, 10)}…{receipt.hash.slice(-6)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <h2 className="section-title">Same thing as JSON</h2>
      <p className="section-note">
        An agent that pays for something on Arc can confirm its own spend the same way a person would. One GET, no key,
        CORS open.
      </p>
      <pre className="code">
        {`GET /api/verify/${memoExample?.hash ?? examples[0]?.hash ?? '0x…'}

{
  "verified": true,
  "settled": true,
  "amountUsdc": "${memoExample ? formatUnits(memoExample.totalMoved) : '0'}",
  "feeUsdc": "${memoExample ? formatUnits(memoExample.fee) : '0'}",
  "memo": { "text": ${JSON.stringify(memoExample?.memo?.text ?? null)}, "index": "${memoExample?.memo?.index ?? ''}" },
  "checks": [ … ]
}`}
      </pre>
    </>
  )
}
