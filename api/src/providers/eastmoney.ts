import { fetchJson } from '../lib/http'
import type { DividendPoint, HistoricalPoint, QuoteData } from '../types'

const EASTMONEY_UT = 'fa5fd1943c7b386f172d6893dbfba10b'

interface EastmoneyQuoteResponse {
  rc?: number
  data?: Record<string, unknown>
}

interface EastmoneyKlineResponse {
  data?: {
    name?: string
    klines?: string[]
  }
}

interface EastmoneyDividendResponse {
  result?: {
    data?: Array<Record<string, unknown>>
  }
}

interface EastmoneyPageAjaxResponse {
  zxzbhq?: Record<string, unknown>
  zxzb?: Array<Record<string, unknown>>
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toScaledPrice(value: unknown, scale = 100): number | null {
  const num = toNumber(value)
  if (num === null) {
    return null
  }
  return num / scale
}

function resolvePriceScale(decimalPlacesRaw: unknown): number {
  const decimalPlaces = toNumber(decimalPlacesRaw)
  if (decimalPlaces === null) {
    return 100
  }
  const normalized = Math.trunc(decimalPlaces)
  if (normalized < 0 || normalized > 6) {
    return 100
  }
  return 10 ** normalized
}

function toUnixSecondsIso(value: unknown): string | null {
  const seconds = toNumber(value)
  if (seconds === null || seconds <= 0) {
    return null
  }
  return new Date(seconds * 1000).toISOString()
}

export function resolveSecId(code: string): { secid: string; market: 'SH' | 'SZ' } {
  if (/^(5|6|9|11|13)/.test(code)) {
    return { secid: `1.${code}`, market: 'SH' }
  }
  return { secid: `0.${code}`, market: 'SZ' }
}

export class EastmoneyProvider {
  constructor(private readonly timeoutMs: number) {}

  private async getPageAjax(code: string): Promise<EastmoneyPageAjaxResponse> {
    const marketCode = resolveSecId(code).market === 'SH' ? `SH${code}` : `SZ${code}`
    const url = `https://emweb.securities.eastmoney.com/PC_HSF10/OperationsRequired/PageAjax?code=${marketCode}`
    return fetchJson<EastmoneyPageAjaxResponse>(url, {
      timeoutMs: this.timeoutMs,
      retries: 1,
    })
  }

  async getQuote(code: string): Promise<QuoteData> {
    const { secid, market } = resolveSecId(code)
    const fields = 'f43,f57,f58,f59,f60,f86,f116,f169,f170'
    const url = `https://push2delay.eastmoney.com/api/qt/stock/get?fields=${fields}&invt=2&fltt=1&secid=${secid}&ut=bd1d9ddb04089700cf9c27f6f7426281`
    const json = await fetchJson<EastmoneyQuoteResponse>(url, {
      timeoutMs: this.timeoutMs,
      retries: 1,
    })

    const quote = json.data ?? {}
    const priceScale = resolvePriceScale(quote.f59)
    const currentPrice = toScaledPrice(quote.f43, priceScale)
    const previousClose = toScaledPrice(quote.f60, priceScale)
    const changeAmount =
      currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null
    const rawChangePercent = toNumber(quote.f170)
    const changePercent =
      rawChangePercent !== null
        ? rawChangePercent / 10000
        : changeAmount !== null && previousClose && previousClose > 0
          ? changeAmount / previousClose
          : null

    return {
      code,
      name: (quote.f58 as string | undefined) ?? '--',
      market,
      secid,
      currentPrice,
      previousClose,
      changeAmount,
      changePercent,
      totalMarketCap: toNumber(quote.f116),
      updateTime: toUnixSecondsIso(quote.f86),
    }
  }

