#!/usr/bin/env bash
#
# run.sh — 啟動 / 管理 Home Accounting (Docker)
#
#   ./run.sh          啟動（預設）
#   ./run.sh down     停止
#   ./run.sh restart  重啟
#   ./run.sh logs     看日誌
#   ./run.sh ps       看狀態
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

COMPOSE="docker-compose.prod.yml"

info()  { echo -e "\033[0;34m==>\033[0m $*"; }
ok()    { echo -e "\033[0;32m✓\033[0m $*"; }
err()   { echo -e "\033[0;31m✗\033[0m $*" >&2; }

ensure_env() {
  if [[ -f .env ]]; then return 0; fi
  info ".env 不存在，從 .env.example 建立…"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    local secret; secret="$(openssl rand -base64 32)"
    sed -i.bak "s#change-me-please-generate-a-real-secret#${secret}#" .env && rm -f .env.bak
  fi
  ok "已建立 .env"
}

web_port() {
  if [[ -f .env ]]; then
    grep -E '^WEB_PORT=' .env | cut -d= -f2 | tr -d '"' || echo 3000
  else
    echo 3000
  fi
}

cleanup_ports() {
  local port; port="$(web_port)"
  # 先安全停止可能正在佔用 port 的舊容器
  docker compose -f "$COMPOSE" stop web worker >/dev/null 2>&1 || true

  # 檢查並釋放任何「監聽」該連接埠的本機殘留程序（排除 Docker 自身的後端與連線客戶端）
  local pids; pids="$(lsof -ti:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    for pid in ${pids}; do
      local cmd; cmd="$(ps -p "${pid}" -o comm= 2>/dev/null || true)"
      if [[ "$cmd" != *"docker"* && "$cmd" != *"Docker"* ]]; then
        info "釋放佔用連接埠 ${port} 的本機程序 (PID ${pid}: ${cmd})…"
        kill -9 "${pid}" 2>/dev/null || true
      fi
    done
    sleep 0.5
  fi
}

cmd_up() {
  command -v docker >/dev/null 2>&1 || { err "請先安裝 Docker"; exit 1; }
  ensure_env
  cleanup_ports
  info "啟動 Docker（db + web + worker）…"
  docker compose -f "$COMPOSE" up --build -d "$@"
  ok "已成功啟動 → http://localhost:$(web_port)"
  ok "預設帳號 admin / admin"
  info "查看日誌: ./run.sh logs    查看狀態: ./run.sh ps    停止服務: ./run.sh down"
}

cmd_dev() {
  command -v docker >/dev/null 2>&1 || { err "請先安裝 Docker"; exit 1; }
  ensure_env
  cleanup_ports
  info "啟動開發環境 Docker（db + web + worker，支援 Hot Reload）…"
  docker compose up --build "$@"
  ok "已啟動 → http://localhost:$(web_port)"
  ok "預設帳號 admin / admin"
  info "日誌: docker compose logs -f    狀態: docker compose ps    停止: ./run.sh down"
}

cmd_build() {
  command -v docker >/dev/null 2>&1 || { err "請先安裝 Docker"; exit 1; }
  ensure_env
  info "啟動 Docker（db + web + worker）…"
  docker compose -f "$COMPOSE" up --build
  ok "已啟動 → http://localhost:$(web_port)"
  ok "預設帳號 admin / admin"
  info "日誌: ./run.sh logs    狀態: ./run.sh ps    停止: ./run.sh down"
}

cmd_down() {
  docker compose -f "$COMPOSE" down
  docker compose down
  ok "已停止"
}

cmd_restart() {
  cmd_down
  cmd_up
}

cmd_ps() {
  docker compose -f "$COMPOSE" ps
}

cmd_logs() {
  docker compose -f "$COMPOSE" logs -f "${1:-}"
}

cmd_help() {
  cat <<'EOF'
用法:
  ./run.sh            啟動 Docker（生產環境，等同 up）
  ./run.sh dev        啟動本機開發伺服器（帶資料庫與 Hot Reload）
  ./run.sh down       停止生產環境容器
  ./run.sh restart    重啟生產環境
  ./run.sh ps         容器狀態
  ./run.sh logs       追蹤日誌（可加服務名: web worker db）

設定都在 .env（port、密碼等）。首次會自動從 .env.example 建立 .env。
EOF
}

main() {
  local cmd="${1:-up}"
  shift || true
  case "$cmd" in
    up|start|"") cmd_up "$@" ;;
    dev)         cmd_dev "$@" ;;
    build|rebuild) cmd_build "$@" ;;
    down|stop)   cmd_down "$@" ;;
    restart)     cmd_restart "$@" ;;
    ps|status)   cmd_ps "$@" ;;
    logs)        cmd_logs "$@" ;;
    help|-h|--help) cmd_help ;;
    *) err "未知指令: $cmd（執行 ./run.sh help）"; exit 1 ;;
  esac
}

main "$@"
