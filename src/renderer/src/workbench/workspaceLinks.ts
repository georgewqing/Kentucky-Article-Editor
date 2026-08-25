import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import i18n from '@/i18n'

const WORKSPACE_FILE_EXT = /\.(md|txt|csv|json|ya?ml|kmind|kyboard|png|mp4|pdf)$/i

function isInsideWorkspace(workspace: string, abs: string): boolean {
  const w = workspace.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const a = abs.replace(/\\/g, '/').toLowerCase()
  return a === w || a.startsWith(`${w}/`)
}

function decodeMaybe(s: string): string {
  try {
    return decodeURI(s)
  } catch {
    return s
  }
}

function decodePath(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function isAppOriginHttpUrl(url: URL): boolean {
  try {
    if (typeof window === 'undefined' || !window.location?.host) return false
    return url.protocol === window.location.protocol && url.host === window.location.host
  } catch {
    return false
  }
}

/** https://foo.md or https://docs/ch.md — placeholder/TipTap, not a real site. */
function fakeHttpsWorkspacePath(url: URL): string | null {
  const host = url.hostname
  const path = decodePath(url.pathname).replace(/^\/+/, '').replace(/\/+$/, '')
  if (WORKSPACE_FILE_EXT.test(host) && !path) return host
  if (host && !host.includes('.')) {
    return path ? `${host}/${path}` : host
  }
  return null
}

function finishWorkspaceRel(
  pathPart: string,
  lineFromHash?: number
):
  | { kind: 'workspace'; rel: string; line?: number }
  | { kind: 'reject'; reason: string } {
  let p = pathPart.replace(/\\/g, '/')
  const q = p.indexOf('?')
  if (q >= 0) p = p.slice(0, q)
  let line = lineFromHash
  const hashL = /#L(\d+)\s*$/i.exec(p)
  if (hashL) {
    line = Number(hashL[1])
    p = p.slice(0, hashL.index)
  } else {
    const hashIdx = p.indexOf('#')
    if (hashIdx >= 0) p = p.slice(0, hashIdx)
  }
  if (line == null) {
    const colon = /:(\d+)\s*$/.exec(p)
    if (colon) {
      line = Number(colon[1])
      p = p.slice(0, colon.index)
    }
  }
  p = decodeMaybe(p).replace(/\\/g, '/').replace(/^\.\//, '')
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p)) {
    return { kind: 'reject', reason: 'absolute' }
  }
  if (p.includes('://')) return { kind: 'reject', reason: 'scheme' }
  return {
    kind: 'workspace',
    rel: p,
    line: line && line >= 1 ? Math.floor(line) : undefined
  }
}

function parseHrefTarget(
  href: string
):
  | { kind: 'external'; url: string }
  | { kind: 'workspace'; rel: string; line?: number }
  | { kind: 'reject'; reason: string } {
  const raw = String(href || '').trim()
  if (!raw) return { kind: 'reject', reason: 'empty' }
  const lower = raw.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return { kind: 'reject', reason: 'scheme' }
  }
  if (raw.startsWith('//')) return { kind: 'reject', reason: 'scheme' }
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const u = new URL(raw)
      if (isAppOriginHttpUrl(u)) {
        const line =
          /^#L(\d+)$/i.exec(u.hash) != null ? Number(/^#L(\d+)$/i.exec(u.hash)![1]) : undefined
        return finishWorkspaceRel(decodePath(u.pathname).replace(/^\/+/, ''), line)
      }
      const fake = fakeHttpsWorkspacePath(u)
      if (fake) {
        const line =
          /^#L(\d+)$/i.exec(u.hash) != null ? Number(/^#L(\d+)$/i.exec(u.hash)![1]) : undefined
        return finishWorkspaceRel(fake, line)
      }
      return { kind: 'external', url: u.toString() }
    } catch {
      return { kind: 'reject', reason: 'scheme' }
    }
  }
  return finishWorkspaceRel(raw)
}

/** Prefer the stored attribute so Vite does not turn `ch.md` into `http://localhost:…/ch.md`. */
export function hrefFromAnchor(a: HTMLAnchorElement): string {
  const attr = (a.getAttribute('href') || '').trim()
  if (attr) return attr
  return a.href || ''
}

function joinRel(workspace: string, rel: string): string {
  const platform = getPlatform()
  return platform.joinPath(workspace, ...rel.split('/').filter(Boolean))
}

type OpenWorkspaceHrefOpts = {
  /** When set, a bare `sibling.md` is tried next to this file before the workspace root. */
  fromAbs?: string
}

async function openResolvedWorkspaceFile(hit: string, line?: number): Promise<void> {
  const show = useAppStore.getState().showToast
  const role = useAppStore.getState().windowRole
  const tabs = useAppStore.getState().tabs
  if (
    role === 'float' &&
    tabs[0] &&
    tabs[0].path.replace(/\\/g, '/').toLowerCase() !== hit.replace(/\\/g, '/').toLowerCase()
  ) {
    show(i18n.t('errors.linkFloatOtherFile'), 'info')
    return
  }
  await useAppStore.getState().openFile(hit, line ? { line } : undefined)
}

/** Open an already-resolved workspace absolute path in the editor. */
export async function openWorkspaceAbs(absPath: string, opts?: { line?: number }): Promise<void> {
  const show = useAppStore.getState().showToast
  const workspace = useAppStore.getState().workspacePath
  if (!workspace) {
    show(i18n.t('errors.noWorkspace'), 'error')
    return
  }
  const hit = absPath.trim()
  if (!hit || !isInsideWorkspace(workspace, hit)) {
    show(i18n.t('errors.linkMissing'), 'error')
    return
  }
  if (!(await getPlatform().exists(hit))) {
    show(i18n.t('errors.linkMissing'), 'error')
    return
  }
  const line = opts?.line
  await openResolvedWorkspaceFile(
    hit,
    typeof line === 'number' && Number.isFinite(line) && line >= 1 ? Math.floor(line) : undefined
  )
}

/** Open http(s) externally or a workspace-relative file in the editor. */
export async function openWorkspaceHref(
  href: string,
  opts?: OpenWorkspaceHrefOpts
): Promise<void> {
  const platform = getPlatform()
  const parsed = parseHrefTarget(href)
  const show = useAppStore.getState().showToast
  if (parsed.kind === 'reject') {
    show(i18n.t('errors.linkBlocked'), 'error')
    return
  }
  if (parsed.kind === 'external') {
    try {
      await platform.openExternal(parsed.url)
    } catch {
      show(i18n.t('errors.linkBlocked'), 'error')
    }
    return
  }
  const workspace = useAppStore.getState().workspacePath
  if (!workspace) {
    show(i18n.t('errors.noWorkspace'), 'error')
    return
  }
  const candidates: string[] = []
  const fromAbs = opts?.fromAbs?.trim()
  if (fromAbs && isInsideWorkspace(workspace, fromAbs)) {
    const sibling = platform.joinPath(platform.dirname(fromAbs), ...parsed.rel.split('/').filter(Boolean))
    candidates.push(sibling)
  }
  candidates.push(joinRel(workspace, parsed.rel))
  const seen = new Set<string>()
  const unique: string[] = []
  for (const abs of candidates) {
    const key = abs.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(abs)
  }
  let hit: string | null = null
  for (const abs of unique) {
    if (!isInsideWorkspace(workspace, abs)) continue
    if (await platform.exists(abs)) {
      hit = abs
      break
    }
  }
  if (!hit) {
    show(i18n.t('errors.linkMissing'), 'error')
    return
  }
  await openResolvedWorkspaceFile(hit, parsed.line)
}
