/**
 * Local Git helpers for Kentucky SCM (no arbitrary argv).
 * Requires Git for Windows (or git on PATH / configured gitPath).
 */
import { execFile } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, readFileSync, lstatSync } from 'fs'
import { dirname, join, resolve, relative, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'
import { clipLines } from '../../shared/clipLines'
import { assertSafeExternalGitPath, assertSafeWorkspaceRoot, resolveWorkspacePath } from '../ai/workspacePath'

const execFileAsync = promisify(execFile)

let configuredGitPath = 'git'

export function setGitExecutable(path: string | null | undefined): void {
  configuredGitPath = path?.trim() || 'git'
}

/** Probe then keep the path only if stdout looks like Git. */
export async function configureGitExecutable(path: string | null | undefined): Promise<GitProbe> {
  const next = path?.trim() || 'git'
  const previous = configuredGitPath
  configuredGitPath = next
  const probe = await probeGit()
  const version = probe.version || ''
  if (!probe.ok || !/^git version /i.test(version)) {
    configuredGitPath = previous
    return {
      ok: false,
      version: null,
      error: probe.ok
        ? 'Not a Git executable (expected "git version …")'
        : probe.error || 'Not a Git executable'
    }
  }
  return probe
}

export function getGitExecutable(): string {
  return configuredGitPath
}

export type GitProbe = {
  ok: boolean
  version: string | null
  error: string | null
}

export async function probeGit(): Promise<GitProbe> {
  try {
    const { stdout } = await execFileAsync(configuredGitPath, ['--version'], {
      windowsHide: true,
      timeout: 8000
    })
    return { ok: true, version: stdout.trim(), error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      version: null,
      error: msg.includes('ENOENT')
        ? 'Git not found. Install Git for Windows or set git path in settings.'
        : msg
    }
  }
}

/** This folder only. `.git` must be a directory — a gitdir file/symlink points at another repo. */
export type WorkspaceGitKind = 'repo' | 'foreign' | 'none'

export function inspectWorkspaceGit(startDir: string): WorkspaceGitKind {
  const gitPath = join(resolve(startDir), '.git')
  try {
    if (!existsSync(gitPath)) return 'none'
    const st = lstatSync(gitPath)
    if (st.isDirectory()) return 'repo'
    return 'foreign'
  } catch {
    return 'none'
  }
}

/** Only the given folder itself — never walk into a parent repo. */
export function findGitRoot(startDir: string): string | null {
  const cur = resolve(startDir)
  return inspectWorkspaceGit(cur) === 'repo' ? cur : null
}

function pathEscapesError(requested: string): string {
  return `Path escapes workspace: ${requested}`
}

/** Resolve a tool/IPC path inside the workspace and as a repo-relative git path. */
function resolveRepoRel(
  workspaceRoot: string,
  repoRoot: string,
  requested: string
): { abs: string; rel: string } | { error: string } {
  try {
    const abs = resolveWorkspacePath(workspaceRoot, requested)
    const rel = relative(repoRoot, abs).replace(/\\/g, '/')
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      return { error: pathEscapesError(requested) }
    }
    return { abs, rel }
  } catch {
    return { error: pathEscapesError(requested) }
  }
}

async function git(
  repoRoot: string,
  args: string[],
  opts?: { allowFail?: boolean }
): Promise<{ stdout: string; stderr: string; code: number }> {
  // Always disable path quoting so CJK / spaces stay readable in porcelain & diffs.
  const fullArgs = ['-c', 'core.quotepath=false', ...args]
  try {
    const { stdout, stderr } = await execFileAsync(configuredGitPath, fullArgs, {
      cwd: repoRoot,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
    })
    return { stdout: String(stdout), stderr: String(stderr), code: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number; message?: string }
    if (opts?.allowFail) {
      // Prefer real child streams. Empty stderr must NOT fall through to
      // err.message ("Command failed: git …") — git often writes only to stdout
      // (e.g. "nothing to commit, working tree clean").
      const stdout = String(err.stdout ?? '')
      const stderrChild = err.stderr != null ? String(err.stderr) : ''
      const stderr =
        stderrChild.trim().length > 0
          ? stderrChild
          : stdout.trim().length > 0
            ? ''
            : String(err.message || '')
      return {
        stdout,
        stderr,
        code: typeof err.code === 'number' ? err.code : 1
      }
    }
    throw e
  }
}

