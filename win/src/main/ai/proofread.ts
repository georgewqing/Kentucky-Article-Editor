import type { ContinuityIssue } from './voiceFiles'

const TYPO_PAIRS: Array<[string, string]> = [
  ['的地得', ''], // placeholder skip
  ['在在', '在'],
  ['的的', '的'],
  ['了了', '了']
]

/** Local heuristic proofread — no NLP / cloud. */
export function proofreadText(text: string, path: string): ContinuityIssue[] {
  const issues: ContinuityIssue[] = []

  const pairs: Array<[string, string]> = [
    ['「', '」'],
    ['『', '』'],
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['（', '）'],
    ['(', ')']
  ]
  for (const [open, close] of pairs) {
    if (open === close) {
      const n = text.split(open).length - 1
      if (n % 2 !== 0) {
        issues.push({
          severity: 'warn',
          kind: 'quote_unbalanced',
          path,
          quote: open,
          suggestion: `Unbalanced quote/delimiter ${open} (count=${n}).`
        })
      }
    } else {
      const o = text.split(open).length - 1
      const c = text.split(close).length - 1
      if (o !== c) {
        issues.push({
          severity: 'warn',
          kind: 'quote_unbalanced',
          path,
          quote: `${open}…${close}`,
          suggestion: `Unbalanced ${open}/${close} (open=${o}, close=${c}).`
        })
      }
    }
  }

  const dupPunct = text.match(/[。！？,.!?]{2,}/g)
  if (dupPunct) {
    for (const m of dupPunct.slice(0, 5)) {
      issues.push({
        severity: 'info',
        kind: 'format_glitch',
        path,
        quote: m,
        suggestion: 'Repeated punctuation.'
      })
    }
  }

  if (/\|[^|\n]*$/.test(text) || /\|[^|\n]*\n[^|]*\|/.test(text) === false && text.includes('|---')) {
    // light MD table hint only when broken fence
  }
  if (/```[^`]*$/.test(text) && (text.split('```').length - 1) % 2 !== 0) {
    issues.push({
      severity: 'warn',
      kind: 'format_glitch',
      path,
      quote: '```',
      suggestion: 'Unclosed Markdown code fence.'
    })
  }

  for (const [bad, good] of TYPO_PAIRS) {
    if (!good) continue
    if (text.includes(bad)) {
      const i = text.indexOf(bad)
      issues.push({
        severity: 'info',
        kind: 'typo_suspect',
        path,
        quote: text.slice(Math.max(0, i - 6), i + bad.length + 6),
        suggestion: `Possible typo 「${bad}」→「${good}」.`
      })
    }
  }

  return issues.slice(0, 40)
}
