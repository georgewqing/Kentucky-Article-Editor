/**
 * Main-process IPC sandbox: window workspace, dialog allowlists, navigation lock.
 */
import { BrowserWindow, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getWindowMeta } from './windowRegistry'
import {
  WorkspacePathError,
  assertInsideWorkspace,
  assertNotWorkspaceRoot,
  assertSafeWorkspaceRoot,
  isDialogReadAllowed,
  isDialogWriteAllowed,
  isMediaPathAllowed,
  resolveWorkspacePath,
  samePath
} from './ai/workspacePath'

export { WorkspacePathError }

export function senderWindow(e: IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win && !win.isDestroyed() ? win : null
}

export function senderWorkspaceOrNull(e: IpcMainInvokeEvent): string | null {
  const win = senderWindow(e)
  if (!win) return null
  const root = getWindowMeta(win)?.workspacePath
  return root ? resolve(root) : null
}

export function requireSenderWorkspace(e: IpcMainInvokeEvent, claimed?: string | null): string {
  const win = senderWindow(e)
  if (!win) throw new WorkspacePathError('No window')
  const root = getWindowMeta(win)?.workspacePath
  if (!root) throw new WorkspacePathError('No workspace')
  assertSafeWorkspaceRoot(root)
  if (claimed && claimed.trim() && !samePath(claimed, root)) {
    throw new WorkspacePathError('Workspace mismatch')
  }
  return resolve(root)
}

export function resolveInSenderWorkspace(e: IpcMainInvokeEvent, relOrAbs: string): string {
  return resolveWorkspacePath(requireSenderWorkspace(e), relOrAbs)
}

export function resolveWriteInSenderWorkspace(e: IpcMainInvokeEvent, relOrAbs: string): string {
  const root = requireSenderWorkspace(e)
  const abs = resolveWorkspacePath(root, relOrAbs)
  assertNotWorkspaceRoot(root, abs)
  return abs
}

/**
 * Readable for a given window: that window's workspace ∪ dialog read allowlist.
 * Does NOT fall through to other open workspaces (cross-window leak).
 */
export function assertReadableLocalPath(absPath: string, senderWorkspace?: string | null): void {
  const abs = resolve(absPath)
  if (senderWorkspace) {
    try {
      assertInsideWorkspace(senderWorkspace, abs)
      return
    } catch {
      /* allowlist */
    }
  }
  if (isDialogReadAllowed(abs)) return
  throw new WorkspacePathError('Path not allowed')
}

/** kentucky-file: only paths minted via toMediaUrl or a file-open dialog this session. */
export function assertProtocolReadable(absPath: string): void {
  const abs = resolve(absPath)
  if (isMediaPathAllowed(abs) || isDialogReadAllowed(abs)) return
  throw new WorkspacePathError('Path not allowed')
}

export function assertWritableLocalPath(absPath: string, senderWorkspace?: string | null): void {
  const abs = resolve(absPath)
  if (senderWorkspace) {
    try {
      assertInsideWorkspace(senderWorkspace, abs)
      return
    } catch {
      /* allowlist */
    }
  }
  if (isDialogWriteAllowed(abs)) return
  throw new WorkspacePathError('Path not allowed')
}

function rendererDir(): string {
  return resolve(join(__dirname, '../renderer'))
}

const APP_SHELL_PAGES = new Set(['index.html', 'splash.html', 'pdf-print.html'])

function isAppShellPathname(pathname: string): boolean {
  const norm = pathname.replace(/\\/g, '/')
  if (norm === '/' || norm === '') return true
  const last = norm.split('/').filter(Boolean).pop() || ''
  return APP_SHELL_PAGES.has(last)
}

function isRendererDevOrigin(url: URL): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (!dev) return false
  try {
    const allowed = new URL(dev)
    return url.protocol === allowed.protocol && url.host === allowed.host
  } catch {
    return false
  }
}

export function isAllowedNavigationUrl(url: string): boolean {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) {
    try {
      const u = new URL(url)
      if (!isRendererDevOrigin(u)) return false
      return isAppShellPathname(u.pathname)
    } catch {
      return false
    }
  }
  try {
    const u = new URL(url)
    if (u.protocol !== 'file:') return false
    const p = fileURLToPath(u)
    assertInsideWorkspace(rendererDir(), p)
    return isAppShellPathname(p.replace(/\\/g, '/'))
  } catch {
    return false
  }
}

export function bindNavigationGuard(wc: WebContents): void {
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url)) event.preventDefault()
  })
  wc.on('will-redirect', (event, url) => {
    if (!isAllowedNavigationUrl(url)) event.preventDefault()
  })
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      // Relative article links resolve to the Vite origin (`/ch.md`). Never dump those into the browser.
      if (isRendererDevOrigin(parsed)) return { action: 'deny' }
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(parsed.toString())
      }
    } catch {
      /* deny */
    }
    return { action: 'deny' }
  })
  wc.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
}
