#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ─── 配置 ───────────────────────────────────────────
PAGES_PROJECT="${PAGES_PROJECT:-stock-info-web}"

# ─── 颜色输出 ────────────────────────────────────────
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
bold()   { printf "\033[1m%s\033[0m\n" "$1"; }
step()   { printf "\n\033[1;36m▶ %s\033[0m\n" "$1"; }

# ─── 部署目标解析 ────────────────────────────────────
DEPLOY_TARGET="${1:-all}"  # all | api | web

case "$DEPLOY_TARGET" in
  all|api|web) ;;
  *)
    red "用法: ./scripts/deploy.sh [all|api|web]"
    exit 1
    ;;
esac

# ─── 前置检查: Cloudflare 登录状态 ───────────────────
step "前置检查 — Cloudflare 登录状态"
if ! pnpm --filter api exec wrangler whoami >/dev/null 2>&1; then
  red "✘ 未登录 Cloudflare，请先执行:"
  echo ""
  echo "  cd api && npx wrangler login"
  echo ""
  red "登录成功后重新运行部署脚本。"
  exit 1
fi
green "✔ 已登录 Cloudflare"

# ─── Step 1: Lint + 类型检查 ─────────────────────────
step "Step 1/5 — Lint + 类型检查"
pnpm lint
green "✔ Lint 通过"

# ─── Step 2: 单元测试 ────────────────────────────────
step "Step 2/5 — 单元测试"
pnpm test
green "✔ 测试通过"

# ─── Step 3: 构建验证 ────────────────────────────────
step "Step 3/5 — 构建验证 (dry-run)"
pnpm build:api
green "✔ API 构建验证通过"

# ─── Step 4: 部署 API ────────────────────────────────
API_URL="${VITE_API_BASE_URL:-}"

if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "api" ]]; then
  step "Step 4/5 — 部署 API → Cloudflare Workers"
  API_OUTPUT=$(pnpm --filter api exec wrangler deploy --minify 2>&1) || {
    red "API 部署失败"
    echo "$API_OUTPUT"
    exit 1
  }
  echo "$API_OUTPUT"

  DETECTED_URL=$(echo "$API_OUTPUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)
  if [[ -n "$DETECTED_URL" ]]; then
    API_URL="$DETECTED_URL"
    green "✔ API 部署完成 → $API_URL"
  else
    green "✔ API 部署完成（未检测到 URL，将使用环境变量或留空）"
  fi
else
  step "Step 4/5 — 跳过 API 部署"
fi

# ─── Step 5: 构建并部署 Web ──────────────────────────
if [[ "$DEPLOY_TARGET" == "all" || "$DEPLOY_TARGET" == "web" ]]; then
  step "Step 5/5 — 构建并部署 Web → Cloudflare Pages"

  if [[ -n "$API_URL" ]]; then
    echo "  API 地址: $API_URL"
    VITE_API_BASE_URL="$API_URL" pnpm build:web
  else
    echo "  API 地址: (同域，留空)"
    pnpm build:web
  fi
  green "✔ Web 构建完成"

  (cd web && npx wrangler pages deploy dist --project-name "$PAGES_PROJECT")
  green "✔ Web 部署完成"
else
  step "Step 5/5 — 跳过 Web 部署"
fi

# ─── 完成 ─────────────────────────────────────────────
echo ""
bold "🎉 部署完成！"
[[ -n "$API_URL" ]] && echo "  API: $API_URL"
echo "  Web: https://$PAGES_PROJECT.pages.dev"
