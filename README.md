# Stock Info App

基于 Cloudflare 的 A 股查询应用：输入股票代码，查询当前价、平均年化、分红率、股息率等。数据来自东方财富，带容灾与缓存。

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | React 19 + Vite 7 |
| 后端 | Hono + TypeScript，部署于 Cloudflare Workers |
| 数据 | 东方财富（主）→ 腾讯行情（回退）→ 缓存旧值 |

## 项目结构

```
stock-info-app/
├── api/          # Hono API（Cloudflare Workers）
├── web/          # React 前端（Vite）
├── scripts/      # 部署脚本
└── docs/         # 部署与指标口径文档
```

## 快速开始

**环境**：Node.js ≥ 18，pnpm（推荐 10.25+，`corepack enable && corepack prepare pnpm@10.25.0 --activate`）

```bash
pnpm install
pnpm dev:api   # 终端 A：API @ http://localhost:8787
pnpm dev:web   # 终端 B：前端 @ http://localhost:5173
```

浏览器打开 http://localhost:5173，前端会通过 Vite 代理将 `/api` 请求转发到 API。

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:api` | 启动 API（Wrangler 本地 Workers） |
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm lint` | 类型检查 + ESLint |
| `pnpm test` | 运行 API 单元测试 |
| `pnpm build:web` | 构建前端到 `web/dist/` |
| `pnpm deploy` | 一键部署 API + Web 到 Cloudflare |
| `pnpm deploy:api` | 仅部署 API |
| `pnpm deploy:web` | 仅部署 Web（需手动指定 `VITE_API_BASE_URL`） |

## 部署与文档

- **部署**：详见 [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md)
- **指标口径**：平均年化、股息率、分红率等说明见 [docs/metrics.md](docs/metrics.md)

## 线上地址（示例）

- **API**：https://stock-info-api.2768505574.workers.dev  
- **Web**：https://stock-info-web.pages.dev  

（实际地址以部署输出或 Cloudflare 控制台为准。）
