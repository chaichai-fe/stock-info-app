export interface MetricValue<T = number | null> {
  value: T
  display: string
}

export interface StockQuote {
  code: string
  name: string
  market: 'SH' | 'SZ'
  currentPrice: number | null
  changeAmount: number | null
  changePercent: number | null
  updateTime: string | null
}

export interface YearlyRow {
  year: number
  startDate: string
  endDate: string
  yearReturn: MetricValue
  annualDividendPerShare: MetricValue
  dividendYield: MetricValue
  totalReturn: MetricValue
}

export interface StockMetrics {
  annualizedReturn: MetricValue & { periodYears: number | null }
  maxDrawdown: MetricValue & { peakDate: string | null; troughDate: string | null }
  yearly: YearlyRow[]
}

export interface StockData {
  quote: StockQuote
  metrics: StockMetrics
  annualized: { notes: string[] }
  dividend: {
    notes: string[]
    latestDividend: { reportDate: string | null; noticeDate: string | null } | null
  }
  source: {
    provider: 'eastmoney' | 'tencent' | 'cache'
    fallbackUsed: boolean
    isStale: boolean
    fallbackReason?: string
    updatedAt: string
  }
}

export interface StockApiResponse {
  ok: boolean
  data?: StockData
  error?: { code: string; message: string }
}
