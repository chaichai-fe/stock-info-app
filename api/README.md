## Scripts

```txt
pnpm dev
pnpm test
pnpm lint
pnpm deploy
```

## API

- `GET /api/stock/:code`
- 参数示例：`/api/stock/600519`
- 非法代码返回 `400`
- 上游抓取失败返回 `502`

## Env Vars

- `EASTMONEY_TIMEOUT_MS`：东方财富请求超时，默认 `6000`
- `CACHE_TTL_QUOTE`：行情缓存秒数，默认 `45`
- `CACHE_TTL_DIVIDEND`：分红与历史数据缓存秒数，默认 `43200`
