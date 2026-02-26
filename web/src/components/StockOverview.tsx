import { memo } from 'react'
import type { StockData } from '../types/stock'

function percentClass(value: number | null): string {
  if (value === null) return ''
  return value > 0 ? 'valueUp' : value < 0 ? 'valueDown' : ''
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('zh-CN', { hour12: false })
}

interface StockOverviewProps {
  data: StockData
}

export const StockOverview = memo(function StockOverview({ data }: StockOverviewProps) {
  const { quote, metrics, source } = data

  return (
    <div className="result">
      <h2>
        {quote.name}（{quote.market}.{quote.code}）
      </h2>

      <div className="grid">
        <div className="item">
          <span>当前价</span>
          <strong>{quote.currentPrice ?? '--'}</strong>
        </div>
        <div className="item">
          <span>涨跌幅</span>
          <strong className={percentClass(quote.changePercent)}>
            {quote.changePercent === null
              ? '--'
              : `${(quote.changePercent * 100).toFixed(2)}%`}
          </strong>
        </div>
        <div className="item">
          <span>平均年化</span>
          <strong className={percentClass(metrics.annualizedReturn.value)}>
            {metrics.annualizedReturn.display}
          </strong>
        </div>
        <div className="item">
          <span>最大回撤</span>
          <strong className="valueDown">{metrics.maxDrawdown.display}</strong>
        </div>
      </div>

      <div className="notes">
        <p>更新时间：{formatDate(quote.updateTime ?? source.updatedAt)}</p>
      </div>
    </div>
  )
})
