/**
 * Agent-only edit highlights in the current file buffer (JS UTF-16 offsets).
 * Added = new sentences/paragraphs (blue). Modified = replacements (yellow).
 * User typing never creates spans; mapping never grows onto insertions.
 */

export type AgentEditKind = 'added' | 'modified'

export type AgentEditSpan = {
  start: number
  end: number
  kind: AgentEditKind
}

export function agentEditPathKey(absPath: string): string {
  return absPath.replace(/\//g, '\\').toLowerCase()
}

type DiffOp =
  | { type: 'eq'; oldStart: number; newStart: number; count: number }
  | { type: 'del'; oldStart: number; count: number }
  | { type: 'ins'; newStart: number; count: number }

const DP_CELL_CAP = 1_200_000
const CHAR_CELL_CAP = 250_000

function diffIndex(
  n: number,
  m: number,
  eq: (i: number, j: number) => boolean
): DiffOp[] {
  if (n === 0 && m === 0) return []
  if (n === 0) return [{ type: 'ins', newStart: 0, count: m }]
  if (m === 0) return [{ type: 'del', oldStart: 0, count: n }]
  if (n * m > DP_CELL_CAP) return diffTrimEnds(n, m, eq)

  const dp: Uint16Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint16Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!
    const next = dp[i + 1]!
    for (let j = m - 1; j >= 0; j--) {
      row[j] = eq(i, j) ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!)
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  const push = (op: DiffOp): void => {
    const last = ops[ops.length - 1]
    if (last && last.type === op.type) {
      if (last.type === 'eq' && op.type === 'eq') {
        last.count += op.count
        return
      }
      if (last.type === 'del' && op.type === 'del') {
        last.count += op.count
        return
      }
      if (last.type === 'ins' && op.type === 'ins') {
        last.count += op.count
        return
      }
    }
    ops.push(op)
  }

  while (i < n && j < m) {
    if (eq(i, j)) {
      const oi = i
      const oj = j
      let count = 0
      while (i < n && j < m && eq(i, j)) {
        i += 1
        j += 1
        count += 1
      }
      push({ type: 'eq', oldStart: oi, newStart: oj, count })
      continue
    }
    if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      const oi = i
      i += 1
      let count = 1
      while (i < n && (j >= m || !eq(i, j)) && dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        i += 1
        count += 1
      }
      push({ type: 'del', oldStart: oi, count })
    } else {
      const oj = j
      j += 1
      let count = 1
      while (j < m && (i >= n || !eq(i, j)) && dp[i + 1]![j]! < dp[i]![j + 1]!) {
        j += 1
        count += 1
      }
      push({ type: 'ins', newStart: oj, count })
    }
  }
  if (i < n) push({ type: 'del', oldStart: i, count: n - i })
  if (j < m) push({ type: 'ins', newStart: j, count: m - j })
  return ops
}

function diffTrimEnds(
  n: number,
  m: number,
  eq: (i: number, j: number) => boolean
): DiffOp[] {
  let start = 0
  while (start < n && start < m && eq(start, start)) start += 1
  let oldEnd = n - 1
  let newEnd = m - 1
  while (oldEnd >= start && newEnd >= start && eq(oldEnd, newEnd)) {
    oldEnd -= 1
    newEnd -= 1
  }
  const ops: DiffOp[] = []
  if (start > 0) ops.push({ type: 'eq', oldStart: 0, newStart: 0, count: start })
  const del = oldEnd - start + 1
  const ins = newEnd - start + 1
  if (del > 0) ops.push({ type: 'del', oldStart: start, count: del })
  if (ins > 0) ops.push({ type: 'ins', newStart: start, count: ins })
  const tail = n - 1 - oldEnd
  if (tail > 0) {
    ops.push({
      type: 'eq',
      oldStart: oldEnd + 1,
      newStart: newEnd + 1,
      count: tail
    })
  }
  return ops
}

function splitLines(text: string): { lines: string[]; starts: number[] } {
  const lines = text.split('\n')
  const starts: number[] = []
  let off = 0
  for (let i = 0; i < lines.length; i++) {
    starts.push(off)
    off += lines[i]!.length
    if (i < lines.length - 1) off += 1
  }
  return { lines, starts }
}

