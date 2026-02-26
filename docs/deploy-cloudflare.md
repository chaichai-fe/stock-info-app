# Stock Info App 部署文档

## 项目概览

| 模块 | 技术栈 | 部署目标 | 线上地址 |
|------|--------|---------|---------|
| `api/` | Hono + TypeScript | Cloudflare Workers | https://stock-info-api.2768505574.workers.dev |
| `web/` | React 19 + Vite 7 | Cloudflare Pages | https://stock-info-web.pages.dev |

Monorepo 由 pnpm workspace 管理，根目录统一调度所有命令。

---

## 前置条件

- Node.js >= 18
- pnpm >= 10.25.0（`corepack enable && corepack prepare pnpm@10.25.0 --activate`）
- Cloudflare 账号（[dash.cloudflare.com](https://dash.cloudflare.com)）

---

## 1. 安装依赖

```bash
pnpm install
```

---

## 2. 本地开发

在两个终端分别执行：

```bash
# 终端 A — 启动 API（Cloudflare Workers 本地模拟器）
pnpm dev:api

# 终端 B — 启动前端（Vite 开发服务器）
pnpm dev:web
```

- API 运行在 `http://localhost:8787`
- Web 运行在 `http://localhost:5173`，`/api` 请求已通过 Vite 代理转发到 API

打开 `http://localhost:5173` 即可使用。

---

## 3. 一键部署

项目提供了自动化部署脚本 `scripts/deploy.sh`，完整流程：

```
检查 Cloudflare 登录 → Lint → 测试 → 构建验证 → 部署 API → 自动提取 API 地址 → 构建 Web → 部署 Web
```

### 3.1 首次部署前：登录 Cloudflare

```bash
cd api && npx wrangler login
```

浏览器会打开授权页面，登录成功后终端显示 `Successfully logged in`。只需登录一次，后续部署无需重复。

> 脚本内置了登录检查，未登录时会立即提示并退出，不会浪费时间跑验证流程。

### 3.2 全量部署（API + Web）

```bash
pnpm deploy
```

脚本会自动从 `wrangler deploy` 输出中提取 API 地址，注入 `VITE_API_BASE_URL` 后构建前端，无需手动填写。

### 3.3 只部署 API

```bash
pnpm deploy:api
```

### 3.4 只部署 Web

```bash
pnpm deploy:web
```

仅部署 Web 时，脚本不会执行 API 部署，因此无法自动获取 API 地址。需要通过环境变量手动指定：

```bash
VITE_API_BASE_URL=https://stock-info-api.2768505574.workers.dev pnpm deploy:web
```

如果不指定，`VITE_API_BASE_URL` 为空，适用于同域反代场景。

---

## 4. 手动部署（分步执行）

如果不使用一键脚本，也可以手动分步操作：

### 4.1 部署前验证

```bash
# 类型检查 + Lint
pnpm lint

# 单元测试
pnpm test

# API 构建验证（dry-run，不上传）
pnpm build:api

# Web 构建
pnpm build:web
```

### 4.2 部署 API

```bash
cd api && pnpm run deploy
```

首次部署会自动创建名为 `stock-info-api`（由 `wrangler.jsonc` 中 `name` 字段决定）的 Worker。

### 4.3 部署 Web

```bash
# 用 API 地址重新构建
VITE_API_BASE_URL=https://stock-info-api.2768505574.workers.dev pnpm build:web

# 上传到 Pages
cd web && npx wrangler pages deploy dist --project-name stock-info-web
```

---

## 5. 环境变量

### API 环境变量

默认值写在 `wrangler.jsonc` 的 `vars` 中：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `EASTMONEY_TIMEOUT_MS` | `6000` | 上游 API 请求超时（毫秒） |
| `CACHE_TTL_QUOTE` | `45` | 行情缓存有效期（秒） |
| `CACHE_TTL_DIVIDEND` | `43200` | 分红/历史数据缓存有效期（秒，默认 12 小时） |

如需覆盖，在 Cloudflare Dashboard > Workers > 设置 > 变量 中修改，或通过命令行：

```bash
cd api && npx wrangler deploy --minify \
  --var EASTMONEY_TIMEOUT_MS:8000 \
  --var CACHE_TTL_QUOTE:60
```

### Web 环境变量

| 变量名 | 说明 |
|--------|------|
| `VITE_API_BASE_URL` | API 地址。同域反代时留空，跨域时填 Workers URL |

### 部署脚本环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `VITE_API_BASE_URL` | （自动从 API 部署输出提取） | 手动指定时覆盖自动提取 |
| `PAGES_PROJECT` | `stock-info-web` | Cloudflare Pages 项目名 |

---

## 6. 前后端连接

### 跨域部署（当前方式）

前端和 API 使用不同域名，前端通过 `VITE_API_BASE_URL` 指向 API。API 已内置 CORS 中间件，无需额外配置。

### 同域部署（推荐生产方案）

将 Pages 和 Workers 绑定到同一域名下（如 `stock.example.com`）：

1. Pages 绑定自定义域名 `stock.example.com`
2. Worker 绑定路由 `stock.example.com/api/*`
3. 前端 `VITE_API_BASE_URL` 留空

### 自定义域名

- **Workers**: Cloudflare Dashboard > 该 Worker > 触发器 > 添加自定义域名
- **Pages**: Cloudflare Dashboard > 该 Pages 项目 > 自定义域 > 添加域名

域名需已托管在 Cloudflare DNS。

---

## 7. 命令速查

| 命令 | 说明 |
|------|------|
| `pnpm dev:api` | 启动 API 本地开发服务器（Workers 运行时） |
| `pnpm dev:web` | 启动前端开发服务器 |
| `pnpm lint` | API 类型检查 + Web ESLint |
| `pnpm test` | 运行 API 单元测试 |
| `pnpm build:api` | API 构建验证（dry-run，不上传） |
| `pnpm build:web` | 构建前端产物到 `web/dist/` |
| `pnpm deploy` | **一键全量部署**（验证 + API + Web） |
| `pnpm deploy:api` | 只部署 API（含验证） |
| `pnpm deploy:web` | 只部署 Web（含验证，需手动指定 API 地址） |

---

## 8. 项目结构

```
stock-info-app/
├── package.json              # Monorepo 根配置
├── pnpm-workspace.yaml       # Workspace 声明
├── scripts/
│   └── deploy.sh             # 自动化部署脚本
├── api/
│   ├── wrangler.jsonc         # Workers 配置（名称、环境变量）
│   ├── package.json
│   └── src/
│       ├── index.ts           # Hono 入口（路由挂载、错误处理）
│       ├── routes/stock.ts    # /api/stock/:code 路由
│       ├── services/          # 业务逻辑层
│       ├── providers/         # 数据源（东方财富、腾讯）
│       ├── lib/               # 通用工具（HTTP 客户端、缓存）
│       ├── utils/             # 指标计算、格式化
│       └── types.ts           # TypeScript 类型定义
├── web/
│   ├── vite.config.ts         # Vite 配置（含 API 代理）
│   ├── package.json
│   └── src/
│       ├── App.tsx            # 应用入口
│       ├── components/        # UI 组件
│       ├── hooks/             # 自定义 Hook
│       └── types/             # 前端类型定义
└── docs/
    └── deploy-cloudflare.md   # 本文档
```
