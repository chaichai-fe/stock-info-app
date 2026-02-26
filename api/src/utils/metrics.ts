import type {
  AnnualizedReturnResult,
  DividendPoint,
  HistoricalPoint,
  MaxDrawdownResult,
  YearlyMetrics,
} from '../types'

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`)
}

function findStartPoint(
  points: HistoricalPoint[],
  targetDate: Date,
): HistoricalPoint | null {
  for (const point of points) {
    if (toDate(point.date) >= targetDate) {
      return point
    }
  }
  return points[0] ?? null
}

export function calculateAnnualizedReturn(
  points: HistoricalPoint[],
): AnnualizedReturnResult {
  const notes: string[] = []
  if (points.length < 2) {
    return {
      periodYears: null,
      startDate: null,
      endDate: null,
      annualizedReturn: null,
      totalAnnualizedReturn: null,
      notes: ['历史数据不足，无法计算年化收益。'],
    }
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const latestDate = toDate(latest.date)

  const periodCandidates: Array<3 | 5> = [5, 3]
  for (const years of periodCandidates) {
    const targetDate = new Date(latestDate)
    targetDate.setFullYear(latestDate.getFullYear() - years)
    const startPoint = findStartPoint(sorted, targetDate)

    if (!startPoint) {
      continue
    }

    if (startPoint.close <= 0 || latest.close <= 0) {
      notes.push('价格数据异常，无法计算年化收益。')
      continue
    }

    const actualYears = dayDiff(startPoint.date, latest.date) / 365.2425
    if (actualYears < years - 0.2) {
      continue
    }
    const annualizedReturn = Math.pow(latest.close / startPoint.close, 1 / actualYears) - 1
    return {
      periodYears: years,
      startDate: startPoint.date,
      endDate: latest.date,
      annualizedReturn,
      totalAnnualizedReturn: null,
      notes,
    }
  }

  return {
    periodYears: null,
    startDate: null,
    endDate: latest.date,
    annualizedReturn: null,
    totalAnnualizedReturn: null,
    notes:
      notes.length > 0
        ? notes
        : ['历史数据不足 3 年，无法计算平均年化。'],
  }
}

export function calculateMaxDrawdown(points: HistoricalPoint[]): MaxDrawdownResult {
  if (points.length < 2) {
    return { maxDrawdown: null, peakDate: null, troughDate: null }
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  let peak = sorted[0]
  let maxDrawdown = 0
  let peakDate = ''
  let troughDate = ''

  for (const point of sorted) {
    if (point.close >= peak.close) {
      peak = point
    }
    if (peak.close > 0) {
      const drawdown = (peak.close - point.close) / peak.close
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
        peakDate = peak.date
        troughDate = point.date
      }
    }
  }

  return {
    maxDrawdown: maxDrawdown > 0 ? maxDrawdown : null,
    peakDate: peakDate || null,
    troughDate: troughDate || null,
  }
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--'
  }
  return `${(value * 100).toFixed(2)}%`
}

export function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--'
  }
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function extractYear(value: string | null): number | null {
  if (!value || value.length < 4) {
    return null
  }
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function dayDiff(start: string, end: string): number {
  return (toDate(end).getTime() - toDate(start).getTime()) / (24 * 60 * 60 * 1000)
}

export function calculateYearlyMetrics(
  points: HistoricalPoint[],
  dividends: DividendPoint[],
): YearlyMetrics[] {
  if (points.length < 2) {
    return []
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const inception = sorted[0]
  const yearEndPrice = new Map<number, HistoricalPoint>()
  for (const point of sorted) {
    const year = Number(point.date.slice(0, 4))
    const current = yearEndPrice.get(year)
    if (!current || point.date > current.date) {
      yearEndPrice.set(year, point)
    }
  }

  const dividendByYear = new Map<
    number,
    { annualDividendPerShare: number; rawDividendYield: number | null; basicEps: number | null }
  >()
  const seenDividendKeys = new Set<string>()
  for (const item of dividends) {
    const year =
      extractYear(item.exDividendDate) ??
      extractYear(item.noticeDate) ??
      extractYear(item.reportDate)
    if (!year) {
      continue
    }

    const dedupeKey = [
      year,
      item.exDividendDate ?? '',
      item.noticeDate ?? '',
      item.reportDate ?? '',
      item.pretaxBonusRmbPer10Shares ?? '',
      item.rawDividendRatio ?? '',
    ].join('|')
    if (seenDividendKeys.has(dedupeKey)) {
      continue
    }
    seenDividendKeys.add(dedupeKey)

    const prev = dividendByYear.get(year) ?? {
      annualDividendPerShare: 0,
      rawDividendYield: null,
      basicEps: null,
    }
    if (item.pretaxBonusRmbPer10Shares !== null) {
      prev.annualDividendPerShare += item.pretaxBonusRmbPer10Shares / 10
    }
    if (item.rawDividendRatio !== null) {
      prev.rawDividendYield = (prev.rawDividendYield ?? 0) + item.rawDividendRatio
    }
    if (item.basicEps !== null && item.basicEps > 0) {
      prev.basicEps = prev.basicEps === null ? item.basicEps : Math.max(prev.basicEps, item.basicEps)
    }
    dividendByYear.set(year, prev)
  }

  const years = [...yearEndPrice.keys()].sort((a, b) => a - b)
  const result: YearlyMetrics[] = []
  for (let i = 0; i < years.length; i += 1) {
    const year = years[i]
    const endPoint = yearEndPrice.get(year)
    if (!endPoint) {
      continue
    }
    const startPoint = i === 0 ? inception : yearEndPrice.get(years[i - 1]) ?? inception
    const yearReturn =
      startPoint.close > 0 && endPoint.close > 0 ? endPoint.close / startPoint.close - 1 : null

    const dividendEntry = dividendByYear.get(year)
    const annualDividendPerShare =
      dividendEntry && dividendEntry.annualDividendPerShare > 0
        ? dividendEntry.annualDividendPerShare
        : null
    const rawDividendYield = dividendEntry?.rawDividendYield ?? null
    const dividendYield =
      rawDividendYield !== null
        ? rawDividendYield
        : annualDividendPerShare !== null && endPoint.close > 0
          ? annualDividendPerShare / endPoint.close
          : null

    const totalReturn =
      yearReturn !== null ? yearReturn + (dividendYield ?? 0) : null

    result.push({
      year,
      startDate: startPoint.date,
      endDate: endPoint.date,
      yearReturn,
      annualDividendPerShare,
      dividendYield,
      totalReturn,
    })
  }

  return result
}
