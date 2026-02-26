import { memo } from 'react'
import type { YearlyRow } from '../types/stock'

function cellClass(value: number | null): string {
  if (value === null) return 'cellNeutral'
  return value > 0 ? 'cellUp' : value < 0 ? 'cellDown' : ''
}

const YearlyTableRow = memo(function YearlyTableRow({ row }: { row: YearlyRow }) {
  return (
    <tr>
      <td>{row.year}</td>
      <td className={cellClass(row.yearReturn.value)}>{row.yearReturn.display}</td>
      <td className={cellClass(row.dividendYield.value)}>{row.dividendYield.display}</td>
      <td className={cellClass(row.totalReturn.value)}>{row.totalReturn.display}</td>
    </tr>
  )
})

interface YearlyTableProps {
  rows: YearlyRow[]
}

export const YearlyTable = memo(function YearlyTable({ rows }: YearlyTableProps) {
  if (rows.length === 0) return null

  return (
    <div className="yearlySection">
      <h3>历年统计（自成立以来）</h3>
      <div className="yearlyTableWrap">
        <table className="yearlyTable">
          <thead>
            <tr>
              <th>年份</th>
              <th>当年涨跌幅</th>
              <th>股息率</th>
              <th>总年化</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <YearlyTableRow key={row.year} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})
