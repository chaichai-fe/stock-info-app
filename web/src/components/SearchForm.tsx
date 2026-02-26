import { memo, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

interface SearchFormProps {
  loading: boolean
  onSearch: (code: string) => void
}

export const SearchForm = memo(function SearchForm({ loading, onSearch }: SearchFormProps) {
  const [code, setCode] = useState('')
  const canSubmit = useMemo(() => /^\d{6}$/.test(code.trim()), [code])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (canSubmit && !loading) onSearch(code.trim())
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit && !loading) onSearch(code.trim())
  }

  return (
    <form className="queryForm" onSubmit={handleSubmit}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={handleKeyDown}
        placeholder="例如：600519"
        className="stockInput"
        aria-label="股票代码"
      />
      <button type="submit" disabled={!canSubmit || loading}>
        {loading ? '查询中...' : '查询'}
      </button>
    </form>
  )
})
