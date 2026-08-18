import { existsSync, readFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { getDoc } from '../documentHub'
import { assertWritableLocalPath } from '../ipcSandbox'
import { resolveWorkspacePath, toWorkspaceRel } from '../ai/workspacePath'
import { markdownToPrintHtml } from './markdownToPrintHtml'
import { printHtmlToPdf } from './printHtmlToPdf'

export type ExportWorkspacePdfResult =
  | {
      ok: true
      path: string
      source: string
      dest: string
      bytes: number
      fromBuffer: boolean
    }
  | { ok: false; error: string; note?: string }

function siblingPdf(abs: string): string {
  const ext = extname(abs)
  const stem = ext ? basename(abs).slice(0, -ext.length) : basename(abs)
  return join(dirname(abs), `${stem}.pdf`)
}

function readMarkdown(abs: string): { text: string; fromBuffer: boolean } | null {
  const hub = getDoc(abs)
  if (hub) return { text: hub.content, fromBuffer: hub.dirty }
  if (existsSync(abs)) return { text: readFileSync(abs, 'utf-8'), fromBuffer: false }
  return null
}

/** Write A4 portrait PDF of a workspace `.md` (no save dialog). Overwrites dest. */
export async function exportWorkspacePdf(opts: {
  workspaceRoot: string
  sourceRel: string
  destRel?: string
}): Promise<ExportWorkspacePdfResult> {
  const sourceRel = String(opts.sourceRel || '').trim()
  if (!sourceRel) return { ok: false, error: 'NO_SOURCE' }

  let sourceAbs: string
  try {
    sourceAbs = resolveWorkspacePath(opts.workspaceRoot, sourceRel)
  } catch {
    return { ok: false, error: 'PATH_NOT_ALLOWED' }
  }

  const srcExt = extname(sourceAbs).toLowerCase()
  if (srcExt === '.kmind') {
    return {
      ok: false,
      error: 'UNSUPPORTED',
      note: 'Mind maps need the UI File → Export PDF path (React Flow capture). Agent can only export .md.'
    }
  }
  if (srcExt !== '.md') {
    return {
      ok: false,
      error: 'UNSUPPORTED',
      note: 'Only workspace Markdown (.md). Not dialogue, storyboard, txt, or kmind.'
    }
  }

  const loaded = readMarkdown(sourceAbs)
  if (!loaded) return { ok: false, error: 'SOURCE_NOT_FOUND' }
  if (!loaded.text.trim()) return { ok: false, error: 'EMPTY' }

  let destAbs: string
  try {
    destAbs = opts.destRel?.trim()
      ? resolveWorkspacePath(opts.workspaceRoot, opts.destRel.trim())
      : siblingPdf(sourceAbs)
    assertWritableLocalPath(destAbs, opts.workspaceRoot)
  } catch {
    return { ok: false, error: 'PATH_NOT_ALLOWED' }
  }
  if (extname(destAbs).toLowerCase() !== '.pdf') {
    return { ok: false, error: 'NOT_PDF' }
  }

  const html = markdownToPrintHtml(loaded.text)
  const printed = await printHtmlToPdf({ destAbs, html, landscape: false })
  if (!printed.ok) return printed

  return {
    ok: true,
    path: toWorkspaceRel(opts.workspaceRoot, printed.path),
    source: toWorkspaceRel(opts.workspaceRoot, sourceAbs),
    dest: toWorkspaceRel(opts.workspaceRoot, printed.path),
    bytes: printed.bytes,
    fromBuffer: loaded.fromBuffer
  }
}
