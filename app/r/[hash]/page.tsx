import type { Metadata } from 'next'
import Link from 'next/link'
import ReceiptView from '../../components/ReceiptView.tsx'
import HashForm from '../../components/HashForm.tsx'
import { fetchReceipt } from '../../../lib/fetch-receipt.ts'
import { formatUsd, isTxHash, normalizeHash } from '../../../lib/receipt.ts'

export const revalidate = 10

type Props = { params: Promise<{ hash: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params
  if (!isTxHash(hash)) {
    return { title: 'Not a transaction hash' }
  }

  try {
    const receipt = await fetchReceipt(hash)
    if (!receipt.found) {
      return { title: 'Receipt not found', description: `No transaction ${hash} on Arc mainnet.` }
    }
    const amount = receipt.kind === 'contract-call' ? receipt.totalMoved : receipt.value
    const headline = amount > 0n ? `$${formatUsd(amount)} USDC on Arc` : 'Arc transaction receipt'
    const settled = receipt.finality?.settled ? 'Settled' : 'Not yet final'
    return {
      title: headline,
      description: `${settled} · fee $${formatUsd(receipt.fee)} · verified against Arc mainnet.`,
      openGraph: { title: `${headline} — Arcstamp`, description: `${settled} · fee $${formatUsd(receipt.fee)}.` },
    }
  } catch {
    return { title: 'Receipt' }
  }
}

export default async function ReceiptPage({ params }: Props) {
  const { hash } = await params

  if (!isTxHash(hash)) {
    return (
      <>
        <Link className="back" href="/">
          ← Arcstamp
        </Link>
        <section className="lede">
          <h1>That is not a transaction hash.</h1>
          <p>A hash is 0x followed by 64 hexadecimal characters. Try pasting it again.</p>
        </section>
        <HashForm autoFocus />
      </>
    )
  }

  let receipt
  let failure: string | null = null
  try {
    receipt = await fetchReceipt(normalizeHash(hash))
  } catch (error) {
    failure = error instanceof Error ? error.message : 'The Arc RPC did not answer.'
  }

  return (
    <>
      <Link className="back" href="/">
        ← Arcstamp
      </Link>

      {failure ? (
        <>
          <p className="banner">Could not reach Arc mainnet to build this receipt: {failure}</p>
          <HashForm />
        </>
      ) : receipt ? (
        <>
          <ReceiptView receipt={receipt} />
          <h2 className="section-title">Verify it yourself</h2>
          <p className="section-note">
            Nothing here requires trusting this page. These two calls against the public RPC return the same facts.
          </p>
          <pre className="code">
            {`curl -s https://rpc.mainnet.arc.io -X POST \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["${receipt.hash}"]}'

# or as JSON from this site
curl -s ${'/api/verify/' + receipt.hash}`}
          </pre>
          <h2 className="section-title">Another one</h2>
          <HashForm />
        </>
      ) : null}
    </>
  )
}
