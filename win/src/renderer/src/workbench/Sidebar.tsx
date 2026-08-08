import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { FileTree } from './FileTree'
import {
  CREATE_FILE_EXT,
  CREATE_MINDMAP_EXT,
  applyStemKeepExt
} from './explorerNames'

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
  const sceneInputRef = useRef<HTMLInputElement>(null)
  const sidebarBodyRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(sidebarBodyRef)

  const [createKind, setCreateKind] = useState<CreateKind>(null)
  const [name, setName] = useState('')
  const [createParent, setCreateParent] = useState<string | undefined>(undefined)

  const [godotScene, setGodotScene] = useState('')
  const [dialogueId, setDialogueId] = useState('')

  const createExt =
    createKind === 'file' ? CREATE_FILE_EXT : createKind === 'mindmap' ? CREATE_MINDMAP_EXT : ''

  const openCreate = (kind: CreateKind, parentDir?: string) => {
    if (!workspacePath || !kind) return
    setCreateParent(parentDir)
    if (kind === 'dialogue') {
      setCreateKind('dialogue')
      setGodotScene('')
      setDialogueId('')
      return
    }
    const defaults: Record<'file' | 'folder' | 'mindmap', string> = {
      file: 'untitled',
      folder: 'folder',
      mindmap: 'ideas'
    }
    setCreateKind(kind)
    setName(defaults[kind])
  }

  useEffect(() => {
    if (createKind === 'dialogue') {
      const id = window.setTimeout(() => sceneInputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
    if (createKind === 'file' || createKind === 'folder' || createKind === 'mindmap') {
      const id = window.setTimeout(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.select()
      }, 0)
      return () => window.clearTimeout(id)
    }
  }, [createKind])

  const cancelCreate = () => {
    setCreateKind(null)
    setName('')
    setCreateParent(undefined)
    setGodotScene('')
    setDialogueId('')
  }

  const submitCreate = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!createKind || createKind === 'dialogue') {
      cancelCreate()
      return
    }
    const kind = createKind
    const parent = createParent
    const ext = kind === 'file' ? CREATE_FILE_EXT : kind === 'mindmap' ? CREATE_MINDMAP_EXT : ''
    const trimmed = applyStemKeepExt(name, ext)
    if (!trimmed) {
      cancelCreate()
      return
    }
    cancelCreate()
    if (kind === 'file') await createFile(trimmed, parent)
    else if (kind === 'folder') await createFolder(trimmed, parent)
    else await createMindMap(trimmed, parent)
  }

  const submitDialogue = async (e?: FormEvent) => {
    e?.preventDefault()
    const scene = godotScene.trim()
    const id = dialogueId.trim()
    if (!scene || !id) return
    const parent = createParent
    cancelCreate()
    await createDialogue({ godotScene: scene, dialogueId: id }, parent)
  }

  const promptLabel =
    createKind === 'file'
      ? t('explorer.promptFileName')
      : createKind === 'folder'
        ? t('explorer.promptFolderName')
        : t('explorer.promptMindMapName')

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

  const inlineCreate = createKind === 'file' || createKind === 'folder' || createKind === 'mindmap'

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

        {inlineCreate ? (
          <form
            className="sidebar-create"
            onSubmit={(e) => void submitCreate(e)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <label className="sidebar-create-label" htmlFor="sidebar-create-name">
              {promptLabel}
            </label>
            <div className="sidebar-create-name-row">
              <input
                id="sidebar-create-name"
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelCreate()
                  }
                  e.stopPropagation()
                }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {createExt ? <span className="sidebar-create-ext">{createExt}</span> : null}
            </div>
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

        <div className="sidebar-body kentucky-overlay-scroll" ref={sidebarBodyRef}>
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

      {createKind === 'dialogue' ? (
        <div className="app-dialog-backdrop" role="presentation">
          <form className="app-dialog" onSubmit={(e) => void submitDialogue(e)}>
            <h2 className="app-dialog-title">{t('dialogue.createDialogueTitle')}</h2>
            <p className="app-dialog-body">{t('dialogue.createDialogueHintAutoName')}</p>
            <div className="dialogue-char-form">
              <label>
                {t('dialogue.godotScene')}
                <input
                  ref={sceneInputRef}
                  type="text"
                  value={godotScene}
                  required
                  placeholder={t('dialogue.godotScenePlaceholder')}
                  onChange={(e) => setGodotScene(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label>
                {t('dialogue.dialogueId')}
                <input
                  type="text"
                  value={dialogueId}
                  required
                  placeholder={t('dialogue.dialogueIdPlaceholder')}
                  onChange={(e) => setDialogueId(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="app-dialog-actions">
              <button type="button" className="app-dialog-btn ghost" onClick={cancelCreate}>
                {t('explorer.cancel')}
              </button>
              <div className="app-dialog-actions-end">
                <button
                  type="submit"
                  className="app-dialog-btn primary"
                  disabled={!godotScene.trim() || !dialogueId.trim()}
                >
                  {t('explorer.create')}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
