/**
 * Workspace path sandbox — all agent FS ops must stay inside the open folder.
 * Windows critical: path.relative across drives returns an absolute path (not `..`).
 */
import { dirname, isAbsolute, relative, resolve, sep } from 'path'
import { existsSync, realpathSync } from 'fs'
import { homedir } from 'os'

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePathError'
  }
}

const MAX_DIALOG_ALLOW = 512
const dialogReadAllow = new Set<string>()
const dialogWriteAllow = new Set<string>()
/** Paths that passed fs:toMediaUrl this session — kentucky-file may serve these. */
const mediaServeAllow = new Set<string>()

export function pathKey(absPath: string): string {
  return resolve(absPath).replace(/\//g, '\\').toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

function rememberAllow(set: Set<string>, absPath: string): string {
  const abs = resolve(absPath)
  set.add(pathKey(abs))
  if (set.size > MAX_DIALOG_ALLOW) {
    const first = set.values().next().value
    if (first) set.delete(first)
  }
  return abs
}

/** File-open dialog results: readable (copy/import/preview) this session. */
export function rememberDialogReadPath(absPath: string): string {
  return rememberAllow(dialogReadAllow, absPath)
}

/** Save-dialog results: writable dest this session (export PNG/MP4). */
export function rememberDialogWritePath(absPath: string): string {
  return rememberAllow(dialogWriteAllow, absPath)
}

export function isDialogReadAllowed(absPath: string): boolean {
  return dialogReadAllow.has(pathKey(absPath))
}

export function isDialogWriteAllowed(absPath: string): boolean {
  return dialogWriteAllow.has(pathKey(absPath))
}

export function rememberMediaPath(absPath: string): string {
  return rememberAllow(mediaServeAllow, absPath)
}

export function isMediaPathAllowed(absPath: string): boolean {
  return mediaServeAllow.has(pathKey(absPath))
}

/** Null-safe workspace compare (empty must not resolve to cwd). */
export function sameWorkspace(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = (a || '').trim()
  const right = (b || '').trim()
  if (!left && !right) return true
  if (!left || !right) return false
  return samePath(left, right)
}

/**
 * Throw if absPath is outside workspaceRoot.
 */
export function assertInsideWorkspace(workspaceRoot: string, absPath: string): void {
  const root = resolve(workspaceRoot)
  const candidate = resolve(absPath)
  const rel = relative(root, candidate)
  if (rel.startsWith('..') || rel === '..' || isAbsolute(rel)) {
    throw new WorkspacePathError('Path escapes workspace')
  }
  // Symlink / junction: existing ancestors must realpath stay inside the workspace.
  try {
    let probe = candidate
    while (!existsSync(probe)) {
      const parent = dirname(probe)
      if (parent === probe) break
      probe = parent
    }
    if (existsSync(probe) && existsSync(root)) {
      const realRoot = realpathSync(root)
      const realProbe = realpathSync(probe)
      const r2 = relative(realRoot, realProbe)
      if (r2.startsWith('..') || r2 === '..' || isAbsolute(r2)) {
        throw new WorkspacePathError('Path escapes workspace (symlink)')
      }
    }
  } catch (e) {
    if (e instanceof WorkspacePathError) throw e
    throw new WorkspacePathError('Path escapes workspace (realpath failed)')
  }
}

/** Resolve a tool path to an absolute path guaranteed inside the workspace. */
export function resolveWorkspacePath(workspaceRoot: string, relOrAbs: string): string {
  const root = resolve(workspaceRoot)
  const raw = String(relOrAbs ?? '').trim()
  const candidate =
    !raw || raw === '.'
      ? root
      : isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')
        ? resolve(raw)
        : resolve(root, raw)
  assertInsideWorkspace(root, candidate)
  return candidate
}

export function toWorkspaceRel(workspaceRoot: string, abs: string): string {
  return relative(resolve(workspaceRoot), resolve(abs)).split(sep).join('/')
}

function normalizeWinPath(absPath: string): string {
  return resolve(absPath).replace(/[/\\]+$/, '').toLowerCase().replace(/\//g, '\\')
}

/** Refuse bare-repo / external git targets that are drive roots or OS system dirs. */
export function assertSafeExternalGitPath(absPath: string): void {
  const target = resolve(absPath)
  const normalized = target.replace(/[/\\]+$/, '')
  // Drive root: "D:\" or "D:"
  if (/^[A-Za-z]:\\?$/i.test(normalized) || normalized === '/' || /^\\\\[^\\]+\\?$/i.test(normalized)) {
    throw new WorkspacePathError('Refusing Git path at drive/share root')
  }
  const lower = normalized.toLowerCase().replace(/\//g, '\\')
  const bannedExact = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\system volume information',
    'c:\\$recycle.bin'
  ]
  for (const b of bannedExact) {
    if (lower === b || lower.startsWith(b + '\\')) {
      throw new WorkspacePathError(`Refusing Git path under system directory: ${b}`)
    }
  }
}

/**
 * Refuse opening a folder as a Kentucky workspace when Agent/UI delete
 * could wipe a whole profile or OS tree.
 */
export function assertSafeWorkspaceRoot(absPath: string): void {
  assertSafeExternalGitPath(absPath)
  const lower = normalizeWinPath(absPath)
  if (/^[a-z]:\\users$/i.test(lower)) {
    throw new WorkspacePathError('Refusing to open the Users directory as a workspace')
  }
  let home = ''
  try {
    home = normalizeWinPath(homedir())
  } catch {
    home = ''
  }
  if (home && lower === home) {
    throw new WorkspacePathError('Refusing to open the user home folder as a workspace')
  }
}

/** Extra deny for delete/rename of the workspace root itself. */
export function assertNotWorkspaceRoot(workspaceRoot: string, absPath: string): void {
  if (samePath(workspaceRoot, absPath)) {
    throw new WorkspacePathError('Refusing to modify the workspace root')
  }
}
