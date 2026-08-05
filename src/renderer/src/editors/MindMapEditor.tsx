import { useEffect, useRef, useState, type MouseEvent } from 'react'
import MindElixir from 'mind-elixir'
import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { useTranslation } from 'react-i18next'
import {
  createEmptyKMind,
  parseKMind,
  serializeKMind,
  type KMindDocument,
  type KMindNode,
  newNodeId
} from './kmind'

function toMindElixir(doc: KMindDocument): MindElixirData {
  const convert = (n: KMindNode): NodeObj => ({
    id: n.id,
    topic: n.text,
    children: n.children.map(convert)
  })
  return {
    nodeData: convert(doc.root)
  }
}

function fromMindElixir(data: MindElixirData): KMindDocument {
  const convert = (n: NodeObj): KMindNode => ({
    id: n.id || newNodeId(),
    text: n.topic || '',
    children: (n.children || []).map(convert)
  })
  return {
    version: 1,
    root: convert(data.nodeData),
    viewport: { x: 0, y: 0, zoom: 1 }
  }
}

function loadDoc(content: string, fallbackRoot: string): KMindDocument {
  if (!content.trim()) return createEmptyKMind(fallbackRoot)
  try {
    return parseKMind(content)
  } catch {
    return createEmptyKMind(fallbackRoot)
  }
}

function buildCompactTheme(mode: 'dark' | 'light') {
  const base = mode === 'light' ? MindElixir.THEME : MindElixir.DARK_THEME
  return {
    ...base,
    name: `kentucky-${mode}`,
    cssVar: {
      ...base.cssVar,
      '--gap': '14px',
      '--root-radius': '6px',
      '--main-radius': '4px',
      '--topic-padding': '4px 8px'
    }
  }
}

type CtxMenu = { x: number; y: number } | null

export function MindMapEditor({ tabId }: { tabId: string }) {
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<MindElixirInstance | null>(null)
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const saveTab = useAppStore((s) => s.saveTab)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const [menu, setMenu] = useState<CtxMenu>(null)

  useEffect(() => {
    if (!containerRef.current || !tab) return

    const el = containerRef.current
    el.innerHTML = ''

    const doc = loadDoc(tab.content, t('editor.mindMapRoot'))
    const locale = i18n.language.startsWith('zh') ? 'zh_CN' : 'en'
    const me = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      draggable: true,
      contextMenu: true,
      toolBar: false,
      keypress: true,
      locale,
      overflowHidden: true,
      theme: buildCompactTheme(themeMode),
      editable: true,
      newTopicName: t('editor.newNode')
    })

    me.init(toMindElixir(doc))
    instanceRef.current = me
    requestAnimationFrame(() => {
      try {
        const rootEl = me.findEle(doc.root.id)
        if (rootEl) me.selectNode(rootEl)
      } catch {
        /* ignore */
      }
      me.scale(0.95)
      me.toCenter()
    })

    const sync = () => {
      if (!instanceRef.current) return
      const data = instanceRef.current.getData()
      const next = fromMindElixir(data)
      updateTabContent(tabId, serializeKMind(next))
    }

    me.bus.addListener('operation', sync)

    return () => {
      me.bus.removeListener('operation', sync)
      instanceRef.current = null
      me.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, themeMode, i18n.language])

  useEffect(() => {
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const syncFromInstance = () => {
    const me = instanceRef.current
    if (!me) return
    updateTabContent(tabId, serializeKMind(fromMindElixir(me.getData())))
  }

  const onHostContextMenu = (e: MouseEvent) => {
    // If Mind Elixir already handled a node, its menu may show;
    // always offer our fallback create menu as well for empty canvas / reliability.
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const addChild = async () => {
    const me = instanceRef.current
    if (!me) return
    setMenu(null)
    await me.addChild()
    syncFromInstance()
  }

  const addSibling = async () => {
    const me = instanceRef.current
    if (!me) return
    setMenu(null)
    await me.insertSibling('after')
    syncFromInstance()
  }

  const removeNode = async () => {
    const me = instanceRef.current
    if (!me) return
    setMenu(null)
    await me.removeNode()
    syncFromInstance()
  }

  if (!tab) return null

  return (
    <div className="mindmap-host" onContextMenu={onHostContextMenu}>
      <div className="mindmap-toolbar">
        <button type="button" onClick={() => void saveTab(tabId)}>
          {t('editor.save')}
        </button>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {menu ? (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={() => void addChild()}>
            {t('mindmap.addChild')}
          </button>
          <button type="button" onClick={() => void addSibling()}>
            {t('mindmap.addSibling')}
          </button>
          <div className="ctx-sep" />
          <button type="button" className="danger" onClick={() => void removeNode()}>
            {t('mindmap.removeNode')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
