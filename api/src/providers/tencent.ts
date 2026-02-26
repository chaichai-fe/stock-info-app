import type { DividendPoint, HistoricalPoint, QuoteData } from '../types'
import { resolveSecId } from './eastmoney'

function parseSymbol(code: string): string {
  const market = resolveSecId(code).market === 'SH' ? 'sh' : 'sz'
  return `${market}${code}`
}

function parseUpdateTime(value: string | undefined): string | null {
  if (!value || value.length < 14) {
    return null
  }
  const year = value.slice(0, 4)
  const month = value.slice(4, 6)
  const day = value.slice(6, 8)
  const hour = value.slice(8, 10)
  const minute = value.slice(10, 12)
  const second = value.slice(12, 14)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}

function toNumber(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toDateTimeString(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  return `${value} 00:00:00`
}

export class TencentQuoteProvider {
  constructor(private readonly timeoutMs: number) {}

  async getQuote(code: string): Promise<QuoteData> {
    const symbol = parseSymbol(code)
    const url = `https://qt.gtimg.cn/q=${symbol}`
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Accept: '*/*',
        Referer: 'https://gu.qq.com/',
      },
    })
    if (!response.ok) {
      throw new Error(`腾讯行情请求失败: ${response.status}`)
    }
    const raw = await response.text()
    const payload = raw.split('"')[1]
    if (!payload) {
      throw new Error('腾讯行情返回格式异常')
    }
    const fields = payload.split('~')
    const market = resolveSecId(code).market
    const currentPrice = toNumber(fields[3])
    const previousClose = toNumber(fields[4])
    const changeAmount =
      currentPrice !== null && previousClose !== null
        ? currentPrice - previousClose
        : null
    const changePercent =
      changeAmount !== null && previousClose && previousClose > 0
        ? changeAmount / previousClose
        : null

    const rawName = fields[1] || '--'
    const looksGarbled = /�/.test(rawName)
    const name = looksGarbled ? code : rawName

    return {
      code,
      name,
      market,
      secid: resolveSecId(code).secid,
      currentPrice,
      previousClose,
      changeAmount,
      changePercent,
      totalMarketCap: null,
      updateTime: parseUpdateTime(fields[30]),
    }
  }

  async getYearlySeries(code: string): Promise<{ history: HistoricalPoint[]; dividends: DividendPoint[] }> {
    const symbol = parseSymbol(code)
    const dayUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,60,hfq`
    const monthUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},month,,,600,hfq`
    const fetchOpts = {
      method: 'GET' as const,
      signal: AbortSignal.timeout(this.timeoutMs * 2),
      headers: {
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://gu.qq.com/',
      },
    }
    const [monthRes, dayRes] = await Promise.all([
      fetch(monthUrl, fetchOpts),
      fetch(dayUrl, fetchOpts),
    ])
    if (!monthRes.ok) {
      throw new Error(`腾讯月K行情请求失败: ${monthRes.status}`)
    }

    type KLineRow = Array<string | Record<string, string>>
    interface KLinePayload {
      data?: Record<string, { hfqmonth?: KLineRow[]; hfqday?: KLineRow[] }>
    }

    const monthJson = (await monthRes.json()) as KLinePayload
    const monthRows = monthJson.data?.[symbol]?.hfqmonth ?? []

    const priceByDate = new Map<string, number>()
    const dividends: DividendPoint[] = []

    for (const row of monthRows) {
      const date = typeof row[0] === 'string' ? row[0] : ''
      const close = typeof row[2] === 'string' ? Number(row[2]) : Number.NaN
      if (date && Number.isFinite(close) && close > 0) {
        priceByDate.set(date, close)
      }
      this.extractDividendFromRow(row, dividends)
    }

    if (dayRes.ok) {
      try {
        const dayJson = (await dayRes.json()) as KLinePayload
        const dayRows = dayJson.data?.[symbol]?.hfqday ?? []
        for (const row of dayRows) {
          const date = typeof row[0] === 'string' ? row[0] : ''
          const close = typeof row[2] === 'string' ? Number(row[2]) : Number.NaN
          if (date && Number.isFinite(close) && close > 0) {
            priceByDate.set(date, close)
          }
          this.extractDividendFromRow(row, dividends)
        }
      } catch {
        // day data is supplementary, ignore errors
      }
    }

    const history: HistoricalPoint[] = []
    for (const [date, close] of priceByDate) {
      history.push({ date, close })
    }

    return { history, dividends }
  }

  private extractDividendFromRow(
    row: Array<string | Record<string, string>>,
    out: DividendPoint[],
  ): void {
    for (let i = 5; i < row.length; i += 1) {
      const cell = row[i]
      if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
        const event = cell as Record<string, string>
        const pretaxBonusRmbPer10Shares = Number(event.fh_sh)
        if (Number.isFinite(pretaxBonusRmbPer10Shares) && pretaxBonusRmbPer10Shares > 0) {
          const reportYear = event.nd
          out.push({
            reportDate: reportYear ? `${reportYear}-12-31 00:00:00` : null,
            noticeDate: toDateTimeString(event.djr),
            exDividendDate: toDateTimeString(event.cqr),
            pretaxBonusRmbPer10Shares,
            basicEps: null,
            rawDividendRatio: null,
          })
        }
      }
    }
  }
}
