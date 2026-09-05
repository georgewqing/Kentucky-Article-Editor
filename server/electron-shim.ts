/**
 * Minimal Electron API shim for running the KENTUCKY main-process logic
 * (fs/doc/git/ai/storyboard services) inside a plain Node web server.
 *
 * Only the surface actually imported by src/main is implemented:
 *   app, ipcMain, BrowserWindow (+ webContents), dialog, shell, Menu,
 *   net, protocol, nativeImage, nativeTheme, safeStorage.
 *
 * BrowserWindow/webContents objects are event emitters that the IPC bridge
 * (server/serve.ts) attaches per WebSocket connection: webContents.send()
 * routes events back to the owning browser tab.
 */
import { EventEmitter } from 'node:events'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

function dataDir(): string {
  const d = process.env.KENTUCKY_DATA_DIR || '/raid/media/kentucky-data'
  mkdirSync(d, { recursive: true })
  return d
}

// ---------------- app ----------------

class AppShim extends EventEmitter {
  isPackaged = false
  name = 'KENTUCKY'

  getVersion(): string {
    return process.env.KENTUCKY_APP_VERSION || '0.3.2-web'
  }
  getName(): string {
    return 'kentucky'
  }
  getAppPath(): string {
    return process.env.KENTUCKY_APP_PATH || process.cwd()
  }
  getPath(name: string): string {
    const root = dataDir()
    let p: string
    switch (name) {
      case 'home':
        p = homedir()
        break
      case 'temp':
      case 'tmp':
        p = tmpdir()
        break
      case 'userData':
      case 'appData':
        p = join(root, 'userData')
        break
      case 'documents':
        p = join(root, 'workspace')
        break
      case 'downloads':
        p = join(root, 'workspace', '.exports')
        break
      default:
        p = join(root, name)
    }
    mkdirSync(p, { recursive: true })
    return p
  }
  whenReady(): Promise<void> {
    return Promise.resolve()
  }
  isReady(): boolean {
    return true
  }
  requestSingleInstanceLock(): boolean {
    return true
  }
  quit(): void {
    /* web server keeps running; window lifecycle must not kill the process */
  }
  exit(): void {
    /* same as quit */
  }
  relaunch(): void {}
  setAppUserModelId(): void {}
  disableHardwareAcceleration(): void {}
  commandLine = {
    appendSwitch(): void {},
    appendArgument(): void {}
  }
}

export const app = new AppShim()

// ---------------- ipcMain ----------------

export type IpcInvokeHandler = (event: unknown, ...args: unknown[]) => unknown

const invokeHandlers = new Map<string, IpcInvokeHandler>()
const onHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

export const ipcMain = {
  handle(channel: string, fn: IpcInvokeHandler): void {
    invokeHandlers.set(channel, fn)
  },
  removeHandler(channel: string): void {
    invokeHandlers.delete(channel)
  },
  on(channel: string, fn: (...args: unknown[]) => void): void {
    let set = onHandlers.get(channel)
    if (!set) {
      set = new Set()
      onHandlers.set(channel, set)
    }
    set.add(fn)
  },
  removeListener(channel: string, fn: (...args: unknown[]) => void): void {
    onHandlers.get(channel)?.delete(fn)
  },
  async __invoke(channel: string, event: unknown, args: unknown[]): Promise<unknown> {
    const h = invokeHandlers.get(channel)
    if (!h) throw new Error(`No IPC handler registered for "${channel}"`)
    return h(event, ...(Array.isArray(args) ? args : []))
  }
}

// ---------------- BrowserWindow / webContents ----------------

type BridgeSend = (wcId: number, channel: string, payload: unknown) => void
let bridgeSend: BridgeSend = () => {}

/** Called by server/serve.ts to wire webContents.send -> WebSocket connection. */
export function __setBridgeSend(fn: BridgeSend): void {
  bridgeSend = fn
}

let nextWcId = 100
let nextWinId = 100
const wcById = new Map<number, WebContentsShim>()
const winByWcId = new Map<number, BrowserWindowShim>()
const allWins: BrowserWindowShim[] = []

class WebContentsShim extends EventEmitter {
  id: number
  win: BrowserWindowShim
  session = {
    setPermissionRequestHandler(): void {},
    setPermissionCheckHandler(): void {},
    webRequest: {
      onBeforeSendHeaders(): void {},
      onHeadersReceived(): void {}
    }
  }
  private destroyed = false

  constructor(win: BrowserWindowShim) {
    super()
    this.id = nextWcId++
    this.win = win
    wcById.set(this.id, this)
  }

  send(channel: string, payload?: unknown): void {
    if (this.destroyed) return
    bridgeSend(this.id, channel, payload)
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  isLoading(): boolean {
    return false
  }
  async executeJavaScript(): Promise<null> {
    return null
  }
  async loadURL(): Promise<void> {}
  async loadFile(): Promise<void> {}
  async printToPDF(): Promise<Buffer> {
    throw new Error('printToPDF is unavailable in the web server build')
  }
  undo(): void {}
  redo(): void {}
  cut(): void {}
  copy(): void {}
  paste(): void {}
  selectAll(): void {}
  reload(): void {}
  invalidate(): void {}
  setZoomLevel(): void {}
  getZoomLevel(): number {
    return 0
  }
  setWindowOpenHandler(): void {}
  openDevTools(): void {}
  closeDevTools(): void {}
  toggleDevTools(): void {}

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    wcById.delete(this.id)
    this.emit('destroyed')
    this.removeAllListeners()
  }
}

class BrowserWindowShim extends EventEmitter {
  id: number
  webContents: WebContentsShim
  private destroyed = false