  async getHistory(code: string, years = 6): Promise<HistoricalPoint[]> {
    try {
      const { secid } = resolveSecId(code)
      const fields1 = 'f1,f2,f3,f4,f5,f6'
      const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58'
      const limit = Math.max(260 * years, 520)
      const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=${fields1}&fields2=${fields2}&klt=101&fqt=1&lmt=${limit}&end=20500000&ut=${EASTMONEY_UT}`

      const json = await fetchJson<EastmoneyKlineResponse>(url, {
        timeoutMs: this.timeoutMs,
        retries: 1,
      })
      const klines = json.data?.klines ?? []
      const priceHistory = klines
        .map((line) => {
          const [date, open, close] = line.split(',')
          const closeValue = Number(close)
          if (!date || !open || !Number.isFinite(closeValue)) {
            return null
          }
          return { date, close: closeValue }
        })
        .filter((item): item is HistoricalPoint => item !== null)

      if (priceHistory.length > 0) {
        return priceHistory
      }
    } catch {
      // 回退到财务历史数据，保证接口可用
    }

    const pageData = await this.getPageAjax(code)
    const financialRows = pageData.zxzb ?? []
    const profitHistory = financialRows
      .map((item) => {
        const reportDate = item.REPORT_DATE as string | undefined
        const netProfit = toNumber(item.PARENT_NETPROFIT)
        if (!reportDate || netProfit === null || netProfit <= 0) {
          return null
        }
        return { date: reportDate.slice(0, 10), close: netProfit }
      })
      .filter((item): item is HistoricalPoint => item !== null)
      .sort((a, b) => a.date.localeCompare(b.date))

    return profitHistory
  }

  async getLatestDividend(code: string): Promise<DividendPoint | null> {
    const history = await this.getDividendHistory(code, 1)
    return history[0] ?? null
  }

  async getDividendHistory(code: string, maxPages = 4): Promise<DividendPoint[]> {
    const pageSize = 50
    const filter = encodeURIComponent(`(SECURITY_CODE="${code}")`)
    const all: DividendPoint[] = []

    for (let page = 1; page <= maxPages; page += 1) {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=${filter}&pageNumber=${page}&pageSize=${pageSize}&sortColumns=REPORT_DATE&sortTypes=-1`
      const json = await fetchJson<EastmoneyDividendResponse>(url, {
        timeoutMs: this.timeoutMs,
        retries: 1,
      })

      const rows = json.result?.data ?? []
      if (rows.length === 0) {
        break
      }

      const parsedRows = rows.map((item) => ({
        reportDate: (item.REPORT_DATE as string | undefined) ?? null,
        noticeDate: (item.NOTICE_DATE as string | undefined) ?? null,
        exDividendDate: (item.EX_DIVIDEND_DATE as string | undefined) ?? null,
        pretaxBonusRmbPer10Shares: toNumber(item.PRETAX_BONUS_RMB),
        basicEps: toNumber(item.BASIC_EPS),
        rawDividendRatio: toNumber(item.DIVIDENT_RATIO),
      }))
      all.push(...parsedRows)

      if (rows.length < pageSize) {
        break
      }
    }

    return all
  }

  async getFundDividendHistory(code: string, years: number[]): Promise<DividendPoint[]> {
    if (years.length < 2) {
      return []
    }
    const sortedYears = [...years].sort((a, b) => a - b)

    interface FundNAVResponse {
      Data?: { LSJZList?: Array<{ FSRQ: string; DWJZ: string; LJJZ: string }> }
      ErrCode?: number
    }

    const fetchYearEnd = async (year: number): Promise<{ year: number; cumDiv: number; dwjz: number } | null> => {
      const url = `https://api.fund.eastmoney.com/f10/lsjz?callback=&fundCode=${code}&pageIndex=1&pageSize=5&startDate=${year}-12-15&endDate=${year}-12-31`
      try {
        const json = await fetchJson<FundNAVResponse>(url, {
          timeoutMs: this.timeoutMs,
          retries: 0,
          headers: { Referer: 'https://fundf10.eastmoney.com/' },
        })
        const list = json.Data?.LSJZList ?? []
        if (list.length === 0) {
          return null
        }
        list.sort((a, b) => b.FSRQ.localeCompare(a.FSRQ))
        const latest = list[0]
        const dwjz = parseFloat(latest.DWJZ)
        const ljjz = parseFloat(latest.LJJZ)
        if (!Number.isFinite(dwjz) || !Number.isFinite(ljjz)) {
          return null
        }
        return { year, cumDiv: ljjz - dwjz, dwjz }
      } catch {
        return null
      }
    }

    const results = await Promise.all(sortedYears.map(fetchYearEnd))
    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null)
    valid.sort((a, b) => a.year - b.year)

    const dividends: DividendPoint[] = []
    for (let i = 1; i < valid.length; i += 1) {
      const prev = valid[i - 1]
      const curr = valid[i]
      const annualDiv = curr.cumDiv - prev.cumDiv
      if (annualDiv > 0.0001) {
        const yieldRatio = curr.dwjz > 0 ? annualDiv / curr.dwjz : null
        dividends.push({
          reportDate: `${curr.year}-12-31 00:00:00`,
          noticeDate: null,
          exDividendDate: `${curr.year}-06-15 00:00:00`,
          pretaxBonusRmbPer10Shares: annualDiv * 10,
          basicEps: null,
          rawDividendRatio: yieldRatio,
        })
      }
    }

    return dividends
  }
}