function lineEnd(text: string, starts: number[], i: number): number {
  return i + 1 < starts.length ? starts[i + 1]! : text.length
}

function mapCharsNeverGrow(
  oldChunk: string,
  newChunk: string,
  oldBase: number,
  newBase: number,
  map: Int32Array
): void {
  if (!oldChunk.length) return
  const n = oldChunk.length
  const m = newChunk.length
  if (n * m > CHAR_CELL_CAP) {
    let p = 0
    while (p < n && p < m && oldChunk[p] === newChunk[p]) {
      map[oldBase + p] = newBase + p
      p += 1
    }
    let os = n - 1
    let ns = m - 1
    while (os >= p && ns >= p && oldChunk[os] === newChunk[ns]) {
      map[oldBase + os] = newBase + ns
      os -= 1
      ns -= 1
    }
    return
  }
  const ops = diffIndex(n, m, (i, j) => oldChunk[i] === newChunk[j])
  for (const op of ops) {
    if (op.type !== 'eq') continue
    for (let k = 0; k < op.count; k++) {
      map[oldBase + op.oldStart + k] = newBase + op.newStart + k
    }
  }
}

function buildOldToNewMap(before: string, after: string): Int32Array {
  const map = new Int32Array(before.length)
  map.fill(-1)
  if (!before.length) return map

  const oldP = splitLines(before)
  const newP = splitLines(after)
  const ops = diffIndex(
    oldP.lines.length,
    newP.lines.length,
    (i, j) => oldP.lines[i] === newP.lines[j]
  )

  let hi = 0
  while (hi < ops.length) {
    const op = ops[hi]!
    if (op.type === 'eq') {
      const oldOff = oldP.starts[op.oldStart]!
      const newOff = newP.starts[op.newStart]!
      const oldTo = lineEnd(before, oldP.starts, op.oldStart + op.count - 1)
      for (let k = 0; k < oldTo - oldOff; k++) {
        map[oldOff + k] = newOff + k
      }
      hi += 1
      continue
    }
    let delCount = 0
    let insCount = 0
    let oldStart = -1
    let newStart = -1
    while (hi < ops.length && ops[hi]!.type !== 'eq') {
      const cur = ops[hi]!
      if (cur.type === 'del') {
        if (oldStart < 0) oldStart = cur.oldStart
        delCount += cur.count
      } else {
        if (newStart < 0) newStart = cur.newStart
        insCount += cur.count
      }
      hi += 1
    }
    if (delCount <= 0) continue
    const oldOff = oldP.starts[oldStart]!
    const oldTo = lineEnd(before, oldP.starts, oldStart + delCount - 1)
    if (insCount <= 0) continue
    const newOff = newP.starts[newStart]!
    const newTo = lineEnd(after, newP.starts, newStart + insCount - 1)
    mapCharsNeverGrow(
      before.slice(oldOff, oldTo),
      after.slice(newOff, newTo),
      oldOff,
      newOff,
      map
    )
  }
  return map
}

function collectMappedRuns(
  map: Int32Array,
  start: number,
  end: number,
  kind: AgentEditKind
): AgentEditSpan[] {
  const out: AgentEditSpan[] = []
  let runStart = -1
  let prevNew = -2
  const flush = (): void => {
    if (runStart < 0 || prevNew < 0) return
    out.push({ start: runStart, end: prevNew + 1, kind })
    runStart = -1
    prevNew = -2
  }
  const lo = Math.max(0, start)
  const hi = Math.min(map.length, end)
  for (let i = lo; i < hi; i++) {
    const n = map[i]!
    if (n < 0) {
      flush()
      continue
    }
    if (runStart < 0) {
      runStart = n
      prevNew = n
    } else if (n === prevNew + 1) {
      prevNew = n
    } else {
      flush()
      runStart = n
      prevNew = n
    }
  }
  flush()
  return out
}

