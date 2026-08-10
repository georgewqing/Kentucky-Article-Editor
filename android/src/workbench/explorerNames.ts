/** Known multi-part / single extensions stripped from explorer display & rename stem. */
const STRIP_EXTS = [
  '.dialogue.layout.json',
  '.dialogue.choices.json',
  '.dialogue.meta.json',
  '.dialogue.csv',
  '.kmind',
  '.md',
  '.txt',
  '.csv',
  '.json'
] as const

/** Extension used when creating a plain text/markdown file from the sidebar. */
export const CREATE_FILE_EXT = '.md'
export const CREATE_MINDMAP_EXT = '.kmind'

export function splitKnownExt(fileName: string): { stem: string; ext: string } {
  const lower = fileName.toLowerCase()
  for (const ext of STRIP_EXTS) {
    if (lower.endsWith(ext)) {
      return { stem: fileName.slice(0, -ext.length), ext: fileName.slice(-ext.length) }
    }
  }
  const dot = fileName.lastIndexOf('.')
  if (dot > 0) {
    return { stem: fileName.slice(0, dot), ext: fileName.slice(dot) }
  }
  return { stem: fileName, ext: '' }
}

/** Tree label: hide known extensions (type shown via colored letter icons). */
export function displayEntryName(name: string, isDirectory: boolean): string {
  if (isDirectory) return name
  const { stem } = splitKnownExt(name)
  return stem || name
}

/** Rename/create: keep original (or default) extension; user only edits the stem. */
export function applyStemKeepExt(stemInput: string, preservedExt: string): string {
  let stem = stemInput.trim()
  if (!stem) return ''
  // If user pasted a full name with the same ext, strip it once
  if (preservedExt) {
    const lower = stem.toLowerCase()
    const pe = preservedExt.toLowerCase()
    if (lower.endsWith(pe)) stem = stem.slice(0, -preservedExt.length)
  }
  stem = stem.replace(/[/\\]/g, '').trim()
  if (!stem) return ''
  return preservedExt ? `${stem}${preservedExt}` : stem
}
