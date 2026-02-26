# stock-info-app

一个可部署到 Cloudflare 的 A 股查询小应用：

- 前端：React + Vite
- 后端：Hono.js + Cloudflare Workers
- 输入股票代码，查询当前价、平均年化、分红率、股息率
- 数据源：东方财富
- 容灾：东方财富不可用时自动回退腾讯行情，仍失败则回退缓存旧值

## 项目结构

- `web`：前端页面
- `api`：接口服务
- `docs`：口径与部署文档

## 使用 pnpm

```bash
pnpm install --no-frozen-lockfile
pnpm dev:api
pnpm dev:web
```

默认 `pnpm dev:api` 使用 Node 本地模式（更适合本机联调）。
如需 Worker 本地模拟：`pnpm dev:api:worker`。

## 测试与检查

```bash
pnpm lint
pnpm test
pnpm build:web
```

部署说明见 `docs/deploy-cloudflare.md`。

