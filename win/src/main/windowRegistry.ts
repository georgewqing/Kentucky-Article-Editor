import type { BrowserWindow } from 'electron'

export type WindowRole = 'main' | 'float'

export interface WindowMeta {
  role: WindowRole
  /** Workspace this window is tied to (main reports; float fixed at create). */
  workspacePath: string | null
  /** Float: locked file path. */
  filePath?: string
}

const metaById = new Map<number, WindowMeta>()

export function setWindowMeta(win: BrowserWindow, meta: WindowMeta): void {
  metaById.set(win.id, meta)
}

export function getWindowMeta(win: BrowserWindow): WindowMeta | undefined {
  return metaById.get(win.id)
}

export function updateWindowMeta(win: BrowserWindow, patch: Partial<WindowMeta>): void {
  const cur = metaById.get(win.id)
  if (!cur) return
  metaById.set(win.id, { ...cur, ...patch })
}

export function removeWindowMeta(win: BrowserWindow): void {
  metaById.delete(win.id)
}

export function countMainWindows(all: BrowserWindow[]): number {
  let n = 0
  for (const w of all) {
    if (w.isDestroyed()) continue
    const m = metaById.get(w.id)
    if (m?.role === 'main') n += 1
  }
  return n
}

export function countMainWindowsWithWorkspace(all: BrowserWindow[], workspacePath: string): number {
  const key = workspacePath.replace(/\//g, '\\').toLowerCase()
  let n = 0
  for (const w of all) {
    if (w.isDestroyed()) continue
    const m = metaById.get(w.id)
    if (m?.role !== 'main' || !m.workspacePath) continue
    if (m.workspacePath.replace(/\//g, '\\').toLowerCase() === key) n += 1
  }
  return n
}

export function listWorkspaceRoots(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const meta of Array.from(metaById.values())) {
    if (!meta.workspacePath) continue
    const k = meta.workspacePath.replace(/\//g, '\\').toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(meta.workspacePath)
  }
  return out
}

export function floatWindowsForWorkspace(all: BrowserWindow[], workspacePath: string): BrowserWindow[] {
  const key = workspacePath.replace(/\//g, '\\').toLowerCase()
  const out: BrowserWindow[] = []
  for (const w of all) {
    if (w.isDestroyed()) continue
    const m = metaById.get(w.id)
    if (m?.role !== 'float' || !m.workspacePath) continue
    if (m.workspacePath.replace(/\//g, '\\').toLowerCase() === key) out.push(w)
  }
  return out
}
