import { useRef, useState, type MouseEvent as ReactMouseEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { FileTree } from './FileTree'

type CreateKind = 'file' | 'folder' | 'mindmap' | 'dialogue' | null

export function Sidebar() {
  const { t } = useTranslation()
  const workspacePath = useAppStore((s) => s.workspacePath)
  const fileTree = useAppStore((s) => s.fileTree)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const createFile = useAppStore((s) => s.createFile)
  const createFolder = useAppStore((s) => s.createFolder)
  const createMindMap = useAppStore((s) => s.createMindMap)
  const createDialogue = useAppStore((s) => s.createDialogue)
  const dragging = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [createKind, setCreateKind] = useState<CreateKind>(null)
  const [name, setName] = useState('')
  const [createParent, setCreateParent] = useState<string | undefined>(undefined)

  const openCreate = (kind: CreateKind, parentDir?: string) => {
    if (!workspacePath || !kind) return
    const defaults: Record<Exclude<CreateKind, null>, string> = {
      file: 'untitled.md',
      folder: 'folder',
      mindmap: 'ideas.kmind',
      dialogue: 'scene.dialogue.csv'
    }
    setCreateKind(kind)
    setCreateParent(parentDir)
    setName(defaults[kind])
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }

  const cancelCreate = () => {
    setCreateKind(null)
    setName('')
    setCreateParent(undefined)
  }

  const submitCreate = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !createKind) {
      cancelCreate()
      return
    }
    const kind = createKind
    const parent = createParent
    cancelCreate()
    if (kind === 'file') await createFile(trimmed, parent)
    else if (kind === 'folder') await createFolder(trimmed, parent)
    else if (kind === 'mindmap') await createMindMap(trimmed, parent)
    else await createDialogue(trimmed, parent)
  }

  const promptLabel =
    createKind === 'file'
      ? t('explorer.promptFileName')
      : createKind === 'folder'
        ? t('explorer.promptFolderName')
        : createKind === 'mindmap'
          ? t('explorer.promptMindMapName')
          : t('explorer.promptDialogueName')

  const onSashDown = (e: ReactMouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startW = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setSidebarWidth(startW + (ev.clientX - startX))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <span>{t('explorer.title')}</span>
          <div className="sidebar-actions">
            <button
              type="button"
              title={t('explorer.newFile')}
              disabled={!workspacePath}
              onClick={() => openCreate('file')}
            >
              +
            </button>
            <button
              type="button"
              title={t('explorer.newFolder')}
              disabled={!workspacePath}
              onClick={() => openCreate('folder')}
            >
              ⌁
            </button>
            <button
              type="button"
              title={t('explorer.newMindMap')}
              disabled={!workspacePath}
              onClick={() => openCreate('mindmap')}
            >
              ◉
            </button>
            <button
              type="button"
              title={t('explorer.newDialogue')}
              disabled={!workspacePath}
              onClick={() => openCreate('dialogue')}
            >
              ◈
            </button>
            <button
              type="button"
              title={t('explorer.refresh')}
              disabled={!workspacePath}
              onClick={() => void refreshTree()}
            >
              ↻
            </button>
          </div>
        </div>

        {createKind ? (
          <form className="sidebar-create" onSubmit={(e) => void submitCreate(e)}>
            <label className="sidebar-create-label">{promptLabel}</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelCreate()
                }
              }}
              spellCheck={false}
            />
            <div className="sidebar-create-actions">
              <button type="submit" className="btn-primary sidebar-create-ok">
                {t('explorer.create')}
              </button>
              <button type="button" onClick={cancelCreate}>
                {t('explorer.cancel')}
              </button>
            </div>
          </form>
        ) : null}

        <div className="sidebar-body">
          {!workspacePath ? (
            <div className="sidebar-empty">{t('explorer.empty')}</div>
          ) : (
            <FileTree
              entries={fileTree}
              onRequestCreate={(kind, parentDir) => openCreate(kind, parentDir)}
            />
          )}
        </div>
      </aside>
      <div className="sash" onMouseDown={onSashDown} role="separator" aria-orientation="vertical" />
    </>
  )
}
