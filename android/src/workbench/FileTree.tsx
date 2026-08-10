import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import {
  isCharactersPath,
  isDialogueChoicesPath,
  isDialogueLayoutPath,
  isDialogueMetaPath,
  isDialoguePath,
  nestDialogueSidecarsInTree,
  stripSafTextSuffix
} from '@/editors/dialogueCsv'
import {
  isModifiedPrimaryClick,
  notePointerType,
  shouldSuppressTouchContextMenu
} from '@/hooks/useSecondaryClick'
import { applyStemKeepExt, displayEntryName, splitKnownExt } from './explorerNames'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'

const DND_MIME = 'application/x-kentucky-path'

type MenuState = {
  x: number
  y: number
  entry: FileEntry | null
  /** directory to create into */
  targetDir: string
} | null

type TreeDnD = {
  dragPath: string | null
  dropDir: string | null
  setDropDir: (dir: string | null) => void
  beginDrag: (path: string, e: DragEvent) => void
  endDrag: () => void
  canDropOn: (destDir: string) => boolean
  dropOn: (destDir: string) => void
}

const TreeDnDCtx = createContext<TreeDnD | null>(null)

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) return null
  if (isDialoguePath(entry.path)) return <span className="tree-icon tree-icon-dialogue">D</span>
  if (isCharactersPath(entry.path)) return <span className="tree-icon tree-icon-chars">C</span>
  if (isDialogueMetaPath(entry.path)) return <span className="tree-icon tree-icon-meta">m</span>
  if (isDialogueChoicesPath(entry.path)) return <span className="tree-icon tree-icon-meta">ch</span>
  if (isDialogueLayoutPath(entry.path)) return <span className="tree-icon tree-icon-meta">ly</span>
  const logical = stripSafTextSuffix(entry.path)
  const ext = getPlatform().extname(logical)
  if (ext === '.kmind') return <span className="tree-icon tree-icon-mind">M</span>
  if (ext === '.md') return <span className="tree-icon tree-icon-md">MD</span>
  return <span className="tree-icon tree-icon-file">T</span>
}

function collectPaths(entries: FileEntry[], into: Set<string>): void {
  for (const entry of entries) {
    into.add(entry.path.replace(/\\/g, '/').toLowerCase())
    if (entry.children?.length) collectPaths(entry.children, into)
  }
}

/** Show dirty/new open tabs that are not on disk yet (e.g. AI-created characters.csv). */
function mergeGhostTabs(
  entries: FileEntry[],
  tabs: Array<{ path: string; dirty: boolean; isNew?: boolean }>,
  workspacePath: string | null
): FileEntry[] {
  if (!workspacePath) return entries
  const existing = new Set<string>()
  collectPaths(entries, existing)
  const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const rootKey = root.toLowerCase()
  const ghosts: FileEntry[] = []
  for (const tab of tabs) {
    if (!tab.dirty && !tab.isNew) continue
    const abs = tab.path.replace(/\\/g, '/')
    const key = abs.toLowerCase()
    if (existing.has(key)) continue
    if (key !== rootKey && !key.startsWith(rootKey + '/')) continue
    const rel = abs.slice(root.length).replace(/^\/+/, '')
    if (!rel || rel.includes('/')) continue
    ghosts.push({ name: getPlatform().basename(tab.path), path: tab.path, isDirectory: false })
    existing.add(key)
  }
  if (!ghosts.length) return entries
  const merged = [...ghosts, ...entries]
  merged.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return merged
}

/** Same width slot as file type icons so names line up with folders. */
function FolderGlyph({ open }: { open: boolean }) {
  const Icon = open ? FolderOpen : Folder
  return (
    <span className="tree-icon tree-icon-folder" aria-hidden>
      <Icon size={14} strokeWidth={1.75} />
    </span>
  )
}

