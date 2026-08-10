import { registerPlugin } from '@capacitor/core'

export interface KentuckySafTree {
  treeUri: string
  name: string
}

export interface KentuckySafEntry {
  name: string
  isDirectory: boolean
  mimeType?: string
}

export interface KentuckySafPlugin {
  openTree(): Promise<KentuckySafTree>
  restoreTree(): Promise<KentuckySafTree | null>
  listDir(options: { treeUri: string; path: string }): Promise<{ entries: KentuckySafEntry[] }>
  readFile(options: { treeUri: string; path: string }): Promise<{ content: string }>
  writeFile(options: { treeUri: string; path: string; content: string }): Promise<void>
  mkdir(options: { treeUri: string; path: string }): Promise<{ path: string; name: string }>
  delete(options: { treeUri: string; path: string }): Promise<void>
  exists(options: { treeUri: string; path: string }): Promise<{ exists: boolean }>
  copyFile(options: { treeUri: string; from: string; to: string }): Promise<void>
  readFileBase64(options: { treeUri: string; path: string }): Promise<{ data: string }>
  writeFileBase64(options: { treeUri: string; path: string; data: string }): Promise<void>
  pickImages(options: { treeUri: string; multiple: boolean }): Promise<{ paths: string[] }>
  pickFiles(options: { treeUri: string; multiple: boolean }): Promise<{ paths: string[] }>
  getDisplayPath(options: { treeUri: string }): Promise<{ name: string }>
}

export const KentuckySaf = registerPlugin<KentuckySafPlugin>('KentuckySaf')
