/** RFC 4180-ish delimited table parse / sniff (renderer + tests). */

export type CsvDelimiter = ',' | '\t' | ';'

export interface CsvTable {
  delimiter: CsvDelimiter
  headers: string[]
  rows: string[][]
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '')
}

function splitRecords(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  const s = stripBom(text)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n') {
      row.push(cur)
      cur = ''
      rows.push(row)
      row = []
    } else if (ch === '\r') {
      /* skip; \r\n handled by \n */
    } else {
      cur += ch
    }
  }
  if (inQuotes) {
    /* unclosed quote — still flush */
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0) || r.length > 1)
}

function unquotedCount(line: string, delim: string): number {
  let n = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++
      else inQuotes = !inQuotes
    } else if (!inQuotes && ch === delim) n++
  }
  return n
}

function firstLogicalLine(text: string): string {
  const s = stripBom(text)
  let inQuotes = false
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        out += '""'
        i++
      } else {
        inQuotes = !inQuotes
        out += ch
      }
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      break
    } else {
      out += ch
    }
  }
  return out
}

export function detectCsvDelimiter(text: string): CsvDelimiter | null {
  const line = firstLogicalLine(text)
  if (!line.trim()) return null
  const scores: Array<{ d: CsvDelimiter; n: number }> = [
    { d: ',', n: unquotedCount(line, ',') },
    { d: '\t', n: unquotedCount(line, '\t') },
    { d: ';', n: unquotedCount(line, ';') }
  ]
  scores.sort((a, b) => b.n - a.n)
  if (scores[0].n < 1) return null
  if (scores[0].n === scores[1].n) {
    /* tie: prefer comma */
    if (scores[0].n === unquotedCount(line, ',')) return ','
  }
  return scores[0].d
}

function looksLikeJson(raw: string): boolean {
  const t = raw.trimStart()
  return t.startsWith('{') || t.startsWith('[')
}

function looksLikeYaml(lines: string[]): boolean {
  if (lines[0]?.trim() === '---') return true
  const sample = lines.slice(0, 4)
  if (sample.length === 0) return false
  return sample.every((l) => /^[\w.-]+\s*:\s+\S/.test(l) && !/[,\t;]/.test(l))
}

export function looksLikeDelimitedTable(text: string): boolean {
  const raw = stripBom(text)
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (looksLikeJson(trimmed)) return false
  const nonempty = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (nonempty.length < 2) return false
  if (looksLikeYaml(nonempty)) return false
  const delim = detectCsvDelimiter(raw)
  if (!delim) return false
  const records = splitRecords(raw, delim)
  if (records.length < 2) return false
  const widths = records.map((r) => r.length)
  const max = Math.max(...widths)
  if (max < 2) return false
  const majority = widths.filter((w) => w === max).length
  return majority >= Math.ceil(records.length * 0.7)
}

function padRow(row: string[], cols: number): string[] {
  const next = row.slice(0, cols)
  while (next.length < cols) next.push('')
  return next
}

export function parseCsvTable(text: string): { table: CsvTable | null; error?: string } {
  const raw = stripBom(text)
  if (!raw.trim()) {
    return {
      table: {
        delimiter: ',',
        headers: ['col1', 'col2'],
        rows: [['', '']]
      }
    }
  }
  const delim = detectCsvDelimiter(raw)
  if (!delim) return { table: null, error: 'no-delimiter' }
  const records = splitRecords(raw, delim)
  if (records.length === 0) return { table: null, error: 'empty' }
  const cols = Math.max(...records.map((r) => r.length), 1)
  const headers = padRow(records[0], cols).map((h, i) => h.trim() || `col${i + 1}`)
  const rows = records.slice(1).map((r) => padRow(r, cols))
  return { table: { delimiter: delim, headers, rows } }
}

function escapeCell(v: string, delimiter: CsvDelimiter): string {
  const s = String(v ?? '')
  if (/["\n\r]/.test(s) || s.includes(delimiter)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function serializeCsvTable(table: CsvTable): string {
  const cols = Math.max(table.headers.length, ...table.rows.map((r) => r.length), 1)
  const header = padRow(table.headers, cols)
    .map((c) => escapeCell(c, table.delimiter))
    .join(table.delimiter)
  const body = table.rows.map((r) =>
    padRow(r, cols)
      .map((c) => escapeCell(c, table.delimiter))
      .join(table.delimiter)
  )
  return [header, ...body].join('\n') + (body.length ? '\n' : '\n')
}
