import './App.css'
import { SearchForm } from './components/SearchForm'
import { StockOverview } from './components/StockOverview'
import { YearlyTable } from './components/YearlyTable'
import { useStockQuery } from './hooks/useStockQuery'

function App() {
  const { loading, error, data, query } = useStockQuery()

  return (
    <main className="page">
      <section className="card">
        <h1>股票信息查询</h1>
        <p className="subtitle">
          输入 6 位 A 股代码，查询当前价、平均年化，以及从成立以来逐年的涨跌幅/股息率。
        </p>

        <SearchForm loading={loading} onSearch={query} />

        {error && <div className="errorMessage">{error}</div>}

        {data && (
          <>
            <StockOverview data={data} />
            <YearlyTable rows={data.metrics.yearly} />
          </>
        )}
      </section>
    </main>
  )
}

export default App
