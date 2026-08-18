import { dump, load } from 'js-yaml'

/** Parse YAML; unknown keys preserved. Empty/missing → null. */
export function parseYamlDoc(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    const doc = load(text)
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null
    return doc as Record<string, unknown>
  } catch {
    return null
  }
}

export function dumpYamlDoc(doc: unknown): string {
  return dump(doc, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false
  })
}

export function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val == null) continue
    out[String(k)] = String(val)
  }
  return out
}

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x)).filter(Boolean)
}

/**
 * Coerce tool-arg booleans. Models often send `"false"` / `0` as strings/numbers;
 * `x !== false` would treat those as true.
 */
export function asBool(v: unknown, defaultValue: boolean): boolean {
  if (v === undefined || v === null) return defaultValue
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true
  }
  return Boolean(v)
}

export function normRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}
