import { create } from 'zustand'
import type { DocSnapshot, FileEntry, WindowRole } from '@/platform'
import { getPlatform } from '@/platform'
import { createEmptyKMind, serializeKMind, assetsDirForKmind, type KMindNodeLink } from '@/editors/kmind'
import { contentIsDirty } from '../../../common/kmindDirty'
import { flushActiveMindmapViewport } from '@/editors/mindmapViewportFlush'
import { flushActiveDialogueSidecars } from '@/editors/dialogueSidecarFlush'
import {
  emptyDialogueCsv,
  isDialoguePath,
  isCharactersPath,
  dialogueMetaPathFor,
  dialogueChoicesPathFor,
  dialogueLayoutPathFor,
  serializeDialogueFileMeta,
  dialogueFileNameFromMeta
} from '@/editors/dialogueCsv'
import i18n from '@/i18n'
import { askUnsavedConfirm } from '@/state/unsavedDialogStore'

export type EditorKind = 'text' | 'mindmap' | 'dialogue' | 'characters'
export type ActiveView = 'explorer' | 'settings' | 'home'

export interface LinePickSession {
  mindmapTabId: string
  nodeId: string
  targetPath: string
  fileRel: string
  /** Write back to node.title link vs noteLink. */
  linkTarget: 'node' | 'note'
}

export interface LinePickResult {
  mindmapTabId: string
  nodeId: string
  link: KMindNodeLink
  linkTarget: 'node' | 'note'
}

export interface LineFlashRequest {
  path: string
  line: number
  nonce: number
}

export interface OpenTab {
  id: string
  path: string
  title: string
  kind: EditorKind
  content: string
  originalContent: string
  dirty: boolean
  /** New/unsaved creation (Cursor-like blue tab mark). Cleared on save. */
  isNew?: boolean
  /** Last applied DocumentHub revision (echo prevention). */
  docRev: number
}

export interface RecentWorkspace {
  path: string
  lastOpened: number
}

/** Parked / open project folder in this window (activity-bar multi-root). */
export interface WorkspaceSession {
  id: string
  path: string
  fileTree: FileEntry[]
  tabs: OpenTab[]
  activeTabId: string | null
  splitTabId: string | null
  splitEnabled: boolean
  lineFlash: LineFlashRequest | null
  linePickSession: LinePickSession | null
  linePickResult: LinePickResult | null
}

export type Toast = { id: number; message: string; type: 'error' | 'info' } | null

/** True while applying a remote DocumentHub snapshot (skip doc:patch echo). */
let applyingFromHub = false

interface AppState {
  windowRole: WindowRole
  workspacePath: string | null
  fileTree: FileEntry[]
  sidebarVisible: boolean
  sidebarWidth: number
  activeView: ActiveView
  tabs: OpenTab[]
  activeTabId: string | null
  splitTabId: string | null
  splitEnabled: boolean
  recentFolders: RecentWorkspace[]
  toast: Toast
  lineFlash: LineFlashRequest | null
  linePickSession: LinePickSession | null
  linePickResult: LinePickResult | null
  /** All open project folders in this window. */
  openWorkspaces: WorkspaceSession[]
  activeWorkspaceId: string | null

  setWindowRole: (role: WindowRole) => void
  setSidebarVisible: (v: boolean) => void
  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  setActiveView: (v: ActiveView) => void
  showToast: (message: string, type?: 'error' | 'info') => void
  clearToast: () => void

  loadRecent: () => void
  addRecent: (path: string) => void
  removeRecent: (path: string) => void

  openWorkspace: (path: string) => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  addWorkspaceViaDialog: () => Promise<void>
  refreshTree: () => Promise<void>
  closeWorkspace: () => Promise<void>
  closeWorkspaceById: (id: string) => Promise<void>

  openFile: (path: string, opts?: { line?: number }) => Promise<void>
  applyDocSnapshot: (snap: DocSnapshot) => void
  clearLineFlash: () => void
  beginLinePick: (opts: {
    mindmapTabId: string
    nodeId: string
    fileAbs: string
    fileRel: string
    linkTarget?: 'node' | 'note'
  }) => Promise<void>
  confirmLinePick: (line: number) => void
  cancelLinePick: () => void
  clearLinePickResult: () => void
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  /** Apply AI edit without switching the active tab (no focus flash). */
  applyAiFileEdit: (opts: {
    absPath: string
    content: string
    before: string
    writeDisk: boolean
    isNew?: boolean
  }) => Promise<void>
  saveTab: (id?: string) => Promise<boolean>
  discardTab: (id: string) => Promise<void>
  closeTab: (id: string, force?: boolean) => Promise<boolean>
  handleWindowCloseRequest: () => Promise<void>
  enableSplit: (tabId?: string) => void
  disableSplit: () => void
  setSplitTab: (id: string) => void