function clampSpan(span: AgentEditSpan, len: number): AgentEditSpan | null {
  const start = Math.max(0, Math.min(span.start, len))
  const end = Math.max(0, Math.min(span.end, len))
  if (end <= start) return null
  return { start, end, kind: span.kind }
}

/** Subtract `cutters` from `span` (cutters in the same coordinate space). */
function subtractSpan(span: AgentEditSpan, cutters: AgentEditSpan[]): AgentEditSpan[] {
  let pieces: AgentEditSpan[] = [span]
  for (const c of cutters) {
    const next: AgentEditSpan[] = []
    for (const p of pieces) {
      if (c.end <= p.start || c.start >= p.end) {
        next.push(p)
        continue
      }
      if (c.start > p.start) {
        next.push({ start: p.start, end: Math.min(c.start, p.end), kind: p.kind })
      }
      if (c.end < p.end) {
        next.push({ start: Math.max(c.end, p.start), end: p.end, kind: p.kind })
      }
    }
    pieces = next.filter((x) => x.end > x.start)
  }
  return pieces
}

export function mergeAgentSpans(spans: AgentEditSpan[], fileLen: number): AgentEditSpan[] {
  const cleaned = spans
    .map((s) => clampSpan(s, fileLen))
    .filter((s): s is AgentEditSpan => Boolean(s))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  if (!cleaned.length) return []

  const out: AgentEditSpan[] = []
  for (const s of cleaned) {
    const last = out[out.length - 1]
    if (last && last.kind === s.kind && s.start <= last.end) {
      last.end = Math.max(last.end, s.end)
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/**
 * Spans in `after` for this Agent write. Insert-only hunks → added (blue).
 * Replace hunks → modified (yellow). Deletions produce nothing.
 */
export function spansFromAgentWrite(before: string, after: string): AgentEditSpan[] {
  if (before === after || !after.length) return []
  const oldP = splitLines(before)
  const newP = splitLines(after)
  const ops = diffIndex(
    oldP.lines.length,
    newP.lines.length,
    (i, j) => oldP.lines[i] === newP.lines[j]
  )
  const spans: AgentEditSpan[] = []
  let hi = 0
  while (hi < ops.length) {
    const op = ops[hi]!
    if (op.type === 'eq') {
      hi += 1
      continue
    }
    let delCount = 0
    let insCount = 0
    let newStart = -1
    while (hi < ops.length && ops[hi]!.type !== 'eq') {
      const cur = ops[hi]!
      if (cur.type === 'del') delCount += cur.count
      else {
        if (newStart < 0) newStart = cur.newStart
        insCount += cur.count
      }
      hi += 1
    }
    if (insCount <= 0 || newStart < 0) continue
    const kind: AgentEditKind = delCount > 0 ? 'modified' : 'added'
    const start = newP.starts[newStart]!
    const end = lineEnd(after, newP.starts, newStart + insCount - 1)
    if (end > start) spans.push({ start, end, kind })
  }
  return mergeAgentSpans(spans, after.length)
}

/** Keep existing highlights on surviving Agent text; never cover user insertions. */
export function mapSpansThroughUserEdit(
  spans: AgentEditSpan[],
  before: string,
  after: string
): AgentEditSpan[] {
  if (!spans.length) return []
  if (before === after) {
    return mergeAgentSpans(spans, after.length)
  }
  const map = buildOldToNewMap(before, after)
  const next: AgentEditSpan[] = []
  for (const s of spans) {
    next.push(...collectMappedRuns(map, s.start, s.end, s.kind))
  }
  return mergeAgentSpans(next, after.length)
}

/** Previous highlights (mapped through this write) + new Agent hunks. New hunks win overlaps. */
export function mergeAgentWriteSpans(
  existing: AgentEditSpan[],
  before: string,
  after: string
): AgentEditSpan[] {
  const mapped = mapSpansThroughUserEdit(existing, before, after)
  const fresh = spansFromAgentWrite(before, after)
  if (!fresh.length) return mergeAgentSpans(mapped, after.length)
  const kept: AgentEditSpan[] = []
  for (const s of mapped) kept.push(...subtractSpan(s, fresh))
  return mergeAgentSpans([...kept, ...fresh], after.length)
}
