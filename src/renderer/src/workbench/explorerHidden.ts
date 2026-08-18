/** Mirrors main explorer hide rules (`shouldInclude` in `src/main/index.ts`). */

export function isExplorerHiddenRel(rel: string): boolean {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean)
  if (!parts.length) return false
  if (parts.some((p) => p.startsWith('.'))) return true
  const top = parts[0].toLowerCase()
  return top === 'revisions' || top === 'node_modules' || top === 'dist' || top === 'out'
}

export function isExplorerHiddenAbs(workspacePath: string | null, absPath: string): boolean {
  const abs = absPath.replace(/\\/g, '/')
  if (workspacePath) {
    const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
    const absKey = abs.toLowerCase()
    const rootKey = root.toLowerCase()
    if (absKey === rootKey) return false
    if (absKey.startsWith(rootKey + '/')) {
      return isExplorerHiddenRel(abs.slice(root.length).replace(/^\/+/, ''))
    }
  }
  const base = abs.split('/').pop() || ''
  return base.startsWith('.')
}
