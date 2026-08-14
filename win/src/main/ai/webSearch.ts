/**
 * Web search providers for the writing agent.
 * DuckDuckGo first (when reachable); Bing HTML fallback (works on many CN networks).
 * Brave/Tavily reserved for API keys later.
 */

import { net } from 'electron'

export type WebSearchProvider = 'duckduckgo' | 'bing' | 'brave' | 'tavily'

export interface SearchHit {
  title: string
  url: string
  snippet: string
  /** Fetched page text excerpt when SERP snippet is thin */
  excerpt?: string
}

export interface SearchQueryResult {
  query: string
  results: SearchHit[]
  error?: string
  /** Which backend actually returned results */
  via?: string
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ensp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0*183;/g, '·')
    .replace(/&#176;/g, '°')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function errMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause
  if (cause?.code) return `${err.message} (${cause.code})`
  if (cause?.message) return `${err.message} (${cause.message})`
  return err.message
}

export function normalizeResults(hits: SearchHit[], max: number): SearchHit[] {
  const seen = new Set<string>()
  const out: SearchHit[] = []
  for (const h of hits) {
    const url = (h.url || '').trim()
    if (!url || !/^https?:\/\//i.test(url)) continue
    if (/bing\.com\/(aclick|ck\/)|microsoft\.com\/[^/]*consent/i.test(url)) continue
    const key = url.replace(/\/$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title: (h.title || '').trim().slice(0, 200),
      url,
      snippet: (h.snippet || '').trim().slice(0, 400),
      ...(h.excerpt ? { excerpt: h.excerpt.slice(0, 2500) } : {})
    })
    if (out.length >= max) break
  }
  return out
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
  }
  try {
    // Electron net.fetch uses Chromium stack (system proxy) — more reliable than undici in packaged apps.
    const res =
      typeof net?.fetch === 'function'
        ? await net.fetch(url, { signal: ac.signal, headers, redirect: 'follow' })
        : await fetch(url, { signal: ac.signal, headers, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    return text.slice(0, 500_000)
  } finally {
    clearTimeout(t)
  }
}

/** Parse DuckDuckGo HTML results page. */
function parseDdgHtml(html: string, maxResults: number): SearchHit[] {
  const hits: SearchHit[] = []
  const blockRe =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    let url = decodeHtml(m[1])
    // unwrap //duckduckgo.com/l/?uddg=
    const uddg = url.match(/[?&]uddg=([^&]+)/)
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1])
      } catch {
        /* keep */
      }
    }
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, '')).trim()
    const snippet = decodeHtml((m[3] || '').replace(/<[^>]+>/g, '')).trim()
    if (title || url) hits.push({ title, url, snippet })
  }
  if (hits.length) return normalizeResults(hits, maxResults)

  const uddgRe = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  while ((m = uddgRe.exec(html)) !== null) {
    let url = ''
    try {
      url = decodeURIComponent(m[1])
    } catch {
      url = m[1]
    }
    const title = decodeHtml(m[2].replace(/<[^>]+>/g, '')).trim()
    if (url) hits.push({ title, url, snippet: '' })
  }
  return normalizeResults(hits, maxResults)
}

