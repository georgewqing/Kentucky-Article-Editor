import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDataDir } from './appBodyPaths'

export interface WorkspaceAiPrefs {
  panelVisible: boolean
}

type PrefsFile = Record<string, WorkspaceAiPrefs>

const DEFAULT_PREFS: WorkspaceAiPrefs = {
  panelVisible: false
}

function prefsPath(): string {
  return join(getDataDir(), 'ai-workspace-prefs.json')
}

function keyOf(workspacePath: string): string {
  return workspacePath.replace(/\//g, '\\').toLowerCase()
}

function loadAll(): PrefsFile {
  try {
    if (!existsSync(prefsPath())) return {}
    const raw = JSON.parse(readFileSync(prefsPath(), 'utf-8')) as PrefsFile
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveAll(data: PrefsFile): void {
  writeFileSync(prefsPath(), JSON.stringify(data, null, 2), 'utf-8')
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
