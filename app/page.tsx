import Link from 'next/link'
import HashForm from './components/HashForm.tsx'
import { ARC_MAINNET } from '../lib/arc.ts'
import { fixtureReceipts } from '../lib/fetch-receipt.ts'
import { formatUnits, formatUsd } from '../lib/receipt.ts'
import { rpcBatch } from '../lib/rpc.ts'

// The landing page is cheap to serve and its chain status is a few seconds stale
// at worst, which is fine for a status line.
export const revalidate = 15

const EXAMPLE_NOTE: Record<string, string> = {
  payment: 'a wallet paying another wallet, 21,000 gas',
  'contract-call': 'a payment routed through a contract, several movements in one transaction',
  'no-value': 'a contract call that moved no USDC — the receipt says so instead of inventing a payment',
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

  return (
    <>
      <section className="lede">
        <h1>A receipt for every USDC payment on Arc.</h1>
        <p>
          Paste a transaction hash. Get a page you can send to anyone: who paid whom, how much USDC moved, what the
          payment cost in dollars, and whether the chain considers it finally settled.
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
        Three transactions taken from Arc mainnet, one of each shape. These are other people&apos;s real payments, not a
        staged demo.
      </p>
      <ul className="examples">
        {examples.map((receipt) => {
          const amount = receipt.kind === 'contract-call' ? receipt.totalMoved : receipt.value
          return (
            <li key={receipt.hash}>
              <Link className="example" href={`/r/${receipt.hash}`}>
                <span className="example-main">
                  <span className="example-amount">
                    {amount > 0n ? `$${formatUsd(amount)} USDC` : 'No USDC moved'}
                  </span>
                  <span className="example-desc">{EXAMPLE_NOTE[receipt.kind] ?? 'transaction'}</span>
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
        {`GET /api/verify/${examples[0]?.hash ?? '0x…'}

{
  "hash": "${examples[0]?.hash ?? '0x…'}",
  "verified": true,
  "settled": true,
  "amountUsdc": "${examples[0] ? formatUnits(examples[0].value) : '0'}",
  "feeUsdc": "${examples[0] ? formatUnits(examples[0].fee) : '0'}",
  "checks": [ … ]
}`}
      </pre>
    </>
  )
}
