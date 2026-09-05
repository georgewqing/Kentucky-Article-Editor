/**
 * KENTUCKY web server: serves the built React renderer over HTTP and bridges
 * the renderer's Platform RPC to the unchanged Electron main-process logic
 * (running under plain Node via server/electron-shim.ts).
 *
 * Routes:
 *   GET  /                 renderer static files (out/renderer)
 *   GET  /api/health       liveness
 *   GET  /api/boot         { defaultWorkspace, version, platform }
 *   GET  /api/media        stream workspace files (Range support) for <img>/<audio>/<video>
 *   GET  /api/download     same, with Content-Disposition: attachment
 *   POST /api/upload       raw file body -> <dir>/<name> (dir must be inside workspace)
 *   WS   /ws               IPC bridge: {type:'invoke',id,channel,args} / {type:'event',...}
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, statSync, createReadStream, writeFileSync, readFileSync } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join, resolve, basename, extname, normalize, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

// ---------- paths & env ----------

const APP_ROOT = process.env.KENTUCKY_APP_PATH || resolve(__dirname, '../..')
const DATA_DIR = process.env.KENTUCKY_DATA_DIR || '/raid/media/kentucky-data'
const RENDERER_DIR = join(APP_ROOT, 'out', 'renderer')
const WORKSPACE = process.env.KENTUCKY_WORKSPACE || join(DATA_DIR, 'workspace')
const HOST = process.env.KENTUCKY_WEB_HOST || '127.0.0.1'
const PORT = Number(process.env.KENTUCKY_WEB_PORT || 6081)

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(WORKSPACE, { recursive: true })

// Make main-process code that reads process.resourcesPath find repo/resources.
;(process as unknown as { resourcesPath: string }).resourcesPath = join(APP_ROOT, 'resources')
process.env.KENTUCKY_APP_PATH = APP_ROOT
process.env.KENTUCKY_DATA_DIR = DATA_DIR

// ---------- auth token ----------

function loadToken(): string {
  const p = join(DATA_DIR, 'web-token.txt')
  if (existsSync(p)) return readFileSync(p, 'utf8').trim()
  const t = randomBytes(18).toString('hex')
  writeFileSync(p, t + '\n', { mode: 0o600 })
  return t
}
const TOKEN = loadToken()

function urlOf(req: IncomingMessage): URL {
  return new URL(req.url || '/', 'http://localhost')
}
function authed(req: IncomingMessage): boolean {
  const u = urlOf(req)
  if (u.searchParams.get('token') === TOKEN) return true
  const auth = req.headers.authorization
  return !!auth && auth === `Bearer ${TOKEN}`
}

// ---------- boot main-process logic under the electron shim ----------

import { ipcMain, __setBridgeSend, BrowserWindow } from './electron-shim'
import { setWindowMeta } from '../src/main/windowRegistry'
import '../src/main/index' // side effect: registers all ipcMain handlers

import { attachWsServer, type WsConn } from './ws'

const connByWcId = new Map<number, WsConn>()
__setBridgeSend((wcId, channel, payload) => {
  connByWcId.get(wcId)?.sendJson({ type: 'event', channel, payload })
})

// ---------- helpers ----------

function isInside(root: string, p: string): boolean {
  const r = resolve(root)
  const x = resolve(p)
  return x === r || x.startsWith(r + sep)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8'
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Patch the renderer CSP so WebSocket and API calls to the same origin are allowed. */
function patchCsp(html: string): string {
  return html.replace("connect-src 'self' kentucky-file:", "connect-src 'self' ws: wss: kentucky-file:")
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const abs = normalize(join(RENDERER_DIR, rel))
  if (!abs.startsWith(RENDERER_DIR + sep) || !existsSync(abs) || !statSync(abs).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }
  const isHtml = abs.endsWith('.html')
  res.writeHead(200, {
    'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream'
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  if (isHtml) {
    res.end(patchCsp(readFileSync(abs, 'utf8')))
  } else {
    createReadStream(abs).pipe(res)
  }
}

function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  abs: string,
  download: boolean
): void {
  stat(abs)
    .then((st) => {
      if (!st.isFile()) throw new Error('not a file')
      const range = req.headers.range
      const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
      let start = 0
      let end = st.size - 1
      let status = 200
      if (m) {
        start = m[1] ? Number(m[1]) : 0
        end = m[2] ? Number(m[2]) : st.size - 1
        if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && start < st.size) {
          end = Math.min(end, st.size - 1)
          status = 206
        } else {
          start = 0
          end = st.size - 1
        }
      }
      const headers: Record<string, string | number> = {
        'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-cache'
      }
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`
      if (download) {
        headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(basename(abs))}`
      }
      res.writeHead(status, headers)
      if (req.method === 'HEAD') res.end()
      else createReadStream(abs, { start, end }).pipe(res)
    })
    .catch(() => {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    })
}

