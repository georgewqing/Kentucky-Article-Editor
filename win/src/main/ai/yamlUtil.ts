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

export function normRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}
