#!/bin/bash
# KENTUCKY 在无显示器的 Linux(如 161 服务器)上的一键启动脚本。
#
# 组件链:
#   Xvfb(虚拟显示 :99) → Electron 应用(--no-sandbox)
#     → x11vnc(5900,仅绑定本机,VNC 密码认证)
#     → websockify/noVNC(6080,仅绑定本机)
#     → Cloudflare 隧道 → 浏览器打开 writer.tqledu.cn
#
# 依赖(Debian/Ubuntu): apt install xvfb x11vnc novnc websockify x11-utils
# 用法:
#   ./run-headless.sh          后台启动全部组件(日志 /tmp/kentucky*.log)
#   ./run-headless.sh --fg     前台直接跑 electron(xvfb-run,调试用,不带 VNC 链路)
#   ./run-headless.sh status   查看各组件/端口状态
#   ./run-headless.sh stop     停止全部组件
set -u
cd "$(dirname "$0")"

DISPLAY_NUM=99
SCREEN="1920x1080x24"
VNC_PORT=5900
NOVNC_PORT=6080
CDP_PORT=9222
XAUTH_FILE=/tmp/kentucky-Xauthority
VNC_PASSWD="$HOME/.vnc/passwd"
NOVNC_WEB="$(pwd)/novnc-web"
ELECTRON_ARGS="--no-sandbox --remote-debugging-port=$CDP_PORT"

export DISPLAY=":$DISPLAY_NUM"
export XAUTHORITY="$XAUTH_FILE"

port_up() { ss -tln 2>/dev/null | grep -q ":$1 "; }

stop_all() {
  echo "停止 KENTUCKY 栈..."
  pkill -f 'node_modules/electron/dist/electron' 2>/dev/null || true
  pkill -f 'node_modules/.bin/electron' 2>/dev/null || true
  pkill -f "websockify.*$NOVNC_PORT" 2>/dev/null || true
  pkill -x x11vnc 2>/dev/null || true
  pkill -f "Xvfb :$DISPLAY_NUM" 2>/dev/null || true
  sleep 1
  echo "已停止。"
}

show_status() {
  local item label pat
  for item in "Xvfb:Xvfb :$DISPLAY_NUM" "Electron:electron/dist/electron" "x11vnc:^x11vnc" "websockify:websockify.*$NOVNC_PORT"; do
    label="${item%%:*}"; pat="${item#*:}"
    if pgrep -f "$pat" >/dev/null 2>&1; then echo "  [运行中] $label"; else echo "  [已停止] $label"; fi
  done
  local port
  for port in $CDP_PORT $VNC_PORT $NOVNC_PORT; do
    if port_up "$port"; then echo "  [监听]   端口 $port"; else echo "  [未监听] 端口 $port"; fi
  done
  if [ -f /tmp/vnc-password.txt ]; then echo "  VNC 密码: $(cat /tmp/vnc-password.txt)"; fi
}

case "${1:-start}" in
  stop)
    stop_all
    exit 0
    ;;
  status)
    show_status
    exit 0
    ;;
  --fg)
    if [ ! -d out ]; then echo "out/ 不存在,先执行 npm run build ..."; npm run build; fi
    exec xvfb-run -a -s "-screen 0 $SCREEN" \
      ./node_modules/.bin/electron $ELECTRON_ARGS .
    ;;
  start) ;;
  *) echo "未知参数: $1(可用: 无参=启动, --fg, status, stop)"; exit 1 ;;
esac

# ---------- 后台启动全部组件 ----------
if [ ! -d out ]; then echo "out/ 不存在,先执行 npm run build ..."; npm run build; fi

if port_up "$NOVNC_PORT"; then
  echo "端口 $NOVNC_PORT 已在监听,KENTUCKY 栈看起来已在运行:"
  show_status
  exit 0
fi
stop_all  # 清理可能的残留进程

# 0) 依赖检查
for bin in Xvfb x11vnc websockify xauth mcookie; do
  command -v "$bin" >/dev/null || { echo "缺少依赖 $bin,请先: apt install xvfb x11vnc novnc websockify x11-utils"; exit 1; }
done

# 1) 首次运行自动生成 VNC 密码(VNC 协议密码最长 8 位)
if [ ! -f "$VNC_PASSWD" ]; then
  mkdir -p "$HOME/.vnc"
  PASS="$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 8)"
  x11vnc -storepasswd "$PASS" "$VNC_PASSWD" >/dev/null
  chmod 600 "$VNC_PASSWD"
  echo "$PASS" > /tmp/vnc-password.txt
  chmod 600 /tmp/vnc-password.txt
  echo "首次启动:已生成 VNC 访问密码 $PASS(同时存于 /tmp/vnc-password.txt)"
fi

# 2) noVNC 网页根目录(符号链接到系统 noVNC,外加自动跳转的 index.html)
mkdir -p "$NOVNC_WEB"
ln -sf /usr/share/novnc/* "$NOVNC_WEB"/ 2>/dev/null || true
[ -e "$NOVNC_WEB/vnc.html" ] || { echo "缺少 noVNC 网页文件(/usr/share/novnc),请 apt install novnc"; exit 1; }

# 3) Xvfb 虚拟显示
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"
xauth -f "$XAUTH_FILE" add ":$DISPLAY_NUM" MIT-MAGIC-COOKIE-1 "$(mcookie)"
setsid nohup Xvfb ":$DISPLAY_NUM" -screen 0 "$SCREEN" -nolisten tcp -auth "$XAUTH_FILE" \
  > /tmp/kentucky-xvfb.log 2>&1 < /dev/null &
sleep 1

# 4) Electron 应用
setsid nohup ./node_modules/.bin/electron $ELECTRON_ARGS . \
  > /tmp/kentucky.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do port_up "$CDP_PORT" && break; sleep 1; done
port_up "$CDP_PORT" || { echo "Electron 未在 30 秒内起来,见 /tmp/kentucky.log"; exit 1; }

# 5) x11vnc(-localhost: 只允许本机连接,由 websockify 转发)
x11vnc -display ":$DISPLAY_NUM" -auth "$XAUTH_FILE" -forever -shared -localhost \
  -rfbauth "$VNC_PASSWD" -rfbport "$VNC_PORT" -repeat -bg -o /tmp/x11vnc.log
sleep 1

# 6) websockify/noVNC 网页网关
setsid nohup websockify --web="$NOVNC_WEB" "127.0.0.1:$NOVNC_PORT" "127.0.0.1:$VNC_PORT" \
  > /tmp/websockify.log 2>&1 < /dev/null &
sleep 1
port_up "$NOVNC_PORT" || { echo "websockify 未起来,见 /tmp/websockify.log"; exit 1; }

echo "KENTUCKY 栈已启动:"
show_status
echo "本机验证:   curl http://127.0.0.1:$NOVNC_PORT/vnc.html"
echo "浏览器访问(经 Cloudflare 隧道): https://writer.tqledu.cn/"
