export interface QuoteData {
  code: string
  name: string
  market: 'SH' | 'SZ'
  secid: string
  currentPrice: number | null
  previousClose: number | null
  changeAmount: number | null
  changePercent: number | null
  totalMarketCap: number | null
  updateTime: string | null
}

export interface HistoricalPoint {
  date: string
  close: number
}

export interface DividendPoint {
  reportDate: string | null
  noticeDate: string | null
  exDividendDate: string | null
  pretaxBonusRmbPer10Shares: number | null
  basicEps: number | null
  rawDividendRatio: number | null
}

export interface DividendMetrics {
  annualDividendPerShare: number | null
  dividendYield: number | null
  payoutRatio: number | null
  latestDividend: DividendPoint | null
  notes: string[]
}

export interface YearlyMetrics {
  year: number
  startDate: string
  endDate: string
  yearReturn: number | null
  annualDividendPerShare: number | null
  dividendYield: number | null
  totalReturn: number | null
}

export interface MaxDrawdownResult {
  maxDrawdown: number | null
  peakDate: string | null
  troughDate: string | null
}

export interface AnnualizedReturnResult {
  periodYears: 3 | 5 | null
  startDate: string | null
  endDate: string | null
  annualizedReturn: number | null
  totalAnnualizedReturn: number | null
  notes: string[]
}

export interface StockQueryResult {
  symbol: string
  quote: QuoteData
  annualized: AnnualizedReturnResult
  maxDrawdown: MaxDrawdownResult
  dividend: DividendMetrics
  yearlyMetrics: YearlyMetrics[]
  source: {
    provider: 'eastmoney' | 'tencent' | 'cache'
    fallbackUsed: boolean
    isStale: boolean
    fallbackReason?: string
    updatedAt: string
  }
}

export interface AppBindings {
  EASTMONEY_TIMEOUT_MS?: string
  CACHE_TTL_QUOTE?: string
  CACHE_TTL_DIVIDEND?: string
}
