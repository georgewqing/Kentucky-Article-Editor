#!/bin/bash
# KENTUCKY 在无显示器的 Linux(如 161 服务器)上的启动脚本。
# 使用 Xvfb 虚拟显示;受限容器环境下 Chromium 沙箱需 --no-sandbox。
# 用法:
#   ./run-headless.sh        若 out/ 不存在则先构建,然后后台运行(日志 /tmp/kentucky.log)
#   ./run-headless.sh --fg   前台运行,直接看实时日志
set -e
cd "$(dirname "$0")"

LOG=/tmp/kentucky.log
SCREEN="1920x1080x24"
ELECTRON_ARGS="--no-sandbox --remote-debugging-port=9222"

if [ ! -d out ]; then
  echo "out/ 不存在,先执行 npm run build ..."
  npm run build
fi

if [ "$1" = "--fg" ]; then
  exec xvfb-run -a -s "-screen 0 $SCREEN" \
    ./node_modules/.bin/electron $ELECTRON_ARGS .
fi

setsid nohup xvfb-run -a -s "-screen 0 $SCREEN" \
  ./node_modules/.bin/electron $ELECTRON_ARGS . \
  > "$LOG" 2>&1 < /dev/null &
echo "已后台启动,日志: $LOG"
echo "远程调试(仅绑定本机): http://127.0.0.1:9222"
