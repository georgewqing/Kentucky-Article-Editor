import { getAiWorkspacePrefsPath } from './appBodyPaths'
import { cacheRead, cacheWrite, writeText } from './storage'

export interface WorkspaceAiPrefs {
  panelVisible: boolean
}

type PrefsFile = Record<string, WorkspaceAiPrefs>

const DEFAULT_PREFS: WorkspaceAiPrefs = {
  panelVisible: false
}

const prefsPath = getAiWorkspacePrefsPath()

function keyOf(workspacePath: string): string {
  return workspacePath.replace(/\//g, '\\').toLowerCase()
}

function loadAll(): PrefsFile {
  try {
    const text = cacheRead(prefsPath)
    if (!text) return {}
    const raw = JSON.parse(text) as PrefsFile
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveAll(data: PrefsFile): void {
  const text = JSON.stringify(data, null, 2)
  cacheWrite(prefsPath, text)
  void writeText(prefsPath, text)
}

export function getWorkspaceAiPrefs(workspacePath: string | null): WorkspaceAiPrefs {
  if (!workspacePath) return { ...DEFAULT_PREFS }
  const all = loadAll()
  const cur = all[keyOf(workspacePath)]
  return {
    panelVisible: Boolean(cur?.panelVisible)
  }
}

export function setWorkspaceAiPrefs(
  workspacePath: string,
  partial: Partial<WorkspaceAiPrefs>
): WorkspaceAiPrefs {
  const all = loadAll()
  const key = keyOf(workspacePath)
  const next: WorkspaceAiPrefs = {
    ...DEFAULT_PREFS,
    ...all[key],
    ...partial,
    panelVisible: partial.panelVisible !== undefined ? Boolean(partial.panelVisible) : Boolean(all[key]?.panelVisible)
  }
  all[key] = next
  saveAll(all)
  return next
}