function handleUpload(req: IncomingMessage, res: ServerResponse, u: URL): void {
  const dirParam = u.searchParams.get('dir') || WORKSPACE
  const rawName = u.searchParams.get('name') || 'upload.bin'
  const name = basename(rawName).replace(/[^\w.\-一-龥]/g, '_')
  const absDir = resolve(dirParam)
  if (!isInside(WORKSPACE, absDir)) {
    sendJson(res, 403, { ok: false, error: 'Target dir is outside the workspace' })
    return
  }
  const chunks: Buffer[] = []
  let size = 0
  let aborted = false
  req.on('data', (c: Buffer) => {
    size += c.length
    if (size > 512 * 1024 * 1024) {
      aborted = true
      req.destroy()
      return
    }
    chunks.push(c)
  })
  req.on('end', async () => {
    if (aborted) return
    try {
      await mkdir(absDir, { recursive: true })
      const dest = join(absDir, name)
      await writeFile(dest, Buffer.concat(chunks))
      sendJson(res, 200, { ok: true, path: dest })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })
  req.on('error', () => {
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'upload failed' })
  })
}

// ---------- HTTP ----------

const server = createServer((req, res) => {
  const u = urlOf(req)
  const p = u.pathname

  if (p === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }
  if (p === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }
  if (p === '/api/boot') {
    if (!authed(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    sendJson(res, 200, { ok: true, defaultWorkspace: WORKSPACE, version: '0.3.2-web', platform: process.platform })
    return
  }
  if (p === '/api/media' || p === '/api/download') {
    if (!authed(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    const filePath = u.searchParams.get('path')
    if (!filePath || !isInside(WORKSPACE, filePath)) {
      sendJson(res, 403, { ok: false, error: 'path not allowed' })
      return
    }
    serveFile(req, res, resolve(filePath), p === '/api/download')
    return
  }
  if (p === '/api/upload' && req.method === 'POST') {
    if (!authed(req)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' })
      return
    }
    handleUpload(req, res, u)
    return
  }
  serveStatic(req, res, p)
})

// ---------- WebSocket IPC bridge ----------

attachWsServer(
  server,
  '/ws',
  (conn: WsConn, req) => {
    const u = urlOf(req)
    const role = u.searchParams.get('role') === 'float' ? 'float' : 'main'
    const workspacePath = u.searchParams.get('workspace') || WORKSPACE
    const filePath = u.searchParams.get('file') || null
    mkdirSync(workspacePath, { recursive: true })

    // Each browser tab looks like one BrowserWindow/webContents to the main logic.
    const win = new BrowserWindow({})
    setWindowMeta(win as unknown as Parameters<typeof setWindowMeta>[0], {
      role: role as 'main' | 'float',
      workspacePath,
      filePath
    })
    connByWcId.set(win.webContents.id, conn)

    conn.on('message', async (msg: { id?: number; channel?: string; args?: unknown[] }) => {
      if (typeof msg.id !== 'number' || typeof msg.channel !== 'string') return
      const fakeEvent = {
        sender: win.webContents,
        senderFrame: {},
        frameId: 1,
        processId: 0,
        defaultPrevented: false,
        preventDefault(): void {},
        reply(): void {}
      }
      try {
        const result = await ipcMain.__invoke(msg.channel, fakeEvent, Array.isArray(msg.args) ? msg.args : [])
        conn.sendJson({ type: 'result', id: msg.id, result })
      } catch (err) {
        conn.sendJson({
          type: 'result',
          id: msg.id,
          error: { message: err instanceof Error ? err.message : String(err) }
        })
      }
    })
    conn.on('close', () => {
      connByWcId.delete(win.webContents.id)
      win.destroy()
    })
  },
  (req) => urlOf(req).searchParams.get('token') === TOKEN
)

server.listen(PORT, HOST, () => {
  console.log(`KENTUCKY web server listening on http://${HOST}:${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
  console.log(`Login token (open http://<host>/?token=<token> once): ${TOKEN}`)
})
