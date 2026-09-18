import { ARC_MAINNET, explorerAddress, explorerTx } from '../../lib/arc.ts'
import { formatUnits, formatUsd, type Receipt } from '../../lib/receipt.ts'

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function utcStamp(seconds: number): string {
  // Fixed UTC formatting so the server and the browser always agree.
  return `${new Date(seconds * 1000).toISOString().replace('T', ' ').replace('.000Z', '')} UTC`
}

function Address({ value }: { value: string }) {
  return (
    <a className="mono" href={explorerAddress(value)} title={value} rel="noreferrer">
      {shorten(value)}
    </a>
  )
}

type Status = { tone: 'good' | 'warn' | 'bad' | 'mute'; text: string }

function statusOf(receipt: Receipt): Status {
  if (!receipt.found) return { tone: 'mute', text: 'Not found on Arc mainnet' }
  if (!receipt.succeeded) {
    return receipt.blockNumber === null
      ? { tone: 'warn', text: 'Pending' }
      : { tone: 'bad', text: 'Execution failed' }
  }
  if (receipt.finality?.settled) return { tone: 'good', text: 'Settled' }
  if (receipt.finality) return { tone: 'warn', text: 'Awaiting finality' }
  return { tone: 'good', text: 'Succeeded' }
}

const KIND_LABEL: Record<Receipt['kind'], string> = {
  payment: 'USDC payment',
  'contract-call': 'USDC payment via contract',
  'no-value': 'Transaction — no USDC moved',
  unknown: 'Transaction',
}

export default function ReceiptView({ receipt }: { receipt: Receipt }) {
  const status = statusOf(receipt)
  const headline = receipt.kind === 'contract-call' ? receipt.totalMoved : receipt.value
  const passed = receipt.checks.filter((check) => check.passed).length

  if (!receipt.found) {
    return (
      <article className="receipt">
        <div className="receipt-head">
          <p className="receipt-kind">No receipt</p>
          <div className="amount">
            <b>—</b>
            <span className={`pill ${status.tone}`}>{status.text}</span>
          </div>
          <p className="amount-exact">{receipt.hash}</p>
        </div>
        <div className="checks">
          <h2>What was checked</h2>
          <p>Nothing is claimed beyond what the chain returned.</p>
          <ul>
            {receipt.checks.map((check) => (
              <li key={check.id}>
                <span className={`mark ${check.passed ? 'yes' : 'no'}`}>{check.passed ? '✓' : '✕'}</span>
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </article>
    )
  }

  return (
    <article className="receipt">
      <div className="receipt-head">
        <p className="receipt-kind">{KIND_LABEL[receipt.kind]}</p>
        <div className="amount">
          <b>${formatUsd(headline)}</b>
          <span className="unit">{ARC_MAINNET.nativeCurrency.symbol}</span>
          <span className={`pill ${status.tone}`} style={{ marginLeft: 'auto' }}>
            {status.text}
          </span>
        </div>
        {headline > 0n && formatUnits(headline) !== formatUsd(headline) ? (
          <p className="amount-exact">exactly {formatUnits(headline)} USDC</p>
        ) : null}
      </div>

      <dl className="rows">
        {receipt.kind === 'contract-call' && receipt.transfers.length > 1 ? (
          <div>
            <dt>Movements</dt>
            <dd>
              {receipt.transfers.length} transfers in one transaction
            </dd>
          </div>
        ) : null}

        {receipt.transfers.length === 1 ? (
          <div>
            <dt>Paid</dt>
            <dd>
              <span className="flow">
                <Address value={receipt.transfers[0].from} />
                <span className="arrow">→</span>
                <Address value={receipt.transfers[0].to} />
              </span>
            </dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Sender</dt>
              <dd>{receipt.from ? <Address value={receipt.from} /> : '—'}</dd>
            </div>
            <div>
              <dt>{receipt.kind === 'no-value' ? 'Called' : 'Recipient'}</dt>
              <dd>{receipt.to ? <Address value={receipt.to} /> : 'contract creation'}</dd>
            </div>
          </>
        )}

        <div>
          <dt>Network fee</dt>
          <dd>
            ${formatUsd(receipt.fee)} <span style={{ color: 'var(--ink-faint)' }}>· {receipt.gasUsed.toString()} gas</span>
          </dd>
        </div>

        <div>
          <dt>Settled in</dt>
          <dd>
            {receipt.blockNumber !== null ? `block ${receipt.blockNumber.toLocaleString('en-US')}` : 'not yet in a block'}
          </dd>
        </div>

        {receipt.timestamp ? (
          <div>
            <dt>Timestamp</dt>
            <dd className="mono">{utcStamp(receipt.timestamp)}</dd>
          </div>
        ) : null}

        <div>
          <dt>Transaction</dt>
          <dd>
            <a className="mono" href={explorerTx(receipt.hash)} rel="noreferrer">
              {shorten(receipt.hash)} ↗
            </a>
          </dd>
        </div>
      </dl>

      {receipt.note ? (
        <div style={{ padding: '0 24px 20px' }}>
          <p className="note">
            <span className="note-label">
              {receipt.note.text ? 'Data carried with the payment' : `Data carried with the payment · ${receipt.note.byteLength} bytes, not text`}
            </span>
            <span className={receipt.note.text ? undefined : 'mono'}>
              {receipt.note.text ?? `${receipt.note.hex.slice(0, 66)}${receipt.note.hex.length > 66 ? '…' : ''}`}
            </span>
          </p>
        </div>
      ) : null}

      <div className="checks">
        <h2>
          What was checked · {passed}/{receipt.checks.length}
        </h2>
        <p>Each line is a predicate evaluated against Arc mainnet. Nothing is marked verified without naming what was verified.</p>
        <ul>
          {receipt.checks.map((check) => (
            <li key={check.id}>
              <span className={`mark ${check.passed ? 'yes' : 'no'}`}>{check.passed ? '✓' : '✕'}</span>
              <span>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
