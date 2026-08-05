import { useEffect, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

type MenuState = {
  x: number
  y: number
  entry: FileEntry | null
  /** directory to create into */
  targetDir: string
} | null

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) return <span className="tree-icon tree-icon-folder">▸</span>
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
  const [open, setOpen] = useState(depth < 1)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const openFile = useAppStore((s) => s.openFile)
  const active = activeTabId === entry.path

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
  onRequestCreate: (kind: 'file' | 'folder' | 'mindmap', parentDir: string) => void
}) {
  const { t } = useTranslation()
  const workspacePath = useAppStore((s) => s.workspacePath)
  const deleteEntry = useAppStore((s) => s.deleteEntry)
  const [menu, setMenu] = useState<MenuState>(null)

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

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

  return (
    <div
      className="file-tree-wrap"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('.tree-item')) return
        openMenu(e, null)
      }}
    >
      <ul className="file-tree">
        {entries.map((e) => (
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
          {menu.entry ? (
            <>
              <div className="ctx-sep" />
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
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