const DEFAULT_GITIGNORE = `# Kentucky defaults
.DS_Store
Thumbs.db
desktop.ini
node_modules/
*.tmp
*.temp
~$*
.kentucky/
revisions/
`

const KENTUCKY_GITIGNORE_LINES = ['.kentucky/', 'revisions/'] as const

/** Idempotently ensure Kentucky ignore entries exist (for repos init'd before they were added). */
export function ensureKentuckyGitignore(repoRoot: string): { updated: boolean; path: string } {
  const gi = join(repoRoot, '.gitignore')
  if (!existsSync(gi)) {
    writeFileSync(gi, DEFAULT_GITIGNORE, 'utf-8')
    return { updated: true, path: gi }
  }
  let text = readFileSync(gi, 'utf-8')
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  let updated = false
  for (const entry of KENTUCKY_GITIGNORE_LINES) {
    if (!lines.includes(entry)) {
      if (text.length && !text.endsWith('\n')) text += '\n'
      text += `${entry}\n`
      updated = true
    }
  }
  if (updated) writeFileSync(gi, text, 'utf-8')
  return { updated, path: gi }
}

/** Decode git C-quoted paths (octal = UTF-8 bytes) when quotepath was on. */
export function unquoteGitPath(raw: string): string {
  let s = raw.trim()
  if (!(s.startsWith('"') && s.endsWith('"') && s.length >= 2)) {
    return s.replace(/\\/g, '/')
  }
  s = s.slice(1, -1)
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n >= '0' && n <= '7') {
        let oct = n
        let j = i + 2
        while (j < s.length && oct.length < 3 && s[j] >= '0' && s[j] <= '7') {
          oct += s[j++]
        }
        bytes.push(parseInt(oct, 8))
        i = j - 1
        continue
      }
      if (n === 'n') {
        bytes.push(0x0a)
        i++
        continue
      }
      if (n === 't') {
        bytes.push(0x09)
        i++
        continue
      }
      if (n === '"' || n === '\\') {
        bytes.push(n.charCodeAt(0))
        i++
        continue
      }
    }
    const code = s.charCodeAt(i)
    if (code < 128) {
      bytes.push(code)
    } else {
      const enc = Buffer.from(s[i], 'utf8')
      for (let k = 0; k < enc.length; k++) bytes.push(enc[k]!)
    }
  }
  return Buffer.from(bytes).toString('utf8').replace(/\\/g, '/')
}