/** Cursor/VS Code style twistie: one chevron, rotates open ↔ closed. */
function TreeTwistie({
  open,
  visible = true,
  onClick
}: {
  open: boolean
  visible?: boolean
  onClick?: (e: MouseEvent) => void
}) {
  if (!visible) {
    return <span className="tree-twistie tree-twistie-spacer" aria-hidden />
  }
  return (
    <span
      className={`tree-twistie ${open ? 'is-open' : ''}`}
      onClick={onClick}
      aria-hidden
    >
      <ChevronRight size={14} strokeWidth={2.25} />
    </span>
  )
}

function useFileMark(path: string): 'new' | 'dirty' | null {
  return useAppStore((s) => {
    const tab = s.tabs.find(
      (t) =>
        t.path.replace(/[/\\]/g, '\\').toLowerCase() === path.replace(/[/\\]/g, '\\').toLowerCase()
    )
    if (!tab) return null
    if (tab.isNew) return 'new'
    if (tab.dirty) return 'dirty'
    return null
  })
}

function TreeName({ path, label }: { path: string; label: string }) {
  const mark = useFileMark(path)
  return (
    <span
      className={`tree-name ${mark === 'new' ? 'tree-name-new' : mark === 'dirty' ? 'tree-name-dirty' : ''}`}
    >
      {mark ? <span className={mark === 'new' ? 'tab-new' : 'tab-dirty'}>● </span> : null}
      {label}
    </span>
  )
}

