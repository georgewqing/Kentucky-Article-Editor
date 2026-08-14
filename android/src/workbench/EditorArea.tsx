import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore, type OpenTab } from '@/state/appStore'
import { getPlatform } from '@/platform'
import { MonacoTextEditor } from '@/editors/MonacoTextEditor'
import { MarkdownArticleEditor } from '@/editors/MarkdownArticleEditor'
import { MindMapEditor } from '@/editors/MindMapEditor'
import { DialogueEditor } from '@/editors/DialogueEditor'
import { CharactersEditor } from '@/editors/CharactersEditor'
import { useFittedMenuPos } from './fitContextMenu'

function insertIndexFromPoint(scrollEl: HTMLElement, clientX: number): number {
  const nodes = Array.from(scrollEl.querySelectorAll<HTMLElement>('[data-tab-id]'))
  for (let i = 0; i < nodes.length; i++) {
    const r = nodes[i].getBoundingClientRect()
    if (clientX < r.left + r.width / 2) return i
  }
  return nodes.length
}

function dropLineLeft(scrollEl: HTMLElement, insertBefore: number): number {
  const nodes = Array.from(scrollEl.querySelectorAll<HTMLElement>('[data-tab-id]'))
  const box = scrollEl.getBoundingClientRect()
  if (nodes.length === 0) return 0
  if (insertBefore >= nodes.length) {
    const last = nodes[nodes.length - 1].getBoundingClientRect()
    return last.right - box.left + scrollEl.scrollLeft
  }
  return nodes[insertBefore].getBoundingClientRect().left - box.left + scrollEl.scrollLeft
}

function tabMark(tab: OpenTab): string {
  if (tab.isNew || tab.dirty) return '● '
  return ''
}

function PaneFilePicker({
  tabId,
  onPickTab
}: {
  tabId: string | null
  onPickTab: (id: string) => void
}) {
  const { t } = useTranslation()
  const tabs = useAppStore((s) => s.tabs)
  const current = tabs.find((item) => item.id === tabId)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const { menuRef, menuPos } = useFittedMenuPos(open, anchor.x, anchor.y)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      const el = e.target
      if (el instanceof Element && el.closest('.pane-file-menu, .pane-file-picker-btn')) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    if (open) {
      setOpen(false)
      return
    }
    setAnchor({ x: r.left, y: r.bottom + 4 })
    setOpen(true)
  }

  return (
    <div className="pane-file-picker">
      <span className="pane-file-picker-kicker">{t('editor.paneFile')}</span>
      <button
        ref={btnRef}
        type="button"
        className="pane-file-picker-btn"
        title={t('editor.paneFileTitle')}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="pane-file-picker-name">
          {current ? `${tabMark(current)}${current.title}` : t('editor.noEditor')}
        </span>
        <span className="pane-file-picker-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="ctx-menu pane-file-menu kentucky-overlay-scroll"
              style={{
                left: menuPos.x,
                top: menuPos.y,
                minWidth: Math.max(btnRef.current?.getBoundingClientRect().width ?? 184, 184)
              }}
              role="listbox"
            >
              {tabs.length === 0 ? (
                <div className="pane-file-menu-empty">{t('editor.noEditor')}</div>
              ) : (
                tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === tabId}
                    className={item.id === tabId ? 'is-active' : undefined}
                    onClick={() => {
                      onPickTab(item.id)
                      setOpen(false)
                    }}
                  >
                    {item.isNew ? (
                      <span className="tab-new">● </span>
                    ) : item.dirty ? (
                      <span className="tab-dirty">● </span>
                    ) : null}
                    {item.title}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

function EditorPane({
  tabId,
  showPicker,
  onPickTab
}: {
  tabId: string | null
  showPicker?: boolean
  onPickTab?: (id: string) => void
}) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => (tabId ? s.tabs.find((x) => x.id === tabId) : undefined))

  const isMarkdown = tab
    ? getPlatform().extname(tab.path) === '.md' ||
      /\.md\.txt$/i.test(tab.path.replace(/\\/g, '/'))
    : false

  return (
    <div className="editor-pane">
      {showPicker && onPickTab ? <PaneFilePicker tabId={tabId} onPickTab={onPickTab} /> : null}
      {!tab ? (
        <div className="editor-empty">{t('editor.noEditor')}</div>
      ) : tab.kind === 'mindmap' ? (
        <MindMapEditor tabId={tab.id} />
      ) : tab.kind === 'dialogue' ? (
        <DialogueEditor tabId={tab.id} />
      ) : tab.kind === 'characters' ? (
        <CharactersEditor tabId={tab.id} />
      ) : isMarkdown ? (
        <MarkdownArticleEditor key={tab.id} tabId={tab.id} />
      ) : (
        <MonacoTextEditor key={tab.id} tabId={tab.id} />
      )}
    </div>
  )
}

