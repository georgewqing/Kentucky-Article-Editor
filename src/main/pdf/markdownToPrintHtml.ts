/** Main-process GFM subset → print HTML. Not TipTap; good enough for GDD/prose. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (!href || /^javascript:/i.test(href) || /^data:/i.test(href)) return null
  return href
}

function inlineMd(src: string): string {
  const slots: string[] = []
  const park = (html: string): string => {
    slots.push(html)
    return `\u0000${slots.length - 1}\u0000`
  }
  let s = src.replace(/`([^`]+)`/g, (_, code) => park(`<code>${escapeHtml(code)}</code>`))
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt) => park(`<em>${escapeHtml(alt || 'image')}</em>`))
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const h = safeHref(String(href))
    if (!h) return park(escapeHtml(text))
    return park(`<a href="${escapeHtml(h)}">${escapeHtml(text)}</a>`)
  })
  s = escapeHtml(s)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)] || '')
  return s
}

function isTableSep(line: string): boolean {
  const t = line.trim()
  if (!t.includes('|')) return false
  return /^\|?[\s:|-]+\|[\s:|-]*\|?$/.test(t) && /---/.test(t.replace(/\s/g, ''))
}

function splitRow(line: string): string[] {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function renderTable(header: string, rows: string[]): string {
  const heads = splitRow(header)
  const body = rows.map(splitRow)
  const th = heads.map((c) => `<th>${inlineMd(c)}</th>`).join('')
  const tr = body
    .map((cells) => {
      const padded = heads.map((_, i) => cells[i] || '')
      return `<tr>${padded.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`
    })
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function listKind(line: string): { kind: 'ul' | 'ol' | 'task'; ordered?: boolean; checked?: boolean; text: string } | null {
  const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
  if (ul) {
    const task = /^\[([ xX])\]\s+(.*)$/.exec(ul[1])
    if (task) {
      return { kind: 'task', checked: task[1] !== ' ', text: task[2] }
    }
    return { kind: 'ul', text: ul[1] }
  }
  const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
  if (ol) return { kind: 'ol', ordered: true, text: ol[1] }
  return null
}

function markdownToPrintInner(md: string): string {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let para: string[] = []

  const flushPara = (): void => {
    if (!para.length) return
    out.push(`<p>${inlineMd(para.join('\n'))}</p>`)
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {
      flushPara()
      const fenceLang = line.replace(/^```/, '').trim()
      i += 1
      const code: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      const lang = fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : ''
      out.push(`<pre><code${lang}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSep(lines[i + 1])
    ) {
      flushPara()
      const header = line
      i += 2
      const rows: string[] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(lines[i])
        i += 1
      }
      out.push(renderTable(header, rows))
      continue
    }

    if (/^\s*$/.test(line)) {
      flushPara()
      i += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      const level = Math.min(heading[1].length, 6)
      out.push(`<h${level}>${inlineMd(heading[2].trim())}</h${level}>`)
      i += 1
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara()
      out.push('<hr />')
      i += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      flushPara()
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      out.push(`<blockquote>${markdownToPrintInner(quote.join('\n'))}</blockquote>`)
      continue
    }

    const item = listKind(line)
    if (item) {
      flushPara()
      const kind = item.kind
      const items: Array<{ checked?: boolean; text: string }> = []
      while (i < lines.length) {
        const next = listKind(lines[i])
        if (!next || (kind === 'ol' ? next.kind !== 'ol' : next.kind === 'ol')) break
        if (kind === 'task' && next.kind !== 'task') break
        if (kind !== 'task' && next.kind === 'task') break
        items.push({ checked: next.checked, text: next.text })
        i += 1
      }
      if (kind === 'task') {
        out.push(
          `<ul>${items
            .map(
              (it) =>
                `<li>${it.checked ? '☑' : '☐'} ${inlineMd(it.text)}</li>`
            )
            .join('')}</ul>`
        )
      } else {
        const tag = kind === 'ol' ? 'ol' : 'ul'
        out.push(`<${tag}>${items.map((it) => `<li>${inlineMd(it.text)}</li>`).join('')}</${tag}>`)
      }
      continue
    }

    para.push(line)
    i += 1
  }
  flushPara()
  return out.join('\n')
}

/** Convert markdown to print HTML, wrapped in `<article class="print-article">`. */
export function markdownToPrintHtml(md: string): string {
  return `<article class="print-article">${markdownToPrintInner(md)}</article>`
}
