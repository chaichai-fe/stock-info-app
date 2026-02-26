import { EastmoneyProvider } from '../providers/eastmoney'
import { TencentQuoteProvider } from '../providers/tencent'
import { MemoryCache } from '../lib/cache'
import type {
  AppBindings,
  DividendMetrics,
  DividendPoint,
  HistoricalPoint,
  QuoteData,
  StockQueryResult,
} from '../types'
import {
  calculateAnnualizedReturn,
  calculateMaxDrawdown,
  calculateYearlyMetrics,
  formatNumber,
  formatPercent,
} from '../utils/metrics'

const quoteCache = new MemoryCache<QuoteData>()
const historyCache = new MemoryCache<HistoricalPoint[]>()
const dividendCache = new MemoryCache<DividendPoint[]>()
const tencentSeriesCache = new MemoryCache<{
  history: HistoricalPoint[]
  dividends: DividendPoint[]
}>()

function envNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function buildDividendMetrics(
  latest: DividendPoint | null,
  currentPrice: number | null,
): DividendMetrics {
  if (!latest) {
    return {
      annualDividendPerShare: null,
      dividendYield: null,
      payoutRatio: null,
      latestDividend: null,
      notes: ['东方财富暂无最新分红记录。'],
    }
  }

  const notes: string[] = []
  const annualDividendPerShare =
    latest.pretaxBonusRmbPer10Shares !== null
      ? latest.pretaxBonusRmbPer10Shares / 10
      : null

  let dividendYield: number | null = latest.rawDividendRatio
  if (dividendYield === null && annualDividendPerShare !== null && currentPrice && currentPrice > 0) {
    dividendYield = annualDividendPerShare / currentPrice
    notes.push('股息率由最近 12 个月分红金额和当前价估算。')
  }

  let payoutRatio: number | null = null
  if (annualDividendPerShare !== null && latest.basicEps !== null && latest.basicEps > 0) {
    payoutRatio = annualDividendPerShare / latest.basicEps
  } else {
    notes.push('分红率缺少 EPS 数据，无法精确计算。')
  }

  return { annualDividendPerShare, dividendYield, payoutRatio, latestDividend: latest, notes }
}

export class StockService {
  private readonly eastmoney: EastmoneyProvider
  private readonly tencent: TencentQuoteProvider
  private readonly quoteTtl: number
  private readonly historyTtl: number

  constructor(env: AppBindings) {
    const timeout = envNumber(env.EASTMONEY_TIMEOUT_MS, 6000)
    this.eastmoney = new EastmoneyProvider(timeout)
    this.tencent = new TencentQuoteProvider(timeout)
    this.quoteTtl = envNumber(env.CACHE_TTL_QUOTE, 45)
    this.historyTtl = envNumber(env.CACHE_TTL_DIVIDEND, 12 * 60 * 60)
  }

  async query(symbol: string): Promise<StockQueryResult> {
    const sym = symbol.trim()

    const [quote, sourceMeta] = await this.fetchQuote(sym)
    const history = await this.fetchHistory(sym)
    const allDividendRaw = await this.fetchDividends(sym)
    const tencentSeries = await this.fetchTencentSeries(sym)

    const fullHistory = tencentSeries ? tencentSeries.history : history
    const annualized = calculateAnnualizedReturn(fullHistory)
    const maxDrawdown = calculateMaxDrawdown(fullHistory)
    const dividend = buildDividendMetrics(allDividendRaw[0] ?? null, quote.currentPrice)

    let allDividends = tencentSeries
      ? [...allDividendRaw, ...tencentSeries.dividends]
      : [...allDividendRaw]

    if (allDividends.every((d) => !d.pretaxBonusRmbPer10Shares)) {
      allDividends = await this.fetchFundDividends(sym, fullHistory)
    }

    const yearlyMetrics = calculateYearlyMetrics(fullHistory, allDividends)
    this.enrichTotalAnnualized(annualized, yearlyMetrics)

    return {
      symbol: sym,
      quote,
      annualized,
      maxDrawdown,
      dividend,
      yearlyMetrics,
      source: { ...sourceMeta, updatedAt: new Date().toISOString() },
    }
  }

  private async fetchQuote(
    sym: string,
  ): Promise<[QuoteData, Omit<StockQueryResult['source'], 'updatedAt'>]> {
    const key = `quote:${sym}`
    const cached = quoteCache.get(key)
    if (cached) {
      return [cached, { provider: 'cache', fallbackUsed: false, isStale: false }]
    }

    try {
      const q = await this.eastmoney.getQuote(sym)
      if (q.currentPrice === null) throw new Error('东方财富行情缺少当前价')
      quoteCache.set(key, q, this.quoteTtl)
      return [q, { provider: 'eastmoney', fallbackUsed: false, isStale: false }]
    } catch (emErr) {
      try {
        const q = await this.tencent.getQuote(sym)
        quoteCache.set(key, q, this.quoteTtl)
        return [
          q,
          {
            provider: 'tencent',
            fallbackUsed: true,
            isStale: false,
            fallbackReason: `东方财富行情不可用，已回退腾讯行情：${emErr instanceof Error ? emErr.message : '未知错误'}`,
          },
        ]
      } catch (txErr) {
        const stale = quoteCache.getStale(key)
        if (!stale) {
          throw new Error(
            `行情源全部不可用: ${txErr instanceof Error ? txErr.message : '未知错误'}`,
          )
        }
        return [
          stale,
          {
            provider: 'cache',
            fallbackUsed: true,
            isStale: true,
            fallbackReason: '东方财富与腾讯行情都不可用，已返回缓存旧值。',
          },
        ]
      }
    }
  }

