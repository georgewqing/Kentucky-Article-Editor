/** CJK-aware count: each Han/kana/hangul char = 1; Latin runs count as words. */
export function countArticleWords(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 0

  const cjk =
    normalized.match(
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g
    ) ?? []
  const cjkChars = cjk.reduce((n, s) => n + s.length, 0)

  const withoutCjk = normalized
    .replace(
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g,
      ' '
    )
    .trim()
  const latinWords = withoutCjk ? withoutCjk.split(/\s+/).filter(Boolean).length : 0

  return cjkChars + latinWords
}