  constructor(_opts?: Record<string, unknown>) {
    super()
    this.id = nextWinId++
    this.webContents = new WebContentsShim(this)
    winByWcId.set(this.webContents.id, this)
    allWins.push(this)
  }

  static getAllWindows(): BrowserWindowShim[] {
    return allWins.filter((w) => !w.destroyed)
  }
  static fromWebContents(wc: { id?: number } | null | undefined): BrowserWindowShim | null {
    if (!wc || typeof wc.id !== 'number') return null
    return winByWcId.get(wc.id) ?? null
  }

  isDestroyed(): boolean {
    return this.destroyed
  }
  /** Mirrors Electron: fires 'close'; destruction proceeds unless preventDefault(). */
  close(): void {
    if (this.destroyed) return
    const ev = { defaultPrevented: false, preventDefault(): void { this.defaultPrevented = true } }
    this.emit('close', ev)
    if (!ev.defaultPrevented) this.destroy()
  }
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    winByWcId.delete(this.webContents.id)
    const i = allWins.indexOf(this)
    if (i >= 0) allWins.splice(i, 1)
    this.webContents.destroy()
    this.emit('closed')
    this.removeAllListeners()
  }

  show(): void {}
  hide(): void {}
  focus(): void {}
  blur(): void {}
  minimize(): void {}
  restore(): void {}
  maximize(): void {}
  unmaximize(): void {}
  setFullScreen(): void {}
  isFullScreen(): boolean {
    return false
  }
  isMinimized(): boolean {
    return false
  }
  isVisible(): boolean {
    return true
  }
  isFocused(): boolean {
    return true
  }
  isMaximized(): boolean {
    return false
  }
  setTitle(): void {}
  getTitle(): string {
    return 'KENTUCKY'
  }
  setBackgroundColor(): void {}
  setTitleBarOverlay(): void {}
  setMenuBarVisibility(): void {}
  setAutoHideMenuBar(): void {}
  autoHideMenuBar = false
  setBounds(): void {}
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 1280, height: 800 }
  }
  setSize(): void {}
  getSize(): [number, number] {
    return [1280, 800]
  }
  setContentSize(): void {}
  getContentSize(): [number, number] {
    return [1280, 800]
  }
  setMinimumSize(): void {}
  setMaximumSize(): void {}
  setIcon(): void {}
  async loadURL(): Promise<void> {}
  async loadFile(): Promise<void> {}
}

export const BrowserWindow = BrowserWindowShim

export const webContents = {
  fromId(id: number): WebContentsShim | null {
    return wcById.get(id) ?? null
  },
  getAllWebContents(): WebContentsShim[] {
    return [...wcById.values()]
  }
}

// ---------------- dialog / shell / Menu / protocol / images / theme ----------------

export const dialog = {
  async showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return { canceled: true, filePaths: [] }
  },
  async showSaveDialog(): Promise<{ canceled: boolean; filePath?: string }> {
    return { canceled: true, filePath: undefined }
  },
  async showMessageBox(): Promise<{ response: number; checkboxChecked: boolean }> {
    return { response: 0, checkboxChecked: false }
  },
  showErrorBox(): void {}
}

export const shell = {
  async openExternal(url: string): Promise<void> {
    console.log(`[shell.openExternal] ${url}`)
  },
  async openPath(): Promise<string> {
    return ''
  },
  showItemInFolder(): void {},
  async trashItem(): Promise<void> {}
}

const noopMenuItem = {
  popup(): void {},
  closePopup(): void {},
  destroy(): void {},
  append(): void {},
  items: []
}

export const Menu = {
  buildFromTemplate(): typeof noopMenuItem {
    return noopMenuItem
  },
  setApplicationMenu(): void {},
  getApplicationMenu(): null {
    return null
  }
}

export const protocol = {
  registerSchemesAsPrivileged(): void {},
  handle(): void {},
  registerFileProtocol(): void {},
  unregisterProtocol(): void {}
}

const emptyImage = {
  isEmpty(): boolean {
    return true
  },
  resize(): typeof emptyImage {
    return emptyImage
  },
  toDataURL(): string {
    return ''
  },
  toPNG(): Buffer {
    return Buffer.alloc(0)
  }
}

export const nativeImage = {
  createFromPath(): typeof emptyImage {
    return emptyImage
  },
  createFromDataURL(): typeof emptyImage {
    return emptyImage
  },
  createEmpty(): typeof emptyImage {
    return emptyImage
  }
}

export const nativeTheme = {
  themeSource: 'dark' as string,
  shouldUseDarkColors: false,
  on(): void {},
  once(): void {}
}

// ---------------- safeStorage (AES-256-GCM with a local key file) ----------------

let safeStorageKey: Buffer | null = null

function getSafeStorageKey(): Buffer {
  if (safeStorageKey) return safeStorageKey
  const keyPath = join(dataDir(), 'safe-storage.key')
  if (existsSync(keyPath)) {
    safeStorageKey = readFileSync(keyPath)
  } else {
    safeStorageKey = randomBytes(32)
    writeFileSync(keyPath, safeStorageKey, { mode: 0o600 })
  }
  return safeStorageKey
}

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return true
  },
  encryptString(plain: string): Buffer {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', getSafeStorageKey(), iv)
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ct])
  },
  decryptString(buf: Buffer): string {
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', getSafeStorageKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }
}

// ---------------- net (global fetch) ----------------

export const net = {
  fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
    return globalThis.fetch(url, init as RequestInit)
  },
  request(): never {
    throw new Error('net.request is not supported in the web server build')
  }
}
