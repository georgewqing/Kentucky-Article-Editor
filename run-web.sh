#!/bin/bash
# KENTUCKY 网页版:纯 Node Web 服务器,浏览器直接访问(无需 VNC/Electron 窗口)。
#
# 架构:
#   浏览器 ──HTTP──> out/web/serve.cjs(静态资源 + /api/media + /api/upload)
#          ──WebSocket /ws──> 同一份 Electron 主进程逻辑(src/main,经 electron 垫片在 Node 下运行)
#   数据:工作区默认 /raid/media/kentucky-data/workspace;AI 设置/会话复用仓库 dev-data/
#
# 依赖:node(已自带);无新增 npm 包(WebSocket 为零依赖手写实现)。
#
# 用法:
#   ./run-web.sh           构建(若缺)并后台启动,日志 /tmp/kentucky-web.log
#   ./run-web.sh status    查看端口/PID/访问令牌
#   ./run-web.sh stop      停止
#   ./run-web.sh logs      跟踪日志
set -u
cd "$(dirname "$0")"

PORT="${KENTUCKY_WEB_PORT:-6081}"
HOST="${KENTUCKY_WEB_HOST:-127.0.0.1}"
DATA_DIR="${KENTUCKY_DATA_DIR:-/raid/media/kentucky-data}"
LOG=/tmp/kentucky-web.log

export KENTUCKY_WEB_PORT="$PORT"
export KENTUCKY_WEB_HOST="$HOST"
export KENTUCKY_DATA_DIR="$DATA_DIR"

pid_of() { ss -tlnp 2>/dev/null | grep -F ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

case "${1:-start}" in
  stop)
    PID="$(pid_of)"
    if [ -n "$PID" ]; then kill "$PID" && echo "已停止 Web 服务 (pid $PID)"; else echo "Web 服务未在运行"; fi
    exit 0
    ;;
  status)
    PID="$(pid_of)"
    if [ -n "$PID" ]; then
      echo "  [运行中] KENTUCKY web  pid=$PID  监听 $HOST:$PORT"
      echo "  数据目录: $DATA_DIR"
      [ -f "$DATA_DIR/web-token.txt" ] && echo "  访问令牌: $(cat "$DATA_DIR/web-token.txt")"
    else
      echo "  [已停止] KENTUCKY web(端口 $PORT 未监听)"
    fi
    exit 0
    ;;
  logs)
    exec tail -f "$LOG"
    ;;
  start) ;;
  *) echo "未知参数: $1(可用: 无参=启动, status, stop, logs)"; exit 1 ;;
esac

if [ -n "$(pid_of)" ]; then
  echo "Web 服务已在运行:"
  exec "$0" status
fi

if [ ! -d out/renderer ] || [ ! -f out/web/serve.cjs ]; then
  echo "首次运行:构建渲染层与 Web 服务端 ..."
  npm run build && npm run build:web
fi

mkdir -p "$DATA_DIR"
setsid nohup node out/web/serve.cjs > "$LOG" 2>&1 < /dev/null &
sleep 2

if [ -z "$(pid_of)" ]; then
  echo "启动失败,日志末尾:"
  tail -20 "$LOG"
  exit 1
fi
echo "KENTUCKY 网页版已启动:"
"$0" status
echo
echo "本机验证:  curl http://$HOST:$PORT/api/health"
echo "首次访问:  浏览器打开 https://writer.tqledu.cn/?token=<上面的令牌>(令牌会存入浏览器 localStorage)"