  createFile: (name: string, parentDir?: string) => Promise<void>
  createFolder: (name: string, parentDir?: string) => Promise<void>
  createMindMap: (name: string, parentDir?: string) => Promise<void>
  createDialogue: (
    opts: { godotScene: string; dialogueId: string; fileName?: string },
    parentDir?: string
  ) => Promise<void>
  renameEntry: (targetPath: string, newName: string) => Promise<void>
  /** Move a file/folder into destDir (same basename). */
  moveEntry: (sourcePath: string, destDir: string) => Promise<void>
  deleteEntry: (targetPath: string) => Promise<void>

  spawnNewWindow: () => Promise<void>
  spawnNewMainWindow: () => Promise<void>
}

const RECENT_KEY = 'kentucky.recentFolders'

function detectKind(path: string): EditorKind {
  if (isDialoguePath(path)) return 'dialogue'
  if (isCharactersPath(path)) return 'characters'
  return getPlatform().extname(path) === '.kmind' ? 'mindmap' : 'text'
}

function tabIdFor(path: string): string {
  return path
}

function parseRecent(raw: string): RecentWorkspace[] {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) return []
  if (data.length > 0 && typeof data[0] === 'string') {
    const now = Date.now()
    return (data as string[]).map((path, i) => ({
      path,
      lastOpened: now - i
    }))
  }
  return (data as RecentWorkspace[])
    .filter((x) => x && typeof x.path === 'string')
    .map((x) => ({
      path: x.path,
      lastOpened: typeof x.lastOpened === 'number' ? x.lastOpened : Date.now()
    }))
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

/** Best-effort rename/delete of dialogue sidecar files (meta, choices, layout). */
async function syncDialogueSidecars(
  oldCsvPath: string,
  newCsvPath: string | null
): Promise<void> {
  const platform = getPlatform()
  const pairs = [
    [dialogueMetaPathFor(oldCsvPath), newCsvPath ? dialogueMetaPathFor(newCsvPath) : null],
    [dialogueChoicesPathFor(oldCsvPath), newCsvPath ? dialogueChoicesPathFor(newCsvPath) : null],
    [dialogueLayoutPathFor(oldCsvPath), newCsvPath ? dialogueLayoutPathFor(newCsvPath) : null]
  ] as const
  for (const [oldPath, newPath] of pairs) {
    try {
      if (!(await platform.exists(oldPath))) continue
      if (!newPath) {
        await platform.delete(oldPath)
        continue
      }
      if (await platform.exists(newPath)) {
        await platform.delete(oldPath)
      } else {
        await platform.rename(oldPath, newPath)
      }
    } catch {
      /* best-effort */
    }
  }
}

function newWorkspaceId(): string {
  return crypto.randomUUID()
}

function emptySessionFields(path: string, fileTree: FileEntry[] = []): Omit<WorkspaceSession, 'id'> {
  return {
    path,
    fileTree,
    tabs: [],
    activeTabId: null,
    splitTabId: null,
    splitEnabled: false,
    lineFlash: null,
    linePickSession: null,
    linePickResult: null
  }
}

function snapshotActiveSession(s: {
  activeWorkspaceId: string | null
  workspacePath: string | null
  fileTree: FileEntry[]
  tabs: OpenTab[]
  activeTabId: string | null
  splitTabId: string | null
  splitEnabled: boolean
  lineFlash: LineFlashRequest | null
  linePickSession: LinePickSession | null
  linePickResult: LinePickResult | null
  openWorkspaces: WorkspaceSession[]
}): WorkspaceSession[] {
  const id = s.activeWorkspaceId
  const path = s.workspacePath
  if (!id || !path) return s.openWorkspaces
  const snap: WorkspaceSession = {
    id,
    path,
    fileTree: s.fileTree,
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    splitTabId: s.splitTabId,
    splitEnabled: s.splitEnabled,
    lineFlash: s.lineFlash,
    linePickSession: s.linePickSession,
    linePickResult: s.linePickResult
  }
  const idx = s.openWorkspaces.findIndex((w) => w.id === id)
  if (idx < 0) return [...s.openWorkspaces, snap]
  const next = s.openWorkspaces.slice()
  next[idx] = snap
  return next
}

