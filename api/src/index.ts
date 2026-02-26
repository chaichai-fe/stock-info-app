import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppBindings } from './types'
import { stock } from './routes/stock'

const app = new Hono<{ Bindings: AppBindings }>()

app.use('/api/*', cors())

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const cause = err.cause as { code?: string } | undefined
    return c.json(
      {
        ok: false,
        error: {
          code: cause?.code ?? 'BAD_REQUEST',
          message: err.message,
        },
      },
      err.status,
    )
  }

  return c.json(
    {
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message:
          err instanceof Error
            ? err.message
            : '东方财富数据服务暂时不可用，请稍后重试。',
      },
    },
    502,
  )
})

app.get('/', (c) =>
  c.json({ service: 'stock-info-api', status: 'ok', endpoint: '/api/stock/:code' }),
)

app.route('/api/stock', stock)

export default app
