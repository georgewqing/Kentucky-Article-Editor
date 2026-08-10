export const sep = '/'

function slash(path: string): string {
  return path.replace(/\\/g, '/')
}

export function isAbsolute(path: string): boolean {
  return /^\/|^[A-Za-z]:\//.test(slash(path))
}

export function normalize(path: string): string {
  const raw = slash(path)
  const prefix = raw.match(/^[A-Za-z]:\//)?.[0] || (raw.startsWith('/') ? '/' : '')
  const parts: string[] = []
  for (const part of raw.slice(prefix.length).split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop()
      else if (!prefix) parts.push(part)
    } else parts.push(part)
  }
  return prefix + parts.join('/') || (prefix || '.')
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'))
}

export function dirname(path: string): string {
  const value = normalize(path)
  const index = value.lastIndexOf('/')
  if (index < 0) return '.'
  if (index === 0) return '/'
  return value.slice(0, index)
}

export function basename(path: string): string {
  const value = normalize(path)
  const index = value.lastIndexOf('/')
  return index < 0 ? value : value.slice(index + 1)
}

export function relative(from: string, to: string): string {
  const fromParts = normalize(from).replace(/^\/|^[A-Za-z]:\//, '').split('/').filter(Boolean)
  const toParts = normalize(to).replace(/^\/|^[A-Za-z]:\//, '').split('/').filter(Boolean)
  while (fromParts.length && toParts.length && fromParts[0].toLowerCase() === toParts[0].toLowerCase()) {
    fromParts.shift()
    toParts.shift()
  }
  return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
}