function mirrorsFromSession(session: WorkspaceSession): {
  workspacePath: string
  fileTree: FileEntry[]
  tabs: OpenTab[]
  activeTabId: string | null
  splitTabId: string | null
  splitEnabled: boolean
  lineFlash: LineFlashRequest | null
  linePickSession: LinePickSession | null
  linePickResult: LinePickResult | null
  activeWorkspaceId: string
} {
  return {
    workspacePath: session.path,
    fileTree: session.fileTree,
    tabs: session.tabs,
    activeTabId: session.activeTabId,
    splitTabId: session.splitTabId,
    splitEnabled: session.splitEnabled,
    lineFlash: session.lineFlash,
    linePickSession: session.linePickSession,
    linePickResult: session.linePickResult,
    activeWorkspaceId: session.id
  }
}

async function notifyWorkspaceChanged(path: string | null): Promise<void> {
  const { useAiStore } = await import('@/state/aiStore')
  await useAiStore.getState().onWorkspaceChanged(path)
}

/** Guard against stacked close-request while dialog is open. */
let windowCloseBusy = false

export const useAppStore = create<AppState>((set, get) => ({
  windowRole: 'main',
  workspacePath: null,
  fileTree: [],
  sidebarVisible: true,
  sidebarWidth: 260,
  activeView: 'explorer',
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  splitEnabled: false,
  recentFolders: [],
  toast: null,
  lineFlash: null,
  linePickSession: null,
  linePickResult: null,
  openWorkspaces: [],
  activeWorkspaceId: null,

  setWindowRole: (role) => set({ windowRole: role }),
  setSidebarVisible: (v) => set({ sidebarVisible: v }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.min(480, Math.max(160, w)) }),
  setActiveView: (v) => set({ activeView: v }),

  showToast: (message, type = 'error') => {
    const id = Date.now()
    set({ toast: { id, message, type } })
    window.setTimeout(() => {
      const cur = get().toast
      if (cur?.id === id) set({ toast: null })
    }, 3500)
  },
  clearToast: () => set({ toast: null }),

  loadRecent: () => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) set({ recentFolders: parseRecent(raw) })
    } catch {
      set({ recentFolders: [] })
    }
  },

  addRecent: (path) => {
    const now = Date.now()
    const next = [
      { path, lastOpened: now },
      ...get().recentFolders.filter((p) => p.path !== path)
    ].slice(0, 12)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    set({ recentFolders: next })
  },

  removeRecent: (path) => {
    const next = get().recentFolders.filter((p) => p.path !== path)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    set({ recentFolders: next })
  },

  openWorkspace: async (path) => {
    const platform = getPlatform()
    const existing = get().openWorkspaces.find((w) => pathsEqual(w.path, path))
    if (existing) {
      await get().switchWorkspace(existing.id)
      get().addRecent(path)
      return
    }
    try {
      const tree = await platform.readDir(path)
      get().addRecent(path)
      const id = newWorkspaceId()
      const session: WorkspaceSession = { id, ...emptySessionFields(path, tree) }
      const parked = snapshotActiveSession(get())
      set({
        openWorkspaces: [...parked, session],
        ...mirrorsFromSession(session),
        activeView: 'explorer',
        sidebarVisible: true
      })
      if (get().windowRole === 'main') {
        void platform.reportWorkspace(path)
      }
      void notifyWorkspaceChanged(path)
    } catch {
      get().showToast(i18n.t('errors.loadTreeFailed'))
    }
  },

  switchWorkspace: async (id) => {
    const state = get()
    if (state.activeWorkspaceId === id) {
      set({ activeView: 'explorer', sidebarVisible: true })
      return
    }
    const parked = snapshotActiveSession(state)
    const target = parked.find((w) => w.id === id)
    if (!target) return
    set({
      openWorkspaces: parked,
      ...mirrorsFromSession(target),
      activeView: 'explorer',
      sidebarVisible: true
    })
    if (get().windowRole === 'main') {
      void getPlatform().reportWorkspace(target.path)
    }
    void notifyWorkspaceChanged(target.path)
  },

  addWorkspaceViaDialog: async () => {
    const path = await getPlatform().openFolder()
    if (path) await get().openWorkspace(path)
  },

  refreshTree: async () => {
    const { workspacePath } = get()
    if (!workspacePath) return
    try {
      const tree = await getPlatform().readDir(workspacePath)
      set({ fileTree: tree })
    } catch {
      get().showToast(i18n.t('errors.loadTreeFailed'))
    }
  },

  closeWorkspace: async () => {
    const id = get().activeWorkspaceId
    if (!id) return
    await get().closeWorkspaceById(id)
  },

  closeWorkspaceById: async (id) => {
    if (get().activeWorkspaceId !== id) {
      await get().switchWorkspace(id)
      if (get().activeWorkspaceId !== id) return
    }

    const dirtyTabs = get().tabs.filter((t) => t.dirty)
    if (dirtyTabs.length > 0) {
      const name = dirtyTabs.length === 1 ? dirtyTabs[0].title : undefined
      const choice = await askUnsavedConfirm({ fileName: name })
      if (choice === 'cancel') return
      if (choice === 'save') {
        for (const tab of dirtyTabs) {
          const ok = await get().saveTab(tab.id)
          if (!ok) return
        }
      } else {
        for (const tab of dirtyTabs) {
          await get().discardTab(tab.id)
        }
      }
    }
    for (const tab of get().tabs) {
      void getPlatform().docUnsubscribe(tab.path)
    }

    const list = get().openWorkspaces
    const idx = list.findIndex((w) => w.id === id)
    const remaining = list.filter((w) => w.id !== id)

    if (remaining.length === 0) {
      set({
        openWorkspaces: [],
        activeWorkspaceId: null,
        workspacePath: null,
        fileTree: [],
        tabs: [],
        activeTabId: null,
        splitTabId: null,
        splitEnabled: false,
        activeView: 'home',
        lineFlash: null,
        linePickSession: null,
        linePickResult: null
      })
      if (get().windowRole === 'main') {
        void getPlatform().reportWorkspace(null)
      }
      void notifyWorkspaceChanged(null)
      return
    }

    const nextIdx = idx < 0 ? remaining.length - 1 : Math.min(idx, remaining.length - 1)
    const next = remaining[nextIdx]
    set({
      openWorkspaces: remaining,
      ...mirrorsFromSession(next),
      activeView: 'explorer',
      sidebarVisible: true
    })
    if (get().windowRole === 'main') {
      void getPlatform().reportWorkspace(next.path)
    }
    void notifyWorkspaceChanged(next.path)
  },

  openFile: async (path, opts) => {
    const { windowRole, tabs } = get()
    if (windowRole === 'float' && tabs.length > 0 && !pathsEqual(tabs[0].path, path)) {
      return
    }

    const lineRaw = opts?.line
    const line =
      typeof lineRaw === 'number' && Number.isFinite(lineRaw) && lineRaw >= 1
        ? Math.floor(lineRaw)
        : undefined
    if (line !== undefined) {
      set({
        lineFlash: { path, line, nonce: Date.now() }
      })
    }
    const existing = get().tabs.find((t) => pathsEqual(t.path, path))
    if (existing) {
      set({ activeTabId: existing.id, activeView: 'explorer' })
      void getPlatform().docOpen(path)
      return
    }
    const platform = getPlatform()
    try {
      const snap = await platform.docOpen(path)
      if (!snap) {
        get().showToast(i18n.t('errors.openFailed'))
        return
      }
      const tab: OpenTab = {
        id: tabIdFor(snap.path),
        path: snap.path,
        title: platform.basename(snap.path),
        kind: detectKind(snap.path),
        content: snap.content,
        originalContent: snap.originalContent,
        dirty: snap.dirty,
        docRev: snap.rev
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        activeView: 'explorer'
      }))
    } catch {
      get().showToast(i18n.t('errors.openFailed'))
    }
  },

  applyDocSnapshot: (snap) => {
    applyingFromHub = true
    try {
      set((s) => {
        const idx = s.tabs.findIndex((t) => pathsEqual(t.path, snap.path))
        if (idx < 0) return s
        const tab = s.tabs[idx]
        if (snap.rev <= tab.docRev && tab.content === snap.content && tab.dirty === snap.dirty && !tab.isNew) {
          return s
        }
        const next = [...s.tabs]
        next[idx] = {
          ...tab,
          content: snap.content,
          originalContent: tab.isNew || tab.dirty ? tab.originalContent : snap.originalContent,
          dirty: tab.isNew ? true : tab.dirty ? true : snap.dirty,
          isNew: Boolean(tab.isNew),
          docRev: snap.rev
        }
        return { tabs: next }
      })
    } finally {
      applyingFromHub = false
    }
  },

  clearLineFlash: () => set({ lineFlash: null }),

  beginLinePick: async ({ mindmapTabId, nodeId, fileAbs, fileRel, linkTarget = 'node' }) => {
    await get().openFile(fileAbs)
    const fileTabId = tabIdFor(fileAbs)
    if (!get().tabs.some((t) => t.id === fileTabId)) return
    set({
      linePickSession: {
        mindmapTabId,
        nodeId,
        targetPath: fileAbs,
        fileRel,
        linkTarget
      },
      linePickResult: null,
      activeTabId: mindmapTabId,
      splitEnabled: true,
      splitTabId: fileTabId,
      activeView: 'explorer'
    })
  },

  confirmLinePick: (line) => {
    const session = get().linePickSession
    if (!session) return
    const n = Math.floor(line)
    if (!Number.isFinite(n) || n < 1) return
    set({
      linePickSession: null,
      linePickResult: {
        mindmapTabId: session.mindmapTabId,
        nodeId: session.nodeId,
        link: { path: session.fileRel, kind: 'line', line: n },
        linkTarget: session.linkTarget
      },
      splitEnabled: false,
      splitTabId: null,
      activeTabId: session.mindmapTabId,
      activeView: 'explorer'
    })
  },

  cancelLinePick: () => {
    const session = get().linePickSession
    set({
      linePickSession: null,
      splitEnabled: false,
      splitTabId: null,
      ...(session ? { activeTabId: session.mindmapTabId, activeView: 'explorer' as const } : {})
    })
  },

  clearLinePickResult: () => set({ linePickResult: null }),

  setActiveTab: (id) => set({ activeTabId: id, activeView: 'explorer' }),

  updateTabContent: (id, content) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    const dirty = contentIsDirty(tab.path, content, tab.originalContent)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              content,
              dirty,
              isNew: t.isNew && content !== t.originalContent ? t.isNew : t.isNew
            }
          : t
      )
    }))
    if (!applyingFromHub) {
      void getPlatform()
        .docPatch(tab.path, content)
        .then((snap) => {
          if (!snap) return
          // Recompute dirty locally — do not trust hub snap.dirty alone (viewport-only
          // must stay clean; stale main bundles used to overwrite with true).
          set((s) => ({
            tabs: s.tabs.map((t) => {
              if (!pathsEqual(t.path, snap.path)) return t
              return {
                ...t,
                docRev: snap.rev,
                dirty: contentIsDirty(t.path, t.content, t.originalContent),
                isNew: contentIsDirty(t.path, t.content, t.originalContent) ? t.isNew : false
              }
            })
          }))
        })
    }
  },

  applyAiFileEdit: async ({ absPath, content, before, writeDisk: _writeDisk, isNew }) => {
    const platform = getPlatform()
    const existing = get().tabs.find((t) => pathsEqual(t.path, absPath))
    const isNewFile = Boolean(isNew ?? !before)
    // Always Cursor-like marks until the user saves (Ctrl+S), even if already persisted.
    const dirty = true
    const originalContent = before

    const patchTab = (t: OpenTab): OpenTab => ({
      ...t,
      content,
      originalContent,
      dirty,
      isNew: isNewFile ? true : t.isNew
    })

    if (existing) {
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === existing.id ? patchTab(t) : t))
      }))
    } else {
      const tab: OpenTab = {
        id: tabIdFor(absPath),
        path: absPath,
        title: platform.basename(absPath),
        kind: detectKind(absPath),
        content,
        originalContent,
        dirty,
        isNew: isNewFile,
        docRev: 0
      }
      // Background tab — do not steal focus / flash.
      set((s) => ({ tabs: [...s.tabs, tab] }))
    }

    applyingFromHub = true
    try {
      try {
        await platform.docOpen(absPath)
      } catch {
        /* buffer-only */
      }
      const snap = await platform.docPatch(absPath, content)
      if (snap) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            pathsEqual(t.path, absPath)
              ? {
                  ...t,
                  content,
                  originalContent,
                  dirty: true,
                  isNew: isNewFile,
                  docRev: snap.rev
                }
              : t
          )
        }))
      }
    } finally {
      applyingFromHub = false
    }
  },

  saveTab: async (id) => {
    const tabId = id ?? get().activeTabId
    if (!tabId) return false
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return false
    // Mind map: fold current pan/zoom into buffer before writing disk.
    if (tab.kind === 'mindmap') flushActiveMindmapViewport()
    if (tab.kind === 'dialogue') await flushActiveDialogueSidecars()
    const latest = get().tabs.find((t) => t.id === tabId)
    if (!latest) return false
    try {
      // Ensure DocumentHub has the latest renderer buffer (viewport flush is sync in
      // zustand but its docPatch was historically fire-and-forget).
      await getPlatform().docPatch(latest.path, latest.content)
      const snap = await getPlatform().docSave(latest.path)
      if (!snap) {
        await getPlatform().writeFile(latest.path, latest.content)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId
              ? { ...t, originalContent: t.content, dirty: false, isNew: false }
              : t
          )
        }))
        return true
      }
      applyingFromHub = true
      try {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            pathsEqual(t.path, snap.path)
              ? {
                  ...t,
                  content: snap.content,
                  originalContent: snap.originalContent,
                  dirty: false,
                  isNew: false,
                  docRev: snap.rev
                }
              : t
          )
        }))
      } finally {
        applyingFromHub = false
      }
      return true
    } catch {
      get().showToast(i18n.t('errors.saveFailed'))
      return false
    }
  },

  discardTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || !tab.dirty) return
    const snap = await getPlatform().docDiscard(tab.path)
    applyingFromHub = true
    try {
      if (snap) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            pathsEqual(t.path, snap.path)
              ? {
                  ...t,
                  content: snap.content,
                  originalContent: snap.originalContent,
                  dirty: false,
                  docRev: snap.rev
                }
              : t
          )
        }))
      } else {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, content: t.originalContent, dirty: false } : t
          )
        }))
      }
    } finally {
      applyingFromHub = false
    }
  },

  closeTab: async (id, force = false) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return true
    if (!force && tab.dirty) {
      const choice = await askUnsavedConfirm({ fileName: tab.title })
      if (choice === 'cancel') return false
      if (choice === 'save') {
        const ok = await get().saveTab(id)
        if (!ok) return false
      } else {
        await get().discardTab(id)
      }
    }
    void getPlatform().docUnsubscribe(tab.path)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (activeTabId === id) {
        activeTabId = tabs.length ? tabs[tabs.length - 1].id : null
      }
      let splitTabId = s.splitTabId
      let splitEnabled = s.splitEnabled
      if (splitTabId === id) {
        splitTabId = null
        splitEnabled = false
      }
      return { tabs, activeTabId, splitTabId, splitEnabled }
    })
    if (get().windowRole === 'float') {
      void getPlatform().confirmWindowClose()
    }
    return true
  },

  handleWindowCloseRequest: async () => {
    if (windowCloseBusy) return
    windowCloseBusy = true
    try {
      const parked = snapshotActiveSession(get())
      set({ openWorkspaces: parked })
      const dirtyAcross = parked.flatMap((w) => w.tabs.filter((t) => t.dirty))
      if (dirtyAcross.length > 0) {
        const name = dirtyAcross.length === 1 ? dirtyAcross[0].title : undefined
        const choice = await askUnsavedConfirm({ fileName: name })
        if (choice === 'cancel') return
        for (const ws of parked) {
          const dirtyIds = new Set(
            (ws.id === get().activeWorkspaceId ? get().tabs : ws.tabs)
              .filter((t) => t.dirty)
              .map((t) => t.id)
          )
          if (dirtyIds.size === 0) continue
          if (ws.id !== get().activeWorkspaceId) {
            await get().switchWorkspace(ws.id)
          }
          for (const tabId of Array.from(dirtyIds)) {
            if (choice === 'save') {
              const ok = await get().saveTab(tabId)
              if (!ok) return
            } else {
              await get().discardTab(tabId)
            }
          }
        }
      }
      await getPlatform().confirmWindowClose()
    } finally {
      windowCloseBusy = false
    }
  },

  enableSplit: (tabId) => {
    const { activeTabId, tabs } = get()
    const id = tabId ?? activeTabId
    if (!id || tabs.length < 1) return
    const other = tabs.find((t) => t.id !== id)?.id ?? id
    set({ splitEnabled: true, splitTabId: other })
  },

  disableSplit: () => set({ splitEnabled: false, splitTabId: null }),

  setSplitTab: (id) => set({ splitTabId: id }),

  createFile: async (name, parentDir) => {
    const { workspacePath } = get()
    const base = parentDir ?? workspacePath
    if (!base) return
    const platform = getPlatform()
    const path = platform.joinPath(base, name)
    try {
      await platform.writeFile(path, '')
      await get().refreshTree()
      await get().openFile(path)
    } catch {
      get().showToast(i18n.t('errors.createFailed'))
    }
  },

  createFolder: async (name, parentDir) => {
    const { workspacePath } = get()
    const base = parentDir ?? workspacePath
    if (!base) return
    const platform = getPlatform()
    const path = platform.joinPath(base, name)
    try {
      await platform.mkdir(path)
      await get().refreshTree()
    } catch {
      get().showToast(i18n.t('errors.createFailed'))
    }
  },

  createMindMap: async (name, parentDir) => {
    const { workspacePath } = get()
    const base = parentDir ?? workspacePath
    if (!base) return
    const platform = getPlatform()
    let fileName = name
    if (!fileName.toLowerCase().endsWith('.kmind')) fileName += '.kmind'
    const path = platform.joinPath(base, fileName)
    const rootText = i18n.t('editor.mindMapRoot')
    try {
      await platform.writeFile(path, serializeKMind(createEmptyKMind(rootText)))
      await get().refreshTree()
      await get().openFile(path)
    } catch {
      get().showToast(i18n.t('errors.createFailed'))
    }
  },

  createDialogue: async (opts, parentDir) => {
    const { workspacePath } = get()
    const base = parentDir ?? workspacePath
    if (!base) return
    const godotScene = opts.godotScene.trim()
    const dialogueId = opts.dialogueId.trim()
    if (!godotScene || !dialogueId) {
      get().showToast(i18n.t('dialogue.metaRequired'))
      return
    }
    const platform = getPlatform()
    let fileName = (opts.fileName ?? dialogueFileNameFromMeta(godotScene, dialogueId)).trim()
    if (!fileName.toLowerCase().endsWith('.dialogue.csv')) {
      if (fileName.toLowerCase().endsWith('.csv')) {
        fileName = fileName.slice(0, -4) + '.dialogue.csv'
      } else {
        fileName += '.dialogue.csv'
      }
    }
    const path = platform.joinPath(base, fileName)
    const metaPath = dialogueMetaPathFor(path)
    try {
      await platform.writeFile(path, emptyDialogueCsv())
      await platform.writeFile(
        metaPath,
        serializeDialogueFileMeta({ godot_scene: godotScene, dialogue_id: dialogueId })
      )
      await get().refreshTree()
      await get().openFile(path)
    } catch {
      get().showToast(i18n.t('errors.createFailed'))
    }
  },

  renameEntry: async (targetPath, newName) => {
    const platform = getPlatform()
    let nextName = newName.trim()
    if (!nextName || nextName.includes('/') || nextName.includes('\\')) {
      get().showToast(i18n.t('errors.renameFailed'))
      return
    }
    const dir = platform.dirname(targetPath)
    const newPath = platform.joinPath(dir, nextName)
    if (pathsEqual(targetPath, newPath)) return

    const openTab = get().tabs.find((t) => pathsEqual(t.path, targetPath))
    if (openTab?.dirty) {
      const choice = await askUnsavedConfirm({ fileName: openTab.title })
      if (choice === 'cancel') return
      if (choice === 'save') {
        const ok = await get().saveTab(openTab.id)
        if (!ok) return
      } else {
        await get().discardTab(openTab.id)
      }
    }

    const wasActive = openTab && get().activeTabId === openTab.id
    if (openTab) {
      const closed = await get().closeTab(openTab.id, true)
      if (!closed) return
    }

    try {
      if (await platform.exists(newPath)) {
        get().showToast(i18n.t('errors.renameExists'))
        if (openTab) await get().openFile(targetPath)
        return
      }
      await platform.rename(targetPath, newPath)

      if (isDialoguePath(targetPath)) {
        if (isDialoguePath(newPath)) {
          await syncDialogueSidecars(targetPath, newPath)
        } else {
          await syncDialogueSidecars(targetPath, null)
        }
      }

      await get().refreshTree()
      if (openTab) {
        await get().openFile(newPath)
        if (!wasActive) {
          /* openFile sets active; fine for rename UX */
        }
      }
    } catch {
      get().showToast(i18n.t('errors.renameFailed'))
      if (openTab) await get().openFile(targetPath)
    }
  },

  moveEntry: async (sourcePath, destDir) => {
    const platform = getPlatform()
    const workspacePath = get().workspacePath
    if (!workspacePath) return

    const destNorm = destDir.replace(/\\/g, '/').replace(/\/+$/, '')
    const srcNorm = sourcePath.replace(/\\/g, '/').replace(/\/+$/, '')
    const wsNorm = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
    const srcLower = srcNorm.toLowerCase()
    const destLower = destNorm.toLowerCase()
    const wsLower = wsNorm.toLowerCase()

    if (!destLower.startsWith(wsLower)) {
      get().showToast(i18n.t('errors.moveFailed'))
      return
    }
    if (destLower === srcLower || destLower.startsWith(srcLower + '/')) {
      get().showToast(i18n.t('errors.moveInvalid'))
      return
    }

    const base = platform.basename(sourcePath)
    const newPath = platform.joinPath(destDir, base)
    if (pathsEqual(sourcePath, newPath)) return
    if (pathsEqual(platform.dirname(sourcePath), destDir)) return

    const affectedTabs = get().tabs.filter((t) => {
      const p = t.path.replace(/\\/g, '/').toLowerCase()
      return p === srcLower || p.startsWith(srcLower + '/')
    })

    for (const tab of affectedTabs) {
      if (tab.dirty) {
        const choice = await askUnsavedConfirm({ fileName: tab.title })
        if (choice === 'cancel') return
        if (choice === 'save') {
          const ok = await get().saveTab(tab.id)
          if (!ok) return
        } else {
          await get().discardTab(tab.id)
        }
      }
    }

    const reopenPath =
      affectedTabs.length === 1 && pathsEqual(affectedTabs[0].path, sourcePath)
        ? newPath
        : null
    const wasActive =
      reopenPath && affectedTabs[0] && get().activeTabId === affectedTabs[0].id

    for (const tab of affectedTabs) {
      const closed = await get().closeTab(tab.id, true)
      if (!closed) return
    }

    try {
      if (await platform.exists(newPath)) {
        get().showToast(i18n.t('errors.moveExists'))
        if (reopenPath) await get().openFile(sourcePath)
        return
      }
      await platform.rename(sourcePath, newPath)

      if (isDialoguePath(sourcePath) && isDialoguePath(newPath)) {
        await syncDialogueSidecars(sourcePath, newPath)
      }

      if (platform.extname(sourcePath).toLowerCase() === '.kmind') {
        const oldAssets = assetsDirForKmind(sourcePath)
        const newAssets = assetsDirForKmind(newPath)
        try {
          if (await platform.exists(oldAssets) && !(await platform.exists(newAssets))) {
            await platform.rename(oldAssets, newAssets)
          }
        } catch {
          /* assets best-effort */
        }
      }

      await get().refreshTree()
      if (reopenPath) {
        await get().openFile(reopenPath)
        void wasActive
      }
    } catch {
      get().showToast(i18n.t('errors.moveFailed'))
      if (reopenPath) await get().openFile(sourcePath)
    }
  },

  deleteEntry: async (targetPath) => {
    if (!window.confirm(i18n.t('explorer.confirmDelete', { name: getPlatform().basename(targetPath) }))) {
      return
    }
    try {
      const tabs = get().tabs.filter(
        (t) => t.path === targetPath || t.path.startsWith(targetPath + '\\') || t.path.startsWith(targetPath + '/')
      )
      for (const tab of tabs) {
        await get().closeTab(tab.id, true)
      }
      const platform = getPlatform()
      await platform.delete(targetPath)
      if (isDialoguePath(targetPath)) {
        await syncDialogueSidecars(targetPath, null)
      }
      await get().refreshTree()
    } catch {
      get().showToast(i18n.t('errors.deleteFailed'))
    }
  },

  spawnNewWindow: async () => {
    const { workspacePath, activeTabId, tabs, windowRole } = get()
    if (windowRole === 'float') {
      const tab = tabs[0]
      if (!tab || !workspacePath) return
      await getPlatform().newFloatWindow({
        filePath: tab.path,
        workspacePath,
        content: tab.content,
        originalContent: tab.originalContent,
        dirty: tab.dirty
      })
      return
    }
    if (!workspacePath || !activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    await getPlatform().newFloatWindow({
      filePath: tab.path,
      workspacePath,
      content: tab.content,
      originalContent: tab.originalContent,
      dirty: tab.dirty
    })
  },

  spawnNewMainWindow: async () => {
    const { workspacePath } = get()
    await getPlatform().newMainWindow(workspacePath)
  }
}))