  private async fetchHistory(sym: string): Promise<HistoricalPoint[]> {
    const key = `history:${sym}`
    return (
      historyCache.get(key) ??
      this.eastmoney
        .getHistory(sym)
        .then((res) => {
          historyCache.set(key, res, this.historyTtl)
          return res
        })
        .catch(() => historyCache.getStale(key) ?? [])
    )
  }

  private async fetchDividends(sym: string): Promise<DividendPoint[]> {
    const key = `dividend:${sym}`
    return (
      dividendCache.get(key) ??
      this.eastmoney
        .getDividendHistory(sym)
        .then((res) => {
          dividendCache.set(key, res, this.historyTtl)
          return res
        })
        .catch(() => dividendCache.getStale(key) ?? [])
    )
  }

  private async fetchTencentSeries(
    sym: string,
  ): Promise<{ history: HistoricalPoint[]; dividends: DividendPoint[] } | null> {
    const key = `tencent-series:${sym}`
    return (
      tencentSeriesCache.get(key) ??
      this.tencent
        .getYearlySeries(sym)
        .then((res) => {
          tencentSeriesCache.set(key, res, this.historyTtl)
          return res
        })
        .catch(() => null)
    )
  }

  private async fetchFundDividends(
    sym: string,
    fullHistory: HistoricalPoint[],
  ): Promise<DividendPoint[]> {
    const yearSet = new Set<number>()
    for (const p of fullHistory) {
      const y = Number(p.date.slice(0, 4))
      if (Number.isFinite(y)) yearSet.add(y)
    }
    return this.eastmoney
      .getFundDividendHistory(sym, [...yearSet].sort((a, b) => a - b))
      .catch(() => [])
  }

  private enrichTotalAnnualized(
    annualized: StockQueryResult['annualized'],
    yearlyMetrics: StockQueryResult['yearlyMetrics'],
  ): void {
    if (!annualized.annualizedReturn || !annualized.startDate || !annualized.endDate) return

    const startYear = Number(annualized.startDate.slice(0, 4))
    const endYear = Number(annualized.endDate.slice(0, 4))
    const inPeriod = yearlyMetrics.filter(
      (m) => m.year >= startYear && m.year <= endYear && m.dividendYield !== null,
    )
    const avgDividendYield =
      inPeriod.length > 0
        ? inPeriod.reduce((sum, m) => sum + (m.dividendYield ?? 0), 0) / inPeriod.length
        : 0
    annualized.totalAnnualizedReturn = annualized.annualizedReturn + avgDividendYield
  }

  static toResponsePayload(data: StockQueryResult) {
    return {
      ...data,
      metrics: {
        annualizedReturn: {
          value: data.annualized.totalAnnualizedReturn,
          display: formatPercent(data.annualized.totalAnnualizedReturn),
          periodYears: data.annualized.periodYears,
          startDate: data.annualized.startDate,
          endDate: data.annualized.endDate,
          notes: data.annualized.notes,
        },
        maxDrawdown: {
          value: data.maxDrawdown.maxDrawdown,
          display: formatPercent(data.maxDrawdown.maxDrawdown),
          peakDate: data.maxDrawdown.peakDate,
          troughDate: data.maxDrawdown.troughDate,
        },
        dividendYield: {
          value: data.dividend.dividendYield,
          display: formatPercent(data.dividend.dividendYield),
        },
        payoutRatio: {
          value: data.dividend.payoutRatio,
          display: formatPercent(data.dividend.payoutRatio),
        },
        annualDividendPerShare: {
          value: data.dividend.annualDividendPerShare,
          display: formatNumber(data.dividend.annualDividendPerShare),
        },
        yearly: data.yearlyMetrics.map((item) => ({
          year: item.year,
          startDate: item.startDate,
          endDate: item.endDate,
          yearReturn: {
            value: item.yearReturn,
            display: formatPercent(item.yearReturn),
          },
          annualDividendPerShare: {
            value: item.annualDividendPerShare,
            display: formatNumber(item.annualDividendPerShare),
          },
          dividendYield: {
            value: item.dividendYield,
            display: formatPercent(item.dividendYield),
          },
          totalReturn: {
            value: item.totalReturn,
            display: formatPercent(item.totalReturn),
          },
        })),
      },
    }
  }
}
