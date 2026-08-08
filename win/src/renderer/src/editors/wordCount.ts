/**
 * 字数（不计空白）：每个非空白码点计 1。
 * 中文写作场景下 UI 显示「N 字」；英文/数字同样按字符计，避免整行连续字母只算 1「词」。
 */
export function countArticleWords(text: string): number {
  if (!text) return 0
  let n = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    n += 1
  }
  return n
}
