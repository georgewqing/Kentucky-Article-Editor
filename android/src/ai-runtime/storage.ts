import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { dirname, join, normalize } from './pathUtil'

const ROOT = 'kentucky-data'
const DB_NAME = 'kentucky-android-data'
const STORE = 'blobs'
const cache = new Map<string, string>()
const dirs = new Set<string>([ROOT])
let ready: Promise<void> | null = null

function key(path: string): string {
  const value = normalize(path).replace(/^\/+/, '')
  return value === ROOT || value.startsWith(`${ROOT}/`) ? value : join(ROOT, value)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbEntries(): Promise<Array<[string, string]>> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAllKeys()
      req.onsuccess = () => {
        const keys = req.result as string[]
        Promise.all(keys.map(async (k) => [k, await idbRead(k)] as [string, string]))
          .then(resolve)
          .catch(reject)
      }
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbRead(path: string): Promise<string> {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(path)
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '')
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbWrite(path: string, content: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(content, path)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function idbDelete(path: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(path)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function hydrateNative(path = ROOT): Promise<void> {
  let files: Awaited<ReturnType<typeof Filesystem.readdir>>['files'] = []
  try {
    files = (await Filesystem.readdir({ path, directory: Directory.Data })).files
  } catch {
    return
  }
  dirs.add(path)
  for (const item of files) {
    const child = join(path, item.name)
    if (item.type === 'directory') await hydrateNative(child)
    else {
      const result = await Filesystem.readFile({ path: child, directory: Directory.Data, encoding: Encoding.UTF8 })
      cache.set(child, typeof result.data === 'string' ? result.data : '')
    }
  }
}

export function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.mkdir({ path: ROOT, directory: Directory.Data, recursive: true }).catch(() => undefined)
        await hydrateNative()
      } else {
        for (const [path, content] of await idbEntries()) cache.set(path, content)
      }
      for (const path of cache.keys()) {
        let dir = dirname(path)
        while (dir && dir !== '.') {
          dirs.add(dir)
          if (dir === ROOT) break
          dir = dirname(dir)
        }
      }
    })()
  }
  return ready
}

export function cacheRead(path: string): string | null { return cache.get(key(path)) ?? null }
export function cacheWrite(path: string, content: string): void { cache.set(key(path), content); cacheMkdir(dirname(path)) }
export function cacheDelete(path: string): void { cache.delete(key(path)) }
export function cacheExists(path: string): boolean { return cache.has(key(path)) || dirs.has(key(path)) }
export function cacheList(path: string): string[] {
  const prefix = key(path).replace(/\/$/, '') + '/'
  const names = new Set<string>()
  for (const value of [...cache.keys(), ...dirs]) {
    if (value.startsWith(prefix)) {
      const name = value.slice(prefix.length).split('/')[0]
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}
export function cacheMkdir(path: string): void {
  let dir = key(path)
  while (dir && dir !== '.') {
    dirs.add(dir)
    if (dir === ROOT) break
    dir = dirname(dir)
  }
}

export async function readText(path: string): Promise<string | null> {
  await ensureReady()
  return cacheRead(path)
}
export async function writeText(path: string, content: string): Promise<void> {
  await ensureReady()
  const value = key(path)
  cacheWrite(value, content)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: value, data: content, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
  } else await idbWrite(value, content)
}
export async function deletePath(path: string): Promise<void> {
  await ensureReady()
  const value = key(path)
  cacheDelete(value)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.deleteFile({ path: value, directory: Directory.Data }).catch(() => undefined)
  } else await idbDelete(value)
}
export async function exists(path: string): Promise<boolean> { await ensureReady(); return cacheExists(path) }
export async function listDir(path: string): Promise<string[]> { await ensureReady(); return cacheList(path) }
export async function mkdir(path: string): Promise<void> {
  await ensureReady()
  const value = key(path)
  cacheMkdir(value)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.mkdir({ path: value, directory: Directory.Data, recursive: true }).catch(() => undefined)
  }
}