/** Parse Bing SERP HTML (li.b_algo). */
function parseBingHtml(html: string, maxResults: number): SearchHit[] {
  const hits: SearchHit[] = []
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || []
  for (const block of blocks) {
    const links = Array.from(
      block.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
    )
    let best: SearchHit | null = null
    for (const m of links) {
      const url = decodeHtml(m[1])
      const title = decodeHtml(m[2].replace(/<[^>]+>/g, '')).trim()
      if (!title) continue
      // Skip cite-style “domain.comhttps://…” blobs
      if (/^[a-z0-9.-]+\.[a-z]{2,}https?:\/\//i.test(title)) continue
      if (/^https?:\/\//i.test(title)) continue
      if (!best || title.length > best.title.length) {
        best = { title, url, snippet: '' }
      }
    }
    if (!best) continue
    const cap =
      block.match(/<p class="b_lineclamp\d*"[^>]*>([\s\S]*?)<\/p>/i) ||
      block.match(/class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i) ||
      block.match(/<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i) ||
      block.match(/class="b_algoSlug"[^>]*>([\s\S]*?)<\/div>/i)
    if (cap) {
      best.snippet = decodeHtml(cap[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .replace(/^\d+\s*(分钟|小时|天|周)前\s*[·.]\s*/, '')
        .trim()
    }
    hits.push(best)
  }
  return normalizeResults(hits, maxResults)
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** weather.com.cn 7-day cards */
function extractWeatherComCn(html: string): string | null {
  const lis = html.match(/<li class="sky[^"]*"[\s\S]*?<\/li>/gi) || []
  if (!lis.length) return null
  const lines: string[] = []
  for (const li of lis.slice(0, 8)) {
    const day = li.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
    const wea = li.match(/class="wea"[^>]*>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
    const temRaw = li.match(/class="tem"[\s\S]*?<\/p>/i)?.[0] || ''
    const tem = decodeHtml(temRaw.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    const win = li.match(/class="win"[\s\S]*?<i>([\s\S]*?)<\/i>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
    const parts = [day, wea, tem, win].filter(Boolean)
    if (parts.length) lines.push(parts.join(' | '))
  }
  return lines.length ? lines.join('\n') : null
}

function isPrivateHttpUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true
    if (host.endsWith('.local') || host.endsWith('.internal')) return true
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
    if (!m) return false
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10 || a === 127) return true
    if (a === 0) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 169 && b === 254) return true
    return false
  } catch {
    return true
  }
}

export async function fetchPageExcerpt(
  url: string,
  maxChars = 1800
): Promise<{ url: string; text: string; error?: string }> {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) {
    return { url: u, text: '', error: 'Only http(s) URLs allowed' }
  }
  if (isPrivateHttpUrl(u)) {
    return { url: u, text: '', error: 'Private/local URLs are not allowed' }
  }
  try {
    const html = await fetchText(u, 10_000)
    const special = /weather\.com\.cn/i.test(u) ? extractWeatherComCn(html) : null
    let text = special || htmlToText(html)
    text = text.slice(0, maxChars)
    if (!text.trim()) return { url: u, text: '', error: 'No readable text extracted' }
    return { url: u, text }
  } catch (err) {
    return { url: u, text: '', error: errMessage(err) }
  }
}

/** Fetch top result pages so the agent gets facts, not only SERP blurbs. */
async function enrichResults(hits: SearchHit[], topN = 3): Promise<SearchHit[]> {
  const out = hits.map((h) => ({ ...h }))
  const n = Math.min(topN, out.length)
  for (let i = 0; i < n; i++) {
    const hit = out[i]
    // Skip fetch only when snippet already looks fact-dense (temps etc.)
    if (hit.snippet && /\d+\s*℃|\d+\s*°[CF]|\d{1,2}[/～~-]\d{1,2}\s*℃/i.test(hit.snippet)) {
      continue
    }
    // Always enrich empty/thin snippets
    const page = await fetchPageExcerpt(hit.url, 2000)
    if (page.text) hit.excerpt = page.text
    else if (page.error) hit.excerpt = `(fetch failed: ${page.error})`
    if (!hit.snippet && hit.excerpt && !hit.excerpt.startsWith('(fetch failed')) {
      hit.snippet = hit.excerpt.replace(/\s+/g, ' ').trim().slice(0, 400)
    }
  }
  return out
}

async function searchDuckDuckGoOnly(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<SearchQueryResult> {
  const q = query.trim()
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    const html = await fetchText(url, timeoutMs)
    const results = parseDdgHtml(html, maxResults)
    if (!results.length) {
      return {
        query: q,
        results: [],
        error: 'DuckDuckGo returned no parseable results'
      }
    }
    return { query: q, results, via: 'duckduckgo' }
  } catch (err) {
    return { query: q, results: [], error: errMessage(err) }
  }
}

export async function searchBing(
  query: string,
  maxResults: number,
  opts?: { enrich?: boolean }
): Promise<SearchQueryResult> {
  const q = query.trim()
  if (!q) return { query: q, results: [], error: 'Empty query' }
  const max = Math.min(10, Math.max(1, maxResults || 5))
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-CN`
    const html = await fetchText(url, 14_000)
    let results = parseBingHtml(html, max)
    if (!results.length) {
      return {
        query: q,
        results: [],
        error: 'Bing returned no parseable results (page layout may have changed).',
        via: 'bing'
      }
    }
    if (opts?.enrich !== false) results = await enrichResults(results, 2)
    return { query: q, results, via: 'bing' }
  } catch (err) {
    return { query: q, results: [], error: errMessage(err), via: 'bing' }
  }
}

export async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  opts?: { enrich?: boolean }
): Promise<SearchQueryResult> {
  const q = query.trim()
  if (!q) return { query: q, results: [], error: 'Empty query' }
  const max = Math.min(10, Math.max(1, maxResults || 5))

  // Short DDG attempt — often blocked/timeout in CN; don't hang the agent.
  const ddg = await searchDuckDuckGoOnly(q, max, 4_500)
  if (ddg.results.length) {
    return {
      ...ddg,
      results: opts?.enrich === false ? ddg.results : await enrichResults(ddg.results, 2)
    }
  }

  const bing = await searchBing(q, max, { enrich: opts?.enrich !== false })
  if (bing.results.length) {
    return {
      ...bing,
      via: 'bing (fallback after duckduckgo)',
      error: ddg.error ? `duckduckgo: ${ddg.error}; used bing` : undefined
    }
  }

  return {
    query: q,
    results: [],
    error: [
      ddg.error ? `duckduckgo: ${ddg.error}` : null,
      bing.error ? `bing: ${bing.error}` : null
    ]
      .filter(Boolean)
      .join(' | ')
  }
}

export async function runWebSearch(
  provider: WebSearchProvider,
  query: string,
  maxResults: number,
  opts?: { enrich?: boolean }
): Promise<SearchQueryResult> {
  if (provider === 'bing') return searchBing(query, maxResults, opts)
  if (provider === 'duckduckgo') return searchDuckDuckGo(query, maxResults, opts)
  return {
    query,
    results: [],
    error: `Search provider "${provider}" is not implemented yet. Switch to duckduckgo or bing in Settings.`
  }
}

/** Split a research question into multiple search queries. */
export function expandResearchQueries(
  question: string,
  explicit: string[] | undefined,
  maxQueries: number
): string[] {
  const max = Math.min(5, Math.max(1, maxQueries || 3))
  const fromUser = (explicit || []).map((q) => q.trim()).filter(Boolean)
  if (fromUser.length) return Array.from(new Set(fromUser)).slice(0, max)

  const q = question.trim()
  if (!q) return []
  const parts: string[] = [q]

  const splitters =
    /\s*(?:vs\.?|versus|对比|比较|与|和|以及|还有|或者|or|and|,|，|；|;|\/)\s+/i
  const chunks = q
    .split(splitters)
    .map((c) => c.trim())
    .filter((c) => c.length >= 2 && c.length < q.length)
  for (const c of chunks) {
    if (parts.length >= max) break
    if (!parts.includes(c)) parts.push(c)
  }

  if (parts.length < max) {
    const year = new Date().getFullYear()
    const variant = `${q} ${year}`
    if (!parts.includes(variant)) parts.push(variant)
  }
  if (parts.length < max && /什么|如何|怎么|why|how|what/i.test(q)) {
    const stripped = q
      .replace(/^(什么是|如何|怎么|why|how|what is|what are)\s+/i, '')
      .trim()
    if (stripped && stripped !== q && !parts.includes(stripped)) parts.push(stripped)
  }

  return parts.slice(0, max)
}

export async function runWebResearch(opts: {
  provider: WebSearchProvider
  question: string
  queries?: string[]
  maxQueries?: number
  maxResults?: number
}): Promise<{
  question: string
  queries: string[]
  byQuery: SearchQueryResult[]
  merged: SearchHit[]
  overlap: Array<{ url: string; title: string; hitBy: string[] }>
  conflicts: string[]
  suggestedFollowups: string[]
}> {
  const maxResults = Math.min(10, Math.max(1, opts.maxResults || 5))
  const queries = expandResearchQueries(opts.question, opts.queries, opts.maxQueries || 3)
  const byQuery: SearchQueryResult[] = []
  for (const query of queries) {
    byQuery.push(await runWebSearch(opts.provider, query, maxResults, { enrich: true }))
    await new Promise((r) => setTimeout(r, 250))
  }

  const urlToHit = new Map<string, SearchHit & { hitBy: string[] }>()
  for (const qr of byQuery) {
    for (const hit of qr.results) {
      const key = hit.url.replace(/\/$/, '').toLowerCase()
      const cur = urlToHit.get(key)
      if (cur) {
        if (!cur.hitBy.includes(qr.query)) cur.hitBy.push(qr.query)
      } else {
        urlToHit.set(key, { ...hit, hitBy: [qr.query] })
      }
    }
  }

  let merged = Array.from(urlToHit.values()).map(({ hitBy: _h, ...rest }) => rest)
  merged = await enrichResults(merged.slice(0, maxResults * 2), 3)
  const overlap = Array.from(urlToHit.values())
    .filter((h) => h.hitBy.length >= 2)
    .map((h) => ({ url: h.url, title: h.title, hitBy: h.hitBy }))

  const conflicts: string[] = []
  const byDomain = new Map<string, string[]>()
  for (const h of merged) {
    const d = domainOf(h.url)
    if (!d) continue
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push(h.title)
  }
  Array.from(byDomain.entries()).forEach(([domain, titles]) => {
    const uniq = Array.from(new Set(titles.map((t: string) => t.toLowerCase())))
    if (uniq.length >= 2 && titles.length >= 2) {
      conflicts.push(
        `Domain ${domain} returned divergent titles across queries — verify before citing.`
      )
    }
  })

  const suggestedFollowups: string[] = []
  if (overlap.length === 0 && merged.length) {
    suggestedFollowups.push(
      'Try more specific queries or call web_search on the strongest URL titles.'
    )
  }
  if (byQuery.some((q) => q.error && !q.results.length)) {
    suggestedFollowups.push('Some queries failed; retry web_search for those alone, or switch provider to bing.')
  }
  for (const h of overlap.slice(0, 2)) {
    suggestedFollowups.push(`Cross-check: ${h.title}`)
  }

  return {
    question: opts.question,
    queries,
    byQuery,
    merged: merged.slice(0, maxResults * 2),
    overlap,
    conflicts: conflicts.slice(0, 5),
    suggestedFollowups: suggestedFollowups.slice(0, 5)
  }
}
