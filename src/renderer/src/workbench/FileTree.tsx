import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { isDialogueMetaPath, isDialoguePath, nestDialogueMetaInTree } from '@/editors/dialogueCsv'

type MenuState = {
  x: number
  y: number
  entry: FileEntry | null
  /** directory to create into */
  targetDir: string
} | null

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) return <span className="tree-icon tree-icon-folder">▸</span>
  if (isDialoguePath(entry.path)) return <span className="tree-icon tree-icon-dialogue">D</span>
  if (isDialogueMetaPath(entry.path)) return <span className="tree-icon tree-icon-meta">m</span>
  const ext = getPlatform().extname(entry.path)
  if (ext === '.kmind') return <span className="tree-icon tree-icon-mind">M</span>
  if (ext === '.md') return <span className="tree-icon tree-icon-md">MD</span>
  return <span className="tree-icon tree-icon-file">T</span>
}

function TreeNode({
  entry,
  depth,
  onContext
}: {
  entry: FileEntry
  depth: number
  onContext: (e: MouseEvent, entry: FileEntry) => void
}) {
  const [open, setOpen] = useState(entry.isDirectory ? depth < 1 : false)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const openFile = useAppStore((s) => s.openFile)
  const active = activeTabId === entry.path
  const nestedKids = !entry.isDirectory ? entry.children : undefined
  const hasNested = Boolean(nestedKids && nestedKids.length > 0)

  if (entry.isDirectory) {
    return (
      <li>
        <div
          className="tree-item"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => setOpen((v) => !v)}
          onContextMenu={(e) => onContext(e, entry)}
        >
          <span className="tree-chevron">{open ? '▾' : '▸'}</span>
          <FileIcon entry={entry} />
          <span className="tree-name">{entry.name}</span>
        </div>
        {open && entry.children && (
          <ul>
            {entry.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} onContext={onContext} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  if (hasNested) {
    return (
      <li>
        <div
          className={`tree-item ${active ? 'active' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onContextMenu={(e) => onContext(e, entry)}
        >
          <span
            className="tree-chevron"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          >
            {open ? '▾' : '▸'}
          </span>
          <button
            type="button"
            className="tree-file-hit"
            onClick={() => void openFile(entry.path)}
          >
            <FileIcon entry={entry} />
            <span className="tree-name">{entry.name}</span>
          </button>
        </div>
        {open && nestedKids ? (
          <ul>
            {nestedKids.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} onContext={onContext} />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <li>
      <div
        className={`tree-item ${active ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 + 16 }}
        onClick={() => void openFile(entry.path)}
        onContextMenu={(e) => onContext(e, entry)}
      >
        <span className="tree-chevron" />
        <FileIcon entry={entry} />
        <span className="tree-name">{entry.name}</span>
      </div>
    </li>
  )
}

export function FileTree({
  entries,
  onRequestCreate
}: {
  entries: FileEntry[]
  onRequestCreate: (kind: 'file' | 'folder' | 'mindmap' | 'dialogue', parentDir: string) => void
}) {
  const { t } = useTranslation()
  const workspacePath = useAppStore((s) => s.workspacePath)
  const deleteEntry = useAppStore((s) => s.deleteEntry)
  const renameEntry = useAppStore((s) => s.renameEntry)
  const [menu, setMenu] = useState<MenuState>(null)
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const displayEntries = useMemo(() => nestDialogueMetaInTree(entries), [entries])

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  useEffect(() => {
    if (!renameTarget) return
    requestAnimationFrame(() => {
      renameRef.current?.focus()
      renameRef.current?.select()
    })
  }, [renameTarget])

  const openMenu = (e: MouseEvent, entry: FileEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (!workspacePath) return
    const targetDir = entry
      ? entry.isDirectory
        ? entry.path
        : getPlatform().dirname(entry.path)
      : workspacePath
    setMenu({ x: e.clientX, y: e.clientY, entry, targetDir })
  }

  const submitRename = async (e?: FormEvent) => {
    e?.preventDefault()
    const target = renameTarget
    const next = renameValue.trim()
    setRenameTarget(null)
    setRenameValue('')
    if (!target || !next || next === target.name) return
    await renameEntry(target.path, next)
  }

  return (
    <div
      className="file-tree-wrap"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.tree-item')) return
        openMenu(e, null)
      }}
    >
      <ul className="file-tree">
        {displayEntries.map((e) => (
          <TreeNode key={e.path} entry={e} depth={0} onContext={openMenu} />
        ))}
      </ul>

      {menu ? (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              onRequestCreate('file', menu.targetDir)
              setMenu(null)
            }}
          >
            {t('explorer.newFile')}
          </button>
          <button
            type="button"
            onClick={() => {
              onRequestCreate('folder', menu.targetDir)
              setMenu(null)
            }}
          >
            {t('explorer.newFolder')}
          </button>
          <button
            type="button"
            onClick={() => {
              onRequestCreate('mindmap', menu.targetDir)
              setMenu(null)
            }}
          >
            {t('explorer.newMindMap')}
          </button>
          <button
            type="button"
            onClick={() => {
              onRequestCreate('dialogue', menu.targetDir)
              setMenu(null)
            }}
          >
            {t('explorer.newDialogue')}
          </button>
          {menu.entry ? (
            <>
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  const entry = menu.entry!
                  setMenu(null)
                  setRenameTarget(entry)
                  setRenameValue(entry.name)
                }}
              >
                {t('explorer.rename')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const path = menu.entry!.path
                  setMenu(null)
                  void getPlatform().showItemInFolder(path)
                }}
              >
                {t('explorer.revealInFolder')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const path = menu.entry!.path
                  setMenu(null)
                  void deleteEntry(path)
                }}
              >
                {t('explorer.delete')}
              </button>
            </>
          ) : workspacePath ? (
            <>
              <div className="ctx-sep" />
              <button
                type="button"
                onClick={() => {
                  setMenu(null)
                  void getPlatform().showItemInFolder(workspacePath)
                }}
              >
                {t('explorer.revealInFolder')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {renameTarget ? (
        <div className="app-dialog-backdrop" role="presentation">
          <form className="app-dialog" onSubmit={(e) => void submitRename(e)}>
            <h2 className="app-dialog-title">{t('explorer.rename')}</h2>
            <div className="dialogue-char-form">
              <label>
                {t('explorer.promptRename')}
                <input
                  ref={renameRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setRenameTarget(null)
                      setRenameValue('')
                    }
                  }}
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-btn ghost"
                onClick={() => {
                  setRenameTarget(null)
                  setRenameValue('')
                }}
              >
                {t('explorer.cancel')}
              </button>
              <div className="app-dialog-actions-end">
                <button type="submit" className="app-dialog-btn primary" disabled={!renameValue.trim()}>
                  {t('explorer.rename')}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
