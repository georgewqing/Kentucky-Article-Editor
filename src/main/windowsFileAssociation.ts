/**
 * Per-user Windows "Open with" registration for .md (no admin, does not steal the default).
 * Only the packaged exe is registered — never electron.exe from `npm run dev`.
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { dirname, extname, join, resolve, sep } from 'path'
import { promisify } from 'util'
import { assertInsideWorkspace, assertSafeWorkspaceRoot } from './ai/workspacePath'
import { listWorkspaceRoots } from './windowRegistry'

const execFileAsync = promisify(execFile)

export const MD_OPEN_PROG_ID = 'KENTUCKY.md'

const OPEN_EXTS = new Set(['.md', '.txt', '.kmind', '.kyboard', '.csv', '.json', '.yaml', '.yml'])

export type OpenDocumentTarget = {
  filePath: string
  workspacePath: string
}

function regExe(): string {
  const root = process.env.SystemRoot || 'C:\\Windows'
  return join(root, 'System32', 'reg.exe')
}

async function regAdd(
  key: string,
  valueName: string | null,
  data: string,
  type: 'REG_SZ' | 'REG_EXPAND_SZ' = 'REG_SZ'
): Promise<void> {
  const args = ['add', key, '/f', '/t', type]
  if (valueName == null) args.push('/ve')
  else args.push('/v', valueName)
  args.push('/d', data)
  await execFileAsync(regExe(), args, { windowsHide: true, timeout: 8_000 })
}

function exeLooksEphemeral(exe: string): boolean {
  const lower = exe.replace(/\//g, '\\').toLowerCase()
  return (
    lower.includes('\\temp\\') ||
    lower.includes('\\appdata\\local\\temp\\') ||
    /\\appdata\\local\\{/.test(lower)
  )
}

/** Packaged folder/dir build only. Portable-to-temp and `npm run dev` are skipped. */
export function shouldRegisterMarkdownOpenWith(): boolean {
  return process.platform === 'win32' && app.isPackaged && !exeLooksEphemeral(process.execPath)
}

export async function registerMarkdownOpenWith(): Promise<void> {
  if (!shouldRegisterMarkdownOpenWith()) return
  const exe = resolve(process.execPath)
  const command = `"${exe}" "%1"`
  const icon = `${exe},0`
  const writes: Array<Promise<void>> = [
    regAdd(`HKCU\\Software\\Classes\\${MD_OPEN_PROG_ID}`, null, 'Markdown Document'),
    regAdd(`HKCU\\Software\\Classes\\${MD_OPEN_PROG_ID}\\DefaultIcon`, null, icon),
    regAdd(`HKCU\\Software\\Classes\\${MD_OPEN_PROG_ID}\\shell\\open\\command`, null, command),
    regAdd(`HKCU\\Software\\Classes\\.md\\OpenWithProgids`, MD_OPEN_PROG_ID, ''),
    regAdd('HKCU\\Software\\Classes\\Applications\\KENTUCKY.exe\\SupportedTypes', '.md', ''),
    regAdd(
      'HKCU\\Software\\Classes\\Applications\\KENTUCKY.exe\\shell\\open\\command',
      null,
      command
    ),
    regAdd('HKCU\\Software\\KENTUCKY\\Capabilities', 'ApplicationName', 'KENTUCKY'),
    regAdd(
      'HKCU\\Software\\KENTUCKY\\Capabilities',
      'ApplicationDescription',
      'KENTUCKY Markdown writing'
    ),
    regAdd('HKCU\\Software\\KENTUCKY\\Capabilities', 'ApplicationIcon', icon),
    regAdd('HKCU\\Software\\KENTUCKY\\Capabilities\\FileAssociations', '.md', MD_OPEN_PROG_ID),
    regAdd('HKCU\\Software\\RegisteredApplications', 'KENTUCKY', 'Software\\KENTUCKY\\Capabilities'),
    regAdd(
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\OpenWithProgids',
      MD_OPEN_PROG_ID,
      ''
    )
  ]
  await Promise.allSettled(writes)
  const ie4 = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe')
  if (existsSync(ie4)) {
    try {
      await execFileAsync(ie4, ['-show'], { windowsHide: true, timeout: 8_000 })
    } catch {
      /* ignore */
    }
  }
}

export function parseOpenFileFromArgv(argv: string[]): string | null {
  const skip = new Set([resolve(process.execPath).toLowerCase()])
  for (const raw of argv) {
    if (!raw || raw.startsWith('-')) continue
    let abs: string
    try {
      abs = resolve(raw)
    } catch {
      continue
    }
    if (skip.has(abs.toLowerCase())) continue
    const lower = abs.toLowerCase()
    if (lower.endsWith('.asar') || lower.includes(`${sep}node_modules${sep}`)) {
      continue
    }
    const ext = extname(abs).toLowerCase()
    if (!OPEN_EXTS.has(ext)) continue
    try {
      if (!existsSync(abs) || !statSync(abs).isFile()) continue
    } catch {
      continue
    }
    return abs
  }
  return null
}

export function resolveOpenDocument(filePath: string): OpenDocumentTarget | { error: string } {
  const abs = resolve(filePath)
  for (const root of listWorkspaceRoots()) {
    try {
      assertInsideWorkspace(root, abs)
      return { filePath: abs, workspacePath: root }
    } catch {
      /* try next */
    }
  }
  const parent = dirname(abs)
  try {
    assertSafeWorkspaceRoot(parent)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err)
    }
  }
  return { filePath: abs, workspacePath: parent }
}