export async function gitInit(workspaceRoot: string): Promise<{ ok: boolean; repoRoot: string; error?: string }> {
  const root = resolve(workspaceRoot)
  try {
    assertSafeWorkspaceRoot(root)
  } catch (e) {
    return { ok: false, repoRoot: root, error: e instanceof Error ? e.message : String(e) }
  }
  const kind = inspectWorkspaceGit(root)
  if (kind === 'repo') {
    return { ok: true, repoRoot: root }
  }
  if (kind === 'foreign') {
    return {
      ok: false,
      repoRoot: root,
      error: 'This folder is a Git worktree or submodule of another repository'
    }
  }
  try {
    await git(root, ['init'])
    ensureKentuckyGitignore(root)
    await markKentuckyAutoRepo(root)
    return { ok: true, repoRoot: root }
  } catch (e) {
    return { ok: false, repoRoot: root, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Ensure the workspace is registered with a local Git repo at **this folder**.
 * Does not walk to a parent `.git`. A `.git` file (worktree/submodule pointer) is refused — no nested init.
 */
export async function ensureWorkspaceGit(workspaceRoot: string): Promise<{
  ok: boolean
  repoRoot: string | null
  created: boolean
  error?: string
}> {
  const probe = await probeGit()
  if (!probe.ok) {
    return {
      ok: false,
      repoRoot: null,
      created: false,
      error: probe.error || 'Git not found'
    }
  }
  const root = resolve(workspaceRoot)
  try {
    assertSafeWorkspaceRoot(root)
  } catch (e) {
    return {
      ok: false,
      repoRoot: null,
      created: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
  const kind = inspectWorkspaceGit(root)
  if (kind === 'foreign') {
    return {
      ok: false,
      repoRoot: null,
      created: false,
      error: 'This folder is a Git worktree or submodule of another repository'
    }
  }
  const existing = kind === 'repo' ? root : null
  if (existing) {
    ensureKentuckyGitignore(existing)
    return { ok: true, repoRoot: existing, created: false }
  }
  try {
    await git(root, ['init'])
    ensureKentuckyGitignore(root)
    await markKentuckyAutoRepo(root)
    return { ok: true, repoRoot: root, created: true }
  } catch (e) {
    return {
      ok: false,
      repoRoot: null,
      created: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

async function markKentuckyAutoRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ['config', 'kentucky.autoInit', 'true'], { allowFail: true })
}

export type GitFileStatus = {
  path: string
  /** relative to repo root, forward slashes */
  relPath: string
  index: string
  worktree: string
  untracked: boolean
}

export type GitStatusResult = {
  repoRoot: string | null
  branch: string | null
  files: GitFileStatus[]
  error: string | null
}

function parsePorcelain(stdout: string, repoRoot: string): GitFileStatus[] {
  const files: GitFileStatus[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith('?')) {
      // ?? path
      const rel = unquoteGitPath(line.slice(3))
      files.push({
        path: join(repoRoot, ...rel.split('/')),
        relPath: rel,
        index: '?',
        worktree: '?',
        untracked: true
      })
      continue
    }
    if (line.length < 4) continue
    const index = line[0] || ' '
    const worktree = line[1] || ' '
    let rest = line.slice(3)
    // rename: "old -> new"
    if (rest.includes(' -> ')) {
      rest = rest.split(' -> ').pop() || rest
    }
    const rel = unquoteGitPath(rest)
    files.push({
      path: join(repoRoot, ...rel.split('/')),
      relPath: rel,
      index,
      worktree,
      untracked: false
    })
  }
  return files
}

export async function gitStatus(workspaceRoot: string): Promise<GitStatusResult> {
  const probe = await probeGit()
  if (!probe.ok) {
    return { repoRoot: null, branch: null, files: [], error: probe.error }
  }
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) {
    return { repoRoot: null, branch: null, files: [], error: null }
  }
  try {
    const branchOut = await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })
    const branch =
      branchOut.code === 0 ? branchOut.stdout.trim() || 'HEAD' : 'HEAD'
    const st = await git(repoRoot, ['status', '--porcelain', '-uall'])
    return {
      repoRoot,
      branch,
      files: parsePorcelain(st.stdout, repoRoot),
      error: null
    }
  } catch (e) {
    return {
      repoRoot,
      branch: null,
      files: [],
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function gitDiff(
  workspaceRoot: string,
  relOrAbs: string,
  staged = false
): Promise<{ ok: boolean; diff: string; error?: string; note?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, diff: '', error: 'Not a git repository' }
  const resolved = resolveRepoRel(workspaceRoot, repoRoot, relOrAbs)
  if ('error' in resolved) return { ok: false, diff: '', error: resolved.error }
  const { abs, rel } = resolved

  if (!existsSync(abs)) {
    return { ok: false, diff: '', error: `Path not found: ${rel}` }
  }
  try {
    const { statSync } = await import('fs')
    if (statSync(abs).isDirectory()) {
      return {
        ok: false,
        diff: '',
        error: `Path is a directory (pass a file): ${rel}`
      }
    }
  } catch {
    return { ok: false, diff: '', error: `Cannot stat path: ${rel}` }
  }

  try {
    const args = staged
      ? ['diff', '--cached', '--', rel]
      : ['diff', 'HEAD', '--', rel]
    const { stdout } = await git(repoRoot, args, { allowFail: true })
    if (stdout.trim()) {
      return { ok: true, diff: stdout.slice(0, 200_000) }
    }
    // Untracked full-file preview only for worktree (not --cached / staged)
    if (!staged) {
      const st = await gitStatus(workspaceRoot)
      const f = st.files.find((x) => x.relPath === rel || x.path === abs)
      if (f?.untracked && existsSync(abs)) {
        const { readFileSync } = await import('fs')
        const body = readFileSync(abs, 'utf-8')
        const lines = body.split('\n').map((l) => `+${l}`).join('\n')
        return {
          ok: true,
          diff: `--- /dev/null\n+++ b/${rel}\n${lines}`,
          note: 'Untracked file (not in index). staged=true returns empty until git add.'
        }
      }
    }
    return {
      ok: true,
      diff: '',
      note: staged
        ? 'No staged diff for this path (untracked or nothing in index).'
        : 'No diff vs HEAD (unchanged or empty).'
    }
  } catch (e) {
    return { ok: false, diff: '', error: e instanceof Error ? e.message : String(e) }
  }
}

export async function gitStage(
  workspaceRoot: string,
  relPaths: string[]
): Promise<{ ok: boolean; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  if (!relPaths.length) return { ok: false, error: 'No paths to stage' }
  try {
    const rels: string[] = []
    for (const p of relPaths) {
      const resolved = resolveRepoRel(workspaceRoot, repoRoot, p)
      if ('error' in resolved) return { ok: false, error: resolved.error }
      rels.push(resolved.rel)
    }
    const r = await git(repoRoot, ['add', '--', ...rels], { allowFail: true })
    if (r.code !== 0) {
      return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git add failed' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** `git add -A` (stage all changes including untracked, respecting gitignore). */
export async function gitAddAll(
  workspaceRoot: string
): Promise<{ ok: boolean; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const r = await git(repoRoot, ['add', '-A'], { allowFail: true })
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git add -A failed' }
  }
  return { ok: true }
}

export async function gitUnstage(workspaceRoot: string, relPaths: string[]): Promise<{ ok: boolean; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  try {
    const rels: string[] = []
    for (const p of relPaths) {
      const resolved = resolveRepoRel(workspaceRoot, repoRoot, p)
      if ('error' in resolved) return { ok: false, error: resolved.error }
      rels.push(resolved.rel)
    }
    await git(repoRoot, ['restore', '--staged', '--', ...rels], { allowFail: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Map empty-index / clean-tree commit failures to agent-readable errors (GIT-1). */
export function formatGitCommitFailure(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`
  const lower = combined.toLowerCase()
  if (/nothing to commit/.test(lower) && /working tree clean/.test(lower)) {
    return 'Nothing to commit — working tree clean (no staged or unstaged changes). Call git_status; do not retry commit until there are changes.'
  }
  if (/no changes added to commit|nothing to commit/.test(lower)) {
    return 'Nothing staged to commit. Run git_add first (working tree may still have unstaged/untracked files). Note: one git_commit always commits the whole index — split commits with add→commit per batch.'
  }
  const trimmed = stderr.trim() || stdout.trim()
  if (trimmed) return trimmed.slice(0, 2000)
  return 'git commit failed'
}

export async function gitCommit(
  workspaceRoot: string,
  message: string
): Promise<{ ok: boolean; stdout?: string; error?: string }> {
  const msg = message.trim()
  if (!msg) return { ok: false, error: 'Commit message required' }
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const r = await git(repoRoot, ['commit', '-m', msg], { allowFail: true })
  if (r.code !== 0) {
    return {
      ok: false,
      error: formatGitCommitFailure(r.stdout, r.stderr),
      stdout: r.stdout.slice(0, 4000)
    }
  }
  return { ok: true, stdout: clipLines(r.stdout) }
}

/** Accept https/ssh/git/file URLs, scp-like, and local paths (spaces allowed — e.g. Windows dirs). */
export function isValidGitRemoteUrl(url: string): boolean {
  const u = url.trim()
  if (!u || /[\x00-\x1f]/.test(u)) return false
  if (/^(https?|git|ssh|file):\/\//i.test(u)) return true
  // scp-like: git@host:path/to/repo.git
  if (/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+[:]/.test(u)) return true
  // Windows drive path: D:\... or D:/...
  if (/^[A-Za-z]:[\\/]/.test(u)) return true
  // UNC \\server\share\...
  if (/^\\\\[^\\/\s]+[\\/]/.test(u)) return true
  // Unix absolute / relative
  if (/^(\/|\.\/|\.\.\/)/.test(u)) return true
  // Sibling / bare name ending in .git
  if (/^[^:*?<>|]+\.git\/?$/i.test(u)) return true
  return false
}

/** True for file:// or filesystem paths (not https/ssh/git@). */
export function isLocalGitRemoteUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return false
  if (/^file:\/\//i.test(u)) return true
  if (/^(https?|git|ssh):\/\//i.test(u)) return false
  if (/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+[:]/.test(u)) return false
  return isValidGitRemoteUrl(u)
}

/** Resolve file:// or relative local remote URL to an absolute filesystem path. */
export function resolveLocalRemoteFsPath(url: string, workspaceRoot: string): string | null {
  const u = url.trim()
  if (!isLocalGitRemoteUrl(u)) return null
  try {
    if (/^file:\/\//i.test(u)) return fileURLToPath(u)
    if (/^[A-Za-z]:[\\/]/.test(u) || u.startsWith('/') || u.startsWith('\\\\')) {
      return resolve(u)
    }
    return resolve(workspaceRoot, u)
  } catch {
    return null
  }
}

/**
 * Ensure a local bare repo exists at absPath.
 * Missing → `git init --bare`. Existing Git dir → ok. Existing non-git → error.
 */
export async function ensureLocalBareRepo(
  absPath: string
): Promise<{ ok: boolean; created: boolean; path: string; error?: string }> {
  const target = resolve(absPath)
  try {
    assertSafeExternalGitPath(target)
  } catch (e) {
    return {
      ok: false,
      created: false,
      path: target,
      error: e instanceof Error ? e.message : String(e)
    }
  }
  if (!target || target.length < 2) {
    return { ok: false, created: false, path: target, error: 'Invalid bare repo path' }
  }
  if (existsSync(target)) {
    if (existsSync(join(target, 'HEAD')) || existsSync(join(target, 'objects'))) {
      return { ok: true, created: false, path: target }
    }
    return {
      ok: false,
      created: false,
      path: target,
      error: `Path exists but is not a Git repository: ${target}`
    }
  }
  try {
    mkdirSync(dirname(target), { recursive: true })
    const parent = dirname(target)
    const r = await git(parent, ['init', '--bare', target], { allowFail: true })
    if (r.code !== 0) {
      return {
        ok: false,
        created: false,
        path: target,
        error: r.stderr.trim() || r.stdout.trim() || 'git init --bare failed'
      }
    }
    return { ok: true, created: true, path: target }
  } catch (e) {
    return {
      ok: false,
      created: false,
      path: target,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

async function ensureBareForLocalRemoteUrl(
  workspaceRoot: string,
  remoteUrl: string
): Promise<{ ok: boolean; created: boolean; path?: string; error?: string; skipped?: boolean }> {
  if (!isLocalGitRemoteUrl(remoteUrl)) {
    return { ok: true, created: false, skipped: true }
  }
  const fsPath = resolveLocalRemoteFsPath(remoteUrl, workspaceRoot)
  if (!fsPath) {
    return { ok: false, created: false, error: 'Could not resolve local remote path' }
  }
  const ensured = await ensureLocalBareRepo(fsPath)
  return {
    ok: ensured.ok,
    created: ensured.created,
    path: ensured.path,
    error: ensured.error
  }
}

export async function gitRemoteAdd(
  workspaceRoot: string,
  name: string,
  url: string,
  opts?: { createBare?: boolean }
): Promise<{ ok: boolean; error?: string; bareCreated?: boolean; barePath?: string }> {
  const remote = name.trim()
  const remoteUrl = url.trim()
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(remote)) {
    return { ok: false, error: 'Invalid remote name (use letters/digits/_/./-)' }
  }
  if (!isValidGitRemoteUrl(remoteUrl)) {
    return {
      ok: false,
      error:
        'Invalid remote URL (use https://, ssh://, git@host:path, file://, or a local path — spaces in paths are OK)'
    }
  }
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const existing = await gitRemoteList(workspaceRoot)
  if (existing.remotes.includes(remote)) {
    return { ok: false, error: `Remote "${remote}" already exists` }
  }

  const createBare = opts?.createBare !== false
  let bareCreated = false
  let barePath: string | undefined
  if (createBare) {
    const ensured = await ensureBareForLocalRemoteUrl(workspaceRoot, remoteUrl)
    if (!ensured.ok) {
      return { ok: false, error: ensured.error }
    }
    bareCreated = ensured.created
    barePath = ensured.path
  }

  const r = await git(repoRoot, ['remote', 'add', remote, remoteUrl], { allowFail: true })
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git remote add failed' }
  }
  return { ok: true, bareCreated, barePath }
}

export async function gitRemoteRemove(
  workspaceRoot: string,
  name: string
): Promise<{ ok: boolean; error?: string }> {
  const remote = name.trim()
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(remote)) {
    return { ok: false, error: 'Invalid remote name' }
  }
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const existing = await gitRemoteList(workspaceRoot)
  if (!existing.remotes.includes(remote)) {
    return { ok: false, error: `Remote "${remote}" not found` }
  }
  const r = await git(repoRoot, ['remote', 'remove', remote], { allowFail: true })
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git remote remove failed' }
  }
  return { ok: true }
}

export async function gitRemoteGetUrl(
  workspaceRoot: string,
  name: string
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const remote = name.trim()
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const r = await git(repoRoot, ['remote', 'get-url', remote], { allowFail: true })
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || 'git remote get-url failed' }
  }
  return { ok: true, url: r.stdout.trim() }
}

export async function gitLog(
  workspaceRoot: string,
  opts?: { maxCount?: number }
): Promise<{ ok: boolean; lines: string[]; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, lines: [], error: 'Not a git repository' }
  const n = Math.min(50, Math.max(1, opts?.maxCount ?? 20))
  const r = await git(repoRoot, ['log', `-n${n}`, '--oneline', '--decorate'], { allowFail: true })
  if (r.code !== 0) {
    return {
      ok: false,
      lines: [],
      error: r.stderr.trim() || r.stdout.trim() || 'git log failed (no commits yet?)'
    }
  }
  const lines = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return { ok: true, lines }
}

/**
 * Discard working tree changes for a path.
 * Tracked: git checkout/restore. Untracked: delete (caller must confirm).
 */
export async function gitDiscard(
  workspaceRoot: string,
  absPath: string,
  opts?: { untrackedConfirmed?: boolean }
): Promise<{ ok: boolean; deleted?: boolean; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, error: 'Not a git repository' }
  const resolved = resolveRepoRel(workspaceRoot, repoRoot, absPath)
  if ('error' in resolved) return { ok: false, error: resolved.error }
  const { abs, rel } = resolved
  const st = await gitStatus(workspaceRoot)
  const file = st.files.find(
    (f) => f.relPath === rel || resolve(f.path) === abs
  )
  try {
    if (file?.untracked) {
      if (!opts?.untrackedConfirmed) {
        return { ok: false, error: 'Untracked discard requires confirmation' }
      }
      if (existsSync(abs)) {
        const { statSync } = await import('fs')
        const s = statSync(abs)
        if (s.isDirectory()) rmSync(abs, { recursive: true, force: true })
        else unlinkSync(abs)
      }
      return { ok: true, deleted: true }
    }
    await git(repoRoot, ['restore', '--source=HEAD', '--worktree', '--', rel], { allowFail: true })
    // also unstage if staged
    await git(repoRoot, ['restore', '--staged', '--', rel], { allowFail: true })
    return { ok: true, deleted: false }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Agent-safe summary of status. May auto-init workspace root if no `.git` yet. */
export async function gitStatusSummary(workspaceRoot: string): Promise<Record<string, unknown>> {
  const ensured = await ensureWorkspaceGit(workspaceRoot)
  const repoRoot = ensured.repoRoot || findGitRoot(workspaceRoot)
  let gitignoreUpdated = false
  if (repoRoot) {
    gitignoreUpdated = ensureKentuckyGitignore(repoRoot).updated
  }
  const st = await gitStatus(workspaceRoot)
  const remotes = repoRoot ? await gitRemoteList(workspaceRoot) : { ok: false, remotes: [] as string[] }
  return {
    ok: !st.error || st.repoRoot != null,
    repoRoot: st.repoRoot,
    branch: st.branch,
    error: st.error || (ensured.ok ? null : ensured.error),
    remotes: remotes.remotes,
    gitignoreUpdated,
    repoCreated: ensured.created,
    fileCount: st.files.length,
    files: st.files.slice(0, 80).map((f) => ({
      path: f.relPath,
      index: f.index,
      worktree: f.worktree,
      untracked: f.untracked
    }))
  }
}

/**
 * Compact live Git snapshot for every Agent turn (survives new chats).
 * Encourages calling git_* tools instead of relying on prior conversation.
 */
export async function buildGitL5Summary(workspaceRoot: string | null): Promise<string | null> {
  if (!workspaceRoot) return null
  try {
    const summary = await gitStatusSummary(workspaceRoot)
    const remotes = Array.isArray(summary.remotes) ? (summary.remotes as string[]) : []
    const files = Array.isArray(summary.files)
      ? (summary.files as Array<{ path: string }>)
      : []
    const sample = files
      .slice(0, 10)
      .map((f) => f.path)
      .join(', ')
    const n = typeof summary.fileCount === 'number' ? summary.fileCount : files.length
    const envDoc = findWorkspaceGitEnvDoc(workspaceRoot)
    const lines = [
      'Git (L5 — snapshot at the start of this user turn; call git_* tools for current status — do not invent status from chat memory):',
      summary.error && !summary.repoRoot
        ? `- unavailable: ${String(summary.error)}`
        : `- repo: ${summary.repoRoot || 'none'} · branch: ${summary.branch || '—'} · remotes: ${
            remotes.length ? remotes.join(', ') : '(none)'
          } · dirty: ${n}${sample ? ` [${sample}${n > 10 ? ', …' : ''}]` : ''}`,
      envDoc
        ? `- Workspace Git env doc found: ${envDoc} — in a new chat, read_file it first, then git_status. Do not use remotes from other workspaces.`
        : '- No workspace Git env doc in this root (optional agent-GIT环境说明.md / AGENT-GIT-ENV.md). Discover remotes only via git_status; never invent URLs from other folders or prior chats.',
      '- Prefer tools: git_status → (git_diff) → git_add → git_commit → git_push. Remotes: git_remote_add / git_remote_remove. History: git_log. Sync: git_pull.',
      '- One commit = whole index; empty index → Nothing to commit (check git_status). Paths are always relative to THIS workspace root.'
    ]
    return lines.join('\n')
  } catch {
    return null
  }
}

/** Workspace-root cheat sheet so new chats inherit remotes / branch recipes. */
export function findWorkspaceGitEnvDoc(workspaceRoot: string): string | null {
  const candidates = [
    'agent-GIT环境说明.md',
    'agent-Git环境说明.md',
    'AGENT-GIT-ENV.md',
    'agent-git-env.md'
  ]
  for (const name of candidates) {
    if (existsSync(join(workspaceRoot, name))) return name
  }
  return null
}

export async function gitRemoteList(
  workspaceRoot: string
): Promise<{ ok: boolean; remotes: string[]; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, remotes: [], error: 'Not a git repository' }
  try {
    const { stdout, code, stderr } = await git(repoRoot, ['remote'], { allowFail: true })
    if (code !== 0) return { ok: false, remotes: [], error: stderr || 'git remote failed' }
    const remotes = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    return { ok: true, remotes }
  } catch (e) {
    return { ok: false, remotes: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Pull from remote. No arbitrary argv. Default: `git pull` (or `git pull <remote> <branch>`).
 * Optional ffOnly → `--ff-only`.
 */
export async function gitPull(
  workspaceRoot: string,
  opts?: { remote?: string; branch?: string; ffOnly?: boolean }
): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, stdout: '', stderr: '', error: 'Not a git repository' }
  const remotes = await gitRemoteList(workspaceRoot)
  if (!remotes.remotes.length) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'No remotes configured. Add one first: git remote add origin <url> (outside Agent, or ask user).'
    }
  }
  const remote = (opts?.remote || '').trim()
  const branch = (opts?.branch || '').trim()
  if (remote && !remotes.remotes.includes(remote)) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: `Unknown remote "${remote}". Known: ${remotes.remotes.join(', ')}`
    }
  }
  const args = ['pull']
  if (opts?.ffOnly) args.push('--ff-only')
  if (remote) {
    args.push(remote)
    if (branch) args.push(branch)
  }
  const r = await git(repoRoot, args, { allowFail: true })
  if (r.code !== 0) {
    return {
      ok: false,
      stdout: r.stdout.slice(0, 8000),
      stderr: r.stderr.slice(0, 8000),
      error: r.stderr.trim() || r.stdout.trim() || 'git pull failed'
    }
  }
  return { ok: true, stdout: r.stdout.slice(0, 8000), stderr: r.stderr.slice(0, 8000) }
}

/**
 * Push to remote. Never --force / --force-with-lease.
 * Optional setUpstream → `-u <remote> <branch>`.
 * Local path remotes: auto `git init --bare` if the target folder is missing.
 */
export async function gitPush(
  workspaceRoot: string,
  opts?: { remote?: string; branch?: string; setUpstream?: boolean }
): Promise<{
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  bareCreated?: boolean
  barePath?: string
}> {
  const repoRoot = findGitRoot(workspaceRoot)
  if (!repoRoot) return { ok: false, stdout: '', stderr: '', error: 'Not a git repository' }
  const remotes = await gitRemoteList(workspaceRoot)
  if (!remotes.remotes.length) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: 'No remotes configured. Add one first (git remote add origin <url>).'
    }
  }
  const remote = (opts?.remote || '').trim() || remotes.remotes[0]!
  if (!remotes.remotes.includes(remote)) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: `Unknown remote "${remote}". Known: ${remotes.remotes.join(', ')}`
    }
  }

  let bareCreated = false
  let barePath: string | undefined
  const urlInfo = await gitRemoteGetUrl(workspaceRoot, remote)
  if (urlInfo.ok && urlInfo.url) {
    const ensured = await ensureBareForLocalRemoteUrl(workspaceRoot, urlInfo.url)
    if (!ensured.ok) {
      return {
        ok: false,
        stdout: '',
        stderr: '',
        error: ensured.error || 'Failed to ensure local bare remote'
      }
    }
    bareCreated = ensured.created
    barePath = ensured.path
  }

  const branch = (opts?.branch || '').trim()
  const args = ['push']
  if (opts?.setUpstream) {
    if (!branch) {
      return {
        ok: false,
        stdout: '',
        stderr: '',
        error: 'setUpstream requires branch (e.g. master / main).'
      }
    }
    args.push('-u', remote, branch)
  } else {
    args.push(remote)
    if (branch) args.push(branch)
  }
  const r = await git(repoRoot, args, { allowFail: true })
  if (r.code !== 0) {
    return {
      ok: false,
      stdout: r.stdout.slice(0, 8000),
      stderr: r.stderr.slice(0, 8000),
      error: r.stderr.trim() || r.stdout.trim() || 'git push failed',
      bareCreated,
      barePath
    }
  }
  return {
    ok: true,
    stdout: r.stdout.slice(0, 8000),
    stderr: r.stderr.slice(0, 8000),
    bareCreated,
    barePath
  }
}