function useFolderDrop(destDir: string, onExpand?: () => void) {
  const dnd = useContext(TreeDnDCtx)
  const over = Boolean(dnd && dnd.dropDir && pathsEqual(dnd.dropDir, destDir))

  const onDragOver = (e: DragEvent) => {
    if (!dnd?.canDropOn(destDir)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    dnd.setDropDir(destDir)
  }

  const onDragLeave = (e: DragEvent) => {
    e.stopPropagation()
    if (!dnd) return
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
    if (dnd.dropDir && pathsEqual(dnd.dropDir, destDir)) dnd.setDropDir(null)
  }

  const onDrop = (e: DragEvent) => {
    if (!dnd?.canDropOn(destDir)) return
    e.preventDefault()
    e.stopPropagation()
    onExpand?.()
    dnd.dropOn(destDir)
  }

  return { over, onDragOver, onDragLeave, onDrop }
}

type TreeContextEvent = {
  preventDefault(): void
  stopPropagation(): void
  clientX: number
  clientY: number
  ctrlKey: boolean
  metaKey: boolean
}

function treeSecondaryProps(
  onContext: (e: TreeContextEvent, entry: FileEntry) => void,
  entry: FileEntry
): {
  onPointerDown: (e: ReactPointerEvent) => void
  onContextMenu: (e: MouseEvent) => void
} {
  return {
    onPointerDown: (e) => {
      notePointerType(e)
      if (!isModifiedPrimaryClick(e)) return
      onContext(e, entry)
    },
    onContextMenu: (e) => {
      if (shouldSuppressTouchContextMenu(e)) {
        e.preventDefault()
        return
      }
      onContext(e, entry)
    }
  }
}

function TreeNode({
  entry,
  depth,
  onContext
}: {
  entry: FileEntry
  depth: number
  onContext: (e: TreeContextEvent, entry: FileEntry) => void
}) {
  const [open, setOpen] = useState(entry.isDirectory ? depth <= 1 : false)
  const { t } = useTranslation()
  const activeTabId = useAppStore((s) => s.activeTabId)
  const openFile = useAppStore((s) => s.openFile)
  const dnd = useContext(TreeDnDCtx)
  const active = activeTabId === entry.path
  const nestedKids = !entry.isDirectory ? entry.children : undefined
  const hasNested = Boolean(nestedKids && nestedKids.length > 0)
  const label = isCharactersPath(entry.path)
    ? t('explorer.charactersTable')
    : displayEntryName(entry.name, entry.isDirectory)
  const folderDrop = useFolderDrop(entry.path, () => setOpen(true))
  const dragging = Boolean(dnd?.dragPath && pathsEqual(dnd.dragPath, entry.path))
  const suppressClickRef = useRef(false)
  const secondary = treeSecondaryProps(onContext, entry)

  const dragProps = {
    draggable: true as const,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation()
      suppressClickRef.current = true
      dnd?.beginDrag(entry.path, e)
    },
    onDragEnd: () => {
      dnd?.endDrag()
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
  }

  if (entry.isDirectory) {
    return (
      <li>
        <div
          className={`tree-item ${folderDrop.over ? 'drop-target' : ''} ${dragging ? 'is-dragging' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => {
            if (suppressClickRef.current) return
            setOpen((v) => !v)
          }}
          {...secondary}
          onDragOver={folderDrop.onDragOver}
          onDragLeave={folderDrop.onDragLeave}
          onDrop={folderDrop.onDrop}
          title={entry.name}
          {...dragProps}
        >
          <TreeTwistie open={open} />
          <FolderGlyph open={open} />
          <span className="tree-name">{label}</span>
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
          className={`tree-item ${active ? 'active' : ''} ${dragging ? 'is-dragging' : ''}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          {...secondary}
          title={entry.name}
          {...dragProps}
        >
          <TreeTwistie
            open={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          />
          <button
            type="button"
            className="tree-file-hit"
            onClick={() => {
              if (suppressClickRef.current) return
              void openFile(entry.path)
            }}
            title={entry.name}
          >
            <FileIcon entry={entry} />
            <TreeName path={entry.path} label={label} />
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
        className={`tree-item ${active ? 'active' : ''} ${dragging ? 'is-dragging' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (suppressClickRef.current) return
          void openFile(entry.path)
        }}
        {...secondary}
        title={entry.name}
        {...dragProps}
      >
        <TreeTwistie open={false} visible={false} />
        <FileIcon entry={entry} />
        <TreeName path={entry.path} label={label} />
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
  const moveEntry = useAppStore((s) => s.moveEntry)
  const [menu, setMenu] = useState<MenuState>(null)
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null)
  const [renameStem, setRenameStem] = useState('')
  const [renameExt, setRenameExt] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const tabs = useAppStore((s) => s.tabs)
  const displayEntries = useMemo(() => {
    const nested = nestDialogueSidecarsInTree(entries)
    return mergeGhostTabs(nested, tabs, workspacePath)
  }, [entries, tabs, workspacePath])
  const [rootOpen, setRootOpen] = useState(true)
  const rootName = workspacePath ? getPlatform().basename(workspacePath) : ''
  const [dragPath, setDragPath] = useState<string | null>(null)
  const [dropDir, setDropDir] = useState<string | null>(null)

  useEffect(() => {
    setRootOpen(true)
  }, [workspacePath])

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
    const id = window.setTimeout(() => {
      renameRef.current?.focus()
      renameRef.current?.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [renameTarget])

  const canDropOn = useCallback(
    (destDir: string) => {
      if (!dragPath || !workspacePath) return false
      const src = dragPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      const dest = destDir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      const parent = getPlatform().dirname(dragPath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (dest === parent) return false
      if (dest === src || dest.startsWith(src + '/')) return false
      return true
    },
    [dragPath, workspacePath]
  )

  const dndValue = useMemo<TreeDnD>(
    () => ({
      dragPath,
      dropDir,
      setDropDir,
      beginDrag: (path, e) => {
        setDragPath(path)
        setDropDir(null)
        e.dataTransfer.setData(DND_MIME, path)
        e.dataTransfer.setData('text/plain', path)
        e.dataTransfer.effectAllowed = 'move'
      },
      endDrag: () => {
        setDragPath(null)
        setDropDir(null)
      },
      canDropOn,
      dropOn: (destDir) => {
        const src = dragPath
        setDragPath(null)
        setDropDir(null)
        if (!src) return
        void moveEntry(src, destDir)
      }
    }),
    [dragPath, dropDir, canDropOn, moveEntry]
  )

  const rootOver = Boolean(
    workspacePath && dropDir && pathsEqual(dropDir, workspacePath)
  )

  const onRootDragOver = (e: DragEvent) => {
    if (!workspacePath || !canDropOn(workspacePath)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropDir(workspacePath)
  }

  const onRootDragLeave = (e: DragEvent) => {
    e.stopPropagation()
    const related = e.relatedTarget as Node | null
    if (related && (e.currentTarget as HTMLElement).contains(related)) return
    if (workspacePath && dropDir && pathsEqual(dropDir, workspacePath)) setDropDir(null)
  }

  const onRootDrop = (e: DragEvent) => {
    if (!workspacePath || !canDropOn(workspacePath)) return
    e.preventDefault()
    e.stopPropagation()
    setRootOpen(true)
    dndValue.dropOn(workspacePath)
  }

  const openMenu = (e: TreeContextEvent, entry: FileEntry | null) => {
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

  const openRootMenu = (e: TreeContextEvent) => openMenu(e, null)

  const rootSecondary = {
    onPointerDown: (e: ReactPointerEvent) => {
      notePointerType(e)
      if (!isModifiedPrimaryClick(e)) return
      openRootMenu(e)
    },
    onContextMenu: (e: MouseEvent) => {
      if (shouldSuppressTouchContextMenu(e)) {
        e.preventDefault()
        return
      }
      openRootMenu(e)
    }
  }

  const beginRename = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setRenameExt('')
      setRenameStem(entry.name)
    } else {
      const { stem, ext } = splitKnownExt(entry.name)
      setRenameExt(ext)
      setRenameStem(stem || entry.name)
    }
    setRenameTarget(entry)
  }

  const submitRename = async (e?: FormEvent) => {
    e?.preventDefault()
    const target = renameTarget
    const next = target
      ? target.isDirectory
        ? applyStemKeepExt(renameStem, '')
        : applyStemKeepExt(renameStem, renameExt)
      : ''
    setRenameTarget(null)
    setRenameStem('')
    setRenameExt('')
    if (!target || !next || next === target.name) return
    await renameEntry(target.path, next)
  }

  const cancelRename = () => {
    setRenameTarget(null)
    setRenameStem('')
    setRenameExt('')
  }

  return (
    <TreeDnDCtx.Provider value={dndValue}>
      <div
        className="file-tree-wrap"
        onPointerDown={(e) => {
          notePointerType(e)
          if (!isModifiedPrimaryClick(e)) return
          if ((e.target as HTMLElement).closest('.tree-item')) return
          openRootMenu(e)
        }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('.tree-item')) return
          if (shouldSuppressTouchContextMenu(e)) {
            e.preventDefault()
            return
          }
          openRootMenu(e)
        }}
      >
        <ul className="file-tree">
          {workspacePath ? (
            <li>
              <div
                className={`tree-item tree-item-workspace ${rootOver ? 'drop-target' : ''}`}
                style={{ paddingLeft: 8 }}
                onClick={() => setRootOpen((v) => !v)}
                {...rootSecondary}
                onDragOver={onRootDragOver}
                onDragLeave={onRootDragLeave}
                onDrop={onRootDrop}
                title={workspacePath}
              >
                <TreeTwistie open={rootOpen} />
                <FolderGlyph open={rootOpen} />
                <span className="tree-name">{rootName}</span>
              </div>
              {rootOpen ? (
                <ul>
                  {displayEntries.map((e) => (
                    <TreeNode key={e.path} entry={e} depth={1} onContext={openMenu} />
                  ))}
                </ul>
              ) : null}
            </li>
          ) : (
            displayEntries.map((e) => (
              <TreeNode key={e.path} entry={e} depth={0} onContext={openMenu} />
            ))
          )}
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
                    beginRename(entry)
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
                  <div className="sidebar-create-name-row">
                    <input
                      ref={renameRef}
                      type="text"
                      value={renameStem}
                      onChange={(e) => setRenameStem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelRename()
                        }
                        e.stopPropagation()
                      }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {renameExt ? <span className="sidebar-create-ext">{renameExt}</span> : null}
                  </div>
                </label>
              </div>
              <div className="app-dialog-actions">
                <button type="button" className="app-dialog-btn ghost" onClick={cancelRename}>
                  {t('explorer.cancel')}
                </button>
                <div className="app-dialog-actions-end">
                  <button type="submit" className="app-dialog-btn primary" disabled={!renameStem.trim()}>
                    {t('explorer.rename')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </TreeDnDCtx.Provider>
  )
}
