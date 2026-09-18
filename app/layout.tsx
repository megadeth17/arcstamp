import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { ARC_MAINNET, publicRpcOrigin } from '../lib/arc.ts'
import { MOCK_MODE } from '../lib/fetch-receipt.ts'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Arcstamp — verifiable receipts for USDC payments on Arc',
    template: '%s — Arcstamp',
  },
  description:
    'Paste an Arc mainnet transaction hash and get a public receipt that states exactly what the chain proves: who paid whom, how much USDC moved, what the payment cost, and whether it is finally settled.',
  openGraph: {
    type: 'website',
    siteName: 'Arcstamp',
    title: 'Arcstamp — verifiable receipts for USDC payments on Arc',
    description: 'A shareable, verifiable receipt for any payment on Arc mainnet.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="masthead">
            <Link href="/" className="wordmark" style={{ textDecoration: 'none' }}>
              arc<span>stamp</span>
            </Link>
            <p>
              Receipts for {ARC_MAINNET.name} mainnet · chain {ARC_MAINNET.chainId}
            </p>
          </header>

          {MOCK_MODE ? (
            <p className="banner">
              Offline mode. Receipts are being served from captured mainnet transactions instead of the live RPC.
            </p>
          ) : null}

          <main>{children}</main>

          <footer className="foot">
            <p>
              Reads {publicRpcOrigin()} directly. No account, no wallet, no API key.
            </p>
            <p>
              <a href="https://github.com/megadeth17/arcstamp">Source</a> · <Link href="/api/verify">API</Link> ·{' '}
              <a href={ARC_MAINNET.explorerUrl}>Explorer</a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  )
}