export function EditorArea() {
  const { t } = useTranslation()
  const [compactLayout, setCompactLayout] = useState(() =>
    window.matchMedia('(max-width: 1100px)').matches
  )
  const tabs = useAppStore((s) => s.tabs)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const splitEnabled = useAppStore((s) => s.splitEnabled)
  const splitTabId = useAppStore((s) => s.splitTabId)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const closeTab = useAppStore((s) => s.closeTab)
  const enableSplit = useAppStore((s) => s.enableSplit)
  const disableSplit = useAppStore((s) => s.disableSplit)
  const setSplitTab = useAppStore((s) => s.setSplitTab)
  const reorderTabs = useAppStore((s) => s.reorderTabs)

  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    insertBefore: number
    active: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropLeft, setDropLeft] = useState<number | null>(null)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)')
    const update = (): void => setCompactLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (compactLayout && splitEnabled) disableSplit()
  }, [compactLayout, splitEnabled, disableSplit])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (dx === 0) return
      e.preventDefault()
      el.scrollLeft += dx
    }
    const onContextMenu = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu, true)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [])

  const updateDrop = (clientX: number) => {
    const el = scrollRef.current
    const d = dragRef.current
    if (!el || !d) return
    const edge = 36
    const box = el.getBoundingClientRect()
    if (clientX < box.left + edge) el.scrollLeft -= 14
    else if (clientX > box.right - edge) el.scrollLeft += 14
    d.insertBefore = insertIndexFromPoint(el, clientX)
    setDropLeft(dropLineLeft(el, d.insertBefore))
  }

  const onTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>, tabId: string) => {
    if (e.button !== 0 && e.button !== 2) return
    if ((e.target as HTMLElement | null)?.closest('.tab-close')) return
    if (e.button === 2) e.preventDefault()

    dragRef.current = {
      id: tabId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      insertBefore: tabs.findIndex((tab) => tab.id === tabId),
      active: false
    }

    const node = e.currentTarget
    try {
      node.setPointerCapture(e.pointerId)
    } catch {
      /* capture optional */
    }

    let finished = false
    const onContextMenu = (ev: Event) => ev.preventDefault()
    const onMove = (ev: PointerEvent | MouseEvent) => {
      const d = dragRef.current
      if (!d || d.id !== tabId) return
      if ('pointerId' in ev && ev.pointerId !== d.pointerId) return
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 5) return
        d.active = true
        setDraggingId(tabId)
      }
      updateDrop(ev.clientX)
    }

    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', finish, true)
      window.removeEventListener('contextmenu', onContextMenu, true)
      try {
        if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const d = dragRef.current
      dragRef.current = null
      setDraggingId(null)
      setDropLeft(null)
      if (d?.active) {
        suppressClickRef.current = true
        reorderTabs(d.id, d.insertBefore)
      }
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mouseup', finish, true)
    window.addEventListener('contextmenu', onContextMenu, true)
  }

  return (
    <section className="editor-area">
      <div className="tab-bar">
        <div
          ref={scrollRef}
          className={`tab-bar-scroll${draggingId ? ' is-reordering' : ''}`}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab${tab.id === activeTabId ? ' active' : ''}${
                splitEnabled && tab.id === splitTabId ? ' split-target' : ''
              }${tab.id === draggingId ? ' is-dragging' : ''}`}
              title={t('editor.reorderTabsHint')}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false
                  return
                }
                setActiveTab(tab.id)
              }}
              onPointerDown={(e) => onTabPointerDown(e, tab.id)}
              onMouseDown={(e) => {
                if (e.button === 2) e.preventDefault()
              }}
              onContextMenu={(e) => e.preventDefault()}
              onAuxClick={(e) => e.preventDefault()}
            >
              <span className="tab-title">
                {tab.isNew ? (
                  <span className="tab-new" title={t('editor.tabNew')}>
                    ●{' '}
                  </span>
                ) : tab.dirty ? (
                  <span className="tab-dirty" title={t('editor.tabDirty')}>
                    ●{' '}
                  </span>
                ) : null}
                {tab.title}
              </span>
              <button
                type="button"
                className="tab-close"
                title={t('editor.close')}
                aria-label={`${t('editor.close')} ${tab.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTab(tab.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
          {dropLeft != null ? (
            <div className="tab-drop-line" style={{ left: dropLeft }} />
          ) : null}
        </div>
        <div className="tab-bar-actions">
          {splitEnabled ? (
            <button type="button" onClick={disableSplit}>
              {t('editor.closeSplit')}
            </button>
          ) : (
            <button
              type="button"
              disabled={tabs.length < 1 || compactLayout}
              title={compactLayout ? t('editor.splitNeedsWideScreen') : undefined}
              onClick={() => enableSplit()}
            >
              {t('editor.splitEditor')}
            </button>
          )}
        </div>
      </div>
      <div className="editors-split">
        <EditorPane
          tabId={activeTabId}
          showPicker={splitEnabled}
          onPickTab={setActiveTab}
        />
        {splitEnabled ? (
          <EditorPane tabId={splitTabId} showPicker onPickTab={setSplitTab} />
        ) : null}
      </div>
    </section>
  )
}
