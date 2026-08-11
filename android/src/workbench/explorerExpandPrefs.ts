import { getPlatform } from '@/platform'

const STORAGE_PREFIX = 'kentucky:explorer-expand:'

export type ExplorerExpandPrefs = {
  /** Workspace root row (project name) expanded — shows top-level entries. */
  rootOpen: boolean
  /** Workspace-relative folder/group paths that are expanded (forward slashes, lowercased). */
  expanded: string[]
}

const DEFAULT_PREFS: ExplorerExpandPrefs = {
  rootOpen: true,
  expanded: []
}

function storageKey(workspacePath: string): string {
  return STORAGE_PREFIX + workspacePath.replace(/\//g, '\\').toLowerCase()
}

export function pathExpandKey(workspacePath: string, absPath: string): string {
  const rel = getPlatform().relativeTo(workspacePath, absPath)
  return (rel || getPlatform().basename(absPath)).replace(/\\/g, '/').toLowerCase()
}

export function loadExplorerExpandPrefs(workspacePath: string | null): ExplorerExpandPrefs {
  if (!workspacePath) return { ...DEFAULT_PREFS, expanded: [] }
  try {
    const raw = localStorage.getItem(storageKey(workspacePath))
    if (!raw) return { ...DEFAULT_PREFS, expanded: [] }
    const parsed = JSON.parse(raw) as Partial<ExplorerExpandPrefs>
    const expanded = Array.isArray(parsed.expanded)
      ? parsed.expanded
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.replace(/\\/g, '/').toLowerCase())
      : []
    return {
      rootOpen: parsed.rootOpen !== false,
      expanded: Array.from(new Set(expanded))
    }
  } catch {
    return { ...DEFAULT_PREFS, expanded: [] }
  }
}

export function saveExplorerExpandPrefs(
  workspacePath: string,
  prefs: ExplorerExpandPrefs
): void {
  try {
    const payload: ExplorerExpandPrefs = {
      rootOpen: Boolean(prefs.rootOpen),
      expanded: Array.from(
        new Set(
          (prefs.expanded || [])
            .filter((p) => typeof p === 'string' && p.trim())
            .map((p) => p.replace(/\\/g, '/').toLowerCase())
        )
      )
    }
    localStorage.setItem(storageKey(workspacePath), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}
