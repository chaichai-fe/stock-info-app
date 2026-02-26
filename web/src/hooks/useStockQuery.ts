import { useCallback, useState } from 'react'
import type { StockApiResponse, StockData } from '../types/stock'

interface StockQueryState {
  loading: boolean
  error: string
  data: StockData | undefined
}

export function useStockQuery() {
  const [state, setState] = useState<StockQueryState>({
    loading: false,
    error: '',
    data: undefined,
  })

  const query = useCallback(async (code: string) => {
    setState({ loading: true, error: '', data: undefined })

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || ''
      const res = await fetch(`${apiBase}/api/stock/${code}`)
      const json = (await res.json()) as StockApiResponse

      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error?.message || '查询失败，请稍后重试。')
      }

      setState({ loading: false, error: '', data: json.data })
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : '查询失败，请稍后重试。',
        data: undefined,
      })
    }
  }, [])

  return { ...state, query } as const
}
