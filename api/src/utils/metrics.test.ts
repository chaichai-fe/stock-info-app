import { describe, expect, it } from 'vitest'
import { calculateAnnualizedReturn, formatPercent } from './metrics'
import { resolveSecId } from '../providers/eastmoney'

describe('metrics', () => {
  it('should calculate annualized return by 5 years when data enough', () => {
    const result = calculateAnnualizedReturn([
      { date: '2020-01-04', close: 100 },
      { date: '2021-01-04', close: 110 },
      { date: '2022-01-04', close: 120 },
      { date: '2023-01-04', close: 130 },
      { date: '2024-01-04', close: 140 },
      { date: '2025-01-04', close: 160 },
    ])

    expect(result.periodYears).toBe(5)
    expect(result.annualizedReturn).not.toBeNull()
    expect(formatPercent(result.annualizedReturn)).toMatch(/%$/)
  })

  it('should fallback with note if data not enough', () => {
    const result = calculateAnnualizedReturn([{ date: '2025-01-03', close: 160 }])
    expect(result.annualizedReturn).toBeNull()
    expect(result.notes.length).toBeGreaterThan(0)
  })
})

describe('resolveSecId', () => {
  it('should infer SH for 600xxx', () => {
    const result = resolveSecId('600519')
    expect(result).toEqual({ secid: '1.600519', market: 'SH' })
  })

  it('should infer SZ for 000xxx', () => {
    const result = resolveSecId('000001')
    expect(result).toEqual({ secid: '0.000001', market: 'SZ' })
  })
})
