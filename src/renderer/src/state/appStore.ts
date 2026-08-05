import { create } from 'zustand'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { createEmptyKMind, serializeKMind } from '@/editors/kmind'
import i18n from '@/i18n'

export type EditorKind = 'text' | 'mindmap'
export type ActiveView = 'explorer' | 'settings'

export interface OpenTab {
  id: string
  path: string
  title: string
  kind: EditorKind
  content: string
  originalContent: string
  dirty: boolean
}

export interface RecentWorkspace {
  path: string
  lastOpened: number
}

export type Toast = { id: number; message: string; type: 'error' | 'info' } | null

interface AppState {
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
  refreshTree: () => Promise<void>
  closeWorkspace: () => void

  openFile: (path: string) => Promise<void>
  setActiveTab: (id: string) => void
  updateTabContent: (id: string, content: string) => void
  saveTab: (id?: string) => Promise<boolean>
  closeTab: (id: string, force?: boolean) => boolean
  enableSplit: (tabId?: string) => void
  disableSplit: () => void
  setSplitTab: (id: string) => void

  createFile: (name: string, parentDir?: string) => Promise<void>
  createFolder: (name: string, parentDir?: string) => Promise<void>
  createMindMap: (name: string, parentDir?: string) => Promise<void>
  deleteEntry: (targetPath: string) => Promise<void>
}

const RECENT_KEY = 'kentucky.recentFolders'

function detectKind(path: string): EditorKind {
  return getPlatform().extname(path) === '.kmind' ? 'mindmap' : 'text'
}

function tabIdFor(path: string): string {
  return path
}

function parseRecent(raw: string): RecentWorkspace[] {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) return []
  // Migrate legacy string[]
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

export const useAppStore = create<AppState>((set, get) => ({
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
    try {
      const tree = await platform.readDir(path)
      get().addRecent(path)
      set({
        workspacePath: path,
        fileTree: tree,
        tabs: [],
        activeTabId: null,
        splitTabId: null,
        splitEnabled: false,
        activeView: 'explorer',
        sidebarVisible: true
      })
    } catch {
      get().showToast(i18n.t('errors.loadTreeFailed'))
    }
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

  closeWorkspace: () => {
    const dirty = get().tabs.some((t) => t.dirty)
    if (dirty && !window.confirm(i18n.t('editor.unsavedConfirm'))) return
    set({
      workspacePath: null,
      fileTree: [],
      tabs: [],
      activeTabId: null,
      splitTabId: null,
      splitEnabled: false,
      activeView: 'explorer'
    })
  },

  openFile: async (path) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id, activeView: 'explorer' })
      return
    }
    const platform = getPlatform()
    try {
      const content = await platform.readFile(path)
      const tab: OpenTab = {
        id: tabIdFor(path),
        path,
        title: platform.basename(path),
        kind: detectKind(path),
        content,
        originalContent: content,
        dirty: false
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

  setActiveTab: (id) => set({ activeTabId: id, activeView: 'explorer' }),

  updateTabContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: content !== t.originalContent } : t
      )
    })),

  saveTab: async (id) => {
    const tabId = id ?? get().activeTabId
    if (!tabId) return false
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return false
    try {
      await getPlatform().writeFile(tab.path, tab.content)
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, originalContent: t.content, dirty: false } : t
        )
      }))
      return true
    } catch {
      get().showToast(i18n.t('errors.saveFailed'))
      return false
    }
  },

  closeTab: (id, force = false) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return true
    if (!force && tab.dirty && !window.confirm(i18n.t('editor.unsavedConfirm'))) {
      return false
    }
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
    return true
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

  deleteEntry: async (targetPath) => {
    if (!window.confirm(i18n.t('explorer.confirmDelete', { name: getPlatform().basename(targetPath) }))) {
      return
    }
    try {
      const tabs = get().tabs.filter(
        (t) => t.path === targetPath || t.path.startsWith(targetPath + '\\') || t.path.startsWith(targetPath + '/')
      )
      for (const tab of tabs) {
        get().closeTab(tab.id, true)
      }
      await getPlatform().delete(targetPath)
      await get().refreshTree()
    } catch {
      get().showToast(i18n.t('errors.deleteFailed'))
    }
  }
}))
