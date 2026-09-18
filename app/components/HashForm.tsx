'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { isTxHash, normalizeHash } from '../../lib/receipt.ts'

export default function HashForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const candidate = value.trim()
    if (!candidate) {
      setError('Paste a transaction hash first.')
      return
    }
    if (!isTxHash(candidate)) {
      setError('That is not a transaction hash. It should be 0x followed by 64 hex characters.')
      return
    }
    setError(null)
    router.push(`/r/${normalizeHash(candidate)}`)
  }

  return (
    <form className="lookup" onSubmit={submit} noValidate>
      <input
        aria-label="Arc mainnet transaction hash"
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          if (error) setError(null)
        }}
      />
      <button type="submit">Get receipt</button>
      {error ? (
        <p className="form-error" role="alert" style={{ flexBasis: '100%' }}>
          {error}
        </p>
      ) : null}
    </form>
  )
}
