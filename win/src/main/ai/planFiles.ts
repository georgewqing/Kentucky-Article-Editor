import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PlanStep } from './chatSessions'

export const PLANS_DIR = 'plans'

export interface PlanTodoInput {
  id: string
  content: string
}

export function slugifyPlanName(name: string): string {
  const raw = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  const slug = raw.toLowerCase() || 'plan'
  return slug
}

export function planRelPath(slug: string): string {
  return `${PLANS_DIR}/${slug}.plan.md`.replace(/\\/g, '/')
}

export function planAbsPath(workspaceRoot: string, slug: string): string {
  return join(workspaceRoot, PLANS_DIR, `${slug}.plan.md`)
}

export function buildPlanMarkdown(opts: {
  title: string
  overview: string
  planBody: string
  todos: PlanTodoInput[]
}): string {
  const title = opts.title.trim() || 'Plan'
  const overview = opts.overview.trim() || 'Implementation plan.'
  const todos =
    opts.todos.length > 0
      ? opts.todos
      : [{ id: '1', content: 'Execute the plan' }]
  const todoLines = todos.map((t, i) => {
    const id = (t.id || `step-${i + 1}`).trim() || `step-${i + 1}`
    const content = (t.content || '').trim() || id
    return `- [ ] id: ${id} — ${content}`
  })
  const bodyRaw = opts.planBody.trim()
  // Discourage duplicate checkbox truth in ## Plan — strip bare task-list lines (keep id: lines).
  let body = ''
  if (bodyRaw) {
    body = bodyRaw
      .split(/\r?\n/)
      .filter((line) => {
        const m = line.match(/^\s*-\s+\[[ xX]\]\s+(.*)$/)
        if (!m) return true
        return /^id:\s+/i.test(m[1])
      })
      .join('\n')
      .trim()
  }
  if (!body) body = todos.map((t, i) => `${i + 1}. ${t.content}`).join('\n')
  return [
    `# ${title}`,
    '',
    `**Overview:** ${overview}`,
    '',
    '## Todos',
    ...todoLines,
    '',
    '## Plan',
    body,
    ''
  ].join('\n')
}

/** Map status → checkbox. in_progress stays unchecked (visible via session mirror / prose). */
function checkboxForStatus(status: PlanStep['status']): string {
  return status === 'done' ? '[x]' : '[ ]'
}

/**
 * Update checkbox lines that belong to plan steps.
 * - Prefer `id: <stepId> — …` lines (## Todos).
 * - Also flip any other `- [ ]` / `- [x]` line that embeds `id: <stepId>` or equals step text
 *   (## Plan body duplicates), without remapping unrelated checkboxes by ordinal.
 */
export function patchPlanTodoCheckboxes(markdown: string, steps: PlanStep[]): string {
  if (!steps.length) return markdown
  const byId = new Map(steps.map((s) => [s.id, s]))
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*-\s*)\[([ xX])\](\s+)(.*)$/)
      if (!m) return line
      const rest = m[4]
      const idHead = rest.match(/^id:\s*(.+?)\s+[—\-–]\s+(.*)$/)
      let step: PlanStep | undefined
      if (idHead) {
        step = byId.get(idHead[1].trim())
      }
      if (!step) {
        for (const s of steps) {
          if (new RegExp(`\\bid:\\s*${escapeRegExp(s.id)}\\b`).test(rest)) {
            step = s
            break
          }
        }
      }
      if (!step) {
        const trimmed = rest.trim()
        step = steps.find((s) => trimmed === s.text || trimmed.endsWith(s.text))
      }
      if (!step) return line
      const box = checkboxForStatus(step.status)
      if (idHead) {
        return `${m[1]}${box}${m[3]}id: ${step.id} — ${step.text}`
      }
      return `${m[1]}${box}${m[3]}${rest}`
    })
    .join('\n')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function writePlanFile(workspaceRoot: string, slug: string, markdown: string): {
  absPath: string
  relPath: string
} {
  const dir = join(workspaceRoot, PLANS_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const absPath = planAbsPath(workspaceRoot, slug)
  writeFileSync(absPath, markdown, 'utf-8')
  return { absPath, relPath: planRelPath(slug) }
}

export function readPlanFile(workspaceRoot: string, relPath: string): string | null {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const abs = join(workspaceRoot, ...parts)
  if (!existsSync(abs)) return null
  try {
    return readFileSync(abs, 'utf-8')
  } catch {
    return null
  }
}

export function stepsFromTodos(todos: PlanTodoInput[]): PlanStep[] {
  return todos.map((t, idx) => ({
    id: (t.id || `p${idx}`).trim() || `p${idx}`,
    text: (t.content || '').trim() || t.id || `Step ${idx + 1}`,
    status: idx === 0 ? 'in_progress' : 'pending'
  }))
}

export function todosFromLegacySteps(steps: string[]): PlanTodoInput[] {
  return steps.map((text, idx) => ({
    id: `p${idx + 1}`,
    content: String(text || '').trim() || `Step ${idx + 1}`
  }))
}
