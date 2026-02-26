import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppBindings } from '../types'
import { StockService } from '../services/stock-service'

const stock = new Hono<{ Bindings: AppBindings }>()

stock.get('/:code', async (c) => {
  const code = c.req.param('code').trim()

  if (!/^\d{6}$/.test(code)) {
    throw new HTTPException(400, {
      message: '股票代码必须是 6 位数字。',
      cause: { code: 'INVALID_STOCK_CODE' },
    })
  }

  const service = new StockService(c.env)
  const data = await service.query(code)

  return c.json({ ok: true, data: StockService.toResponsePayload(data) })
})

export { stock }
