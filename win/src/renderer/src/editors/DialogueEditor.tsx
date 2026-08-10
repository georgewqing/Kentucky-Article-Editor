import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ConnectionMode,
  type Connection,
  type Edge,
  type OnSelectionChangeParams
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { askConfirm } from '@/state/confirmDialogStore'
import {
  allocateDialogueId,
  CHARACTER_COLOR_PRESETS,
  type Character,
  type DialogueLine,
  dialogueChoicesPathFor,
  dialogueLayoutPathFor,
  dialogueMetaPathFor,
  DIALOGUE_END_NODE_ID,
  emptyDialogueCsv,
  exportLocaleCsv,
  exportPipelineCsv,
  fileStemFromPath,
  isDialoguePath,
  parseCharactersCsv,
  parseDialogueChoices,
  parseDialogueCsv,
  parseDialogueFileMeta,
  parseDialogueLayout,
  serializeCharactersCsv,
  serializeDialogueChoices,
  serializeDialogueCsv,
  serializeDialogueLayout,
  slugifyCharacterId,
  type DialogueFileMeta
} from './dialogueCsv'
import {
  diskFromGraph,
  graphFromDisk,
  listBrokenRefsIfDelete,
  layoutDialogueFlow,
  refreshNodePresentation,
  decorateDialogueEdges,
  edgesOnPathsTowardEnd,
  wouldCreateMixedEmptyOptions,
  choiceEdgeVisualProps,
  resolveOpeningId,
  withExclusiveOpening,
  type DialogueFlowEdge,
  type DialogueFlowNode
} from './dialogueGraphMap'
import { dialogueNodeTypes } from './DialogueLineNode'
import { DialogueInspector } from './DialogueInspector'
import { DialogueMiniMap } from './DialogueMiniMap'
import { setDialogueSidecarFlush } from './dialogueSidecarFlush'

async function collectWorkspaceDialogueIds(
  workspacePath: string | null,
  fileTree: FileEntry[],
  excludePath?: string,
  extraLines?: DialogueLine[]
): Promise<Set<string>> {
  const ids = new Set<string>()
  const platform = getPlatform()
  const walk = async (entries: FileEntry[]): Promise<void> => {
    for (const e of entries) {
      if (e.isDirectory && e.children) {
        await walk(e.children)
        continue
      }
      if (!isDialoguePath(e.path)) continue
      if (
        excludePath &&
        e.path.replace(/\\/g, '/').toLowerCase() === excludePath.replace(/\\/g, '/').toLowerCase()
      ) {
        continue
      }
      try {
        const raw = await platform.readFile(e.path)
        for (const line of parseDialogueCsv(raw)) ids.add(line.id)
      } catch {
        /* ignore */
      }
    }
  }
  if (workspacePath) await walk(fileTree)
  if (extraLines) for (const l of extraLines) ids.add(l.id)
  return ids
}

function charactersPath(workspacePath: string): string {
  return getPlatform().joinPath(workspacePath, 'characters.csv')
}

const UNDO_MAX = 40
const INSPECTOR_MIN = 200
const INSPECTOR_MAX = 480
const INSPECTOR_DEFAULT = 280

function useDialogueChrome() {
  const themeMode = useSettingsStore((s) => s.themeMode)
  const accent = useSettingsStore((s) => s.accent)
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const gray =
      css.getPropertyValue('--bg-elev-3').trim() || (themeMode === 'dark' ? '#242424' : '#eeeeee')
    return {
      minimap: {
        bgColor: gray,
        nodeColor: accent,
        edgeColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)'
      }
    }
  }, [themeMode, accent])
}

function DialogueGraphInner({ tabId }: { tabId: string }) {
  const { t, i18n } = useTranslation()
  const chrome = useDialogueChrome()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const workspacePath = useAppStore((s) => s.workspacePath)
  const fileTree = useAppStore((s) => s.fileTree)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const showToast = useAppStore((s) => s.showToast)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const { fitView, screenToFlowPosition } = useReactFlow()

  const [characters, setCharacters] = useState<Character[]>([])
  const [fileMeta, setFileMeta] = useState<DialogueFileMeta | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<DialogueFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<DialogueFlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingEdgeLabel, setEditingEdgeLabel] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT)
  const [newChar, setNewChar] = useState({
    id: '',
    name: '',
    color: CHARACTER_COLOR_PRESETS[0],
    note: '',
    model_node: '',
    operable: false
  })

  const applyingRef = useRef(false)
  const hydratedPath = useRef<string | null>(null)
  /** False until first successful graph hydrate — blocks save from writing empty CSV. */
  const graphReadyRef = useRef(false)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const undoStack = useRef<{ nodes: DialogueFlowNode[]; edges: DialogueFlowEdge[] }[]>([])
  const redoStack = useRef<{ nodes: DialogueFlowNode[]; edges: DialogueFlowEdge[] }[]>([])
  const skipUndo = useRef(false)

  nodesRef.current = nodes
  edgesRef.current = edges

  const fileStem = tab ? fileStemFromPath(tab.path) : 'dialogue'
  const defaultScene = fileMeta?.dialogue_id?.trim() || fileStem

  const charMap = useMemo(() => {
    const m = new Map<string, Character>()
    for (const c of characters) m.set(c.id, c)
    return m
  }, [characters])

  const speakerName = useCallback(
    (id: string) => charMap.get(id)?.name || id,
    [charMap]
  )
  const speakerColor = useCallback(
    (id: string) => charMap.get(id)?.color || '#88c0d0',
    [charMap]
  )
  const speakerOperable = useCallback(
    (id: string) => Boolean(charMap.get(id)?.operable),
    [charMap]
  )

  const pushUndo = useCallback((): void => {
    if (skipUndo.current) return
    undoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current)
    })
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift()
    redoStack.current = []
  }, [])

  const applyGraph = useCallback(
    (nextNodes: DialogueFlowNode[], nextEdges: DialogueFlowEdge[], markDirty = true) => {
      const decorated = decorateDialogueEdges(nextEdges)
      const { lines, openingId } = diskFromGraph(nextNodes, decorated)
      const presented = refreshNodePresentation(
        nextNodes,
        decorated,
        openingId,
        speakerName,
        speakerColor,
        speakerOperable
      )
      skipUndo.current = true
      setNodes(presented)
      setEdges(decorated)
      requestAnimationFrame(() => {
        skipUndo.current = false
      })
      if (markDirty && tab) {
        const existingLines = parseDialogueCsv(tab.content || '')
        const lineNodeCount = nextNodes.filter((n) => n.data?.kind === 'line').length
        // Never clobber non-empty buffer with empty CSV unless user removed all line nodes.
        if (lines.length === 0 && existingLines.length > 0 && lineNodeCount > 0) {
          return
        }
        applyingRef.current = true
        updateTabContent(tabId, serializeDialogueCsv(lines))
        requestAnimationFrame(() => {
          applyingRef.current = false
        })
      }
    },
    [setNodes, setEdges, speakerName, speakerColor, speakerOperable, tab, tabId, updateTabContent]
  )

  const flushSidecars = useCallback(async () => {
    if (!tab) return
    if (!graphReadyRef.current) {
      // Editor not hydrated yet — keep existing tab buffer / disk untouched.
      return
    }
    const { lines, choices, layout } = diskFromGraph(nodesRef.current, edgesRef.current)
    const existingLines = parseDialogueCsv(
      useAppStore.getState().tabs.find((t) => t.id === tabId)?.content || tab.content || ''
    )
    const lineNodeCount = nodesRef.current.filter((n) => n.data?.kind === 'line').length
    if (lines.length === 0 && existingLines.length > 0) {
      // Either graph data lost (line nodes without payloads) or not safe to clobber.
      if (lineNodeCount > 0) {
        showToast(t('dialogue.saveGraphInconsistent'), 'error')
        return
      }
      // lineNodeCount === 0 && graphReady: user deleted every line — allow empty write.
    }    // Ensure CSV buffer matches graph before docSave
    applyingRef.current = true
    updateTabContent(tabId, serializeDialogueCsv(lines))
    applyingRef.current = false

    const platform = getPlatform()
    const choicesPath = dialogueChoicesPathFor(tab.path)
    const layoutPath = dialogueLayoutPathFor(tab.path)
    const choicesText = serializeDialogueChoices(choices)
    try {
      if (choicesText) {
        await platform.writeFile(choicesPath, choicesText)
      } else if (await platform.exists(choicesPath)) {
        await platform.delete(choicesPath)
      }
      if (lineNodeCount > 0 || lines.length > 0) {
        await platform.writeFile(layoutPath, serializeDialogueLayout(layout))
      }
      await refreshTree()
    } catch {
      showToast(t('dialogue.saveSidecarFailed'), 'error')
    }
  }, [tab, tabId, updateTabContent, refreshTree, showToast, t])

  useEffect(() => {
    setDialogueSidecarFlush(flushSidecars)
    return () => setDialogueSidecarFlush(null)
  }, [flushSidecars])

  const loadCharacters = useCallback(async () => {
    if (!workspacePath) {
      setCharacters([])
      return
    }
    const path = charactersPath(workspacePath)
    const platform = getPlatform()
    try {
      if (!(await platform.exists(path))) {
        setCharacters([])
        return
      }
      setCharacters(parseCharactersCsv(await platform.readFile(path)))
    } catch {
      setCharacters([])
    }
  }, [workspacePath])

  useEffect(() => {
    void loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    if (!tab) {
      setFileMeta(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const metaPath = dialogueMetaPathFor(tab.path)
        const platform = getPlatform()
        if (!(await platform.exists(metaPath))) {
          if (!cancelled) setFileMeta(null)
          return
        }
        const raw = await platform.readFile(metaPath)
        if (!cancelled) setFileMeta(parseDialogueFileMeta(raw))
      } catch {
        if (!cancelled) setFileMeta(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab?.path])

  // Reset hydrate marker when switching files
  useEffect(() => {
    hydratedPath.current = null
    graphReadyRef.current = false
  }, [tab?.path, tab?.id])

  // Hydrate once per tab open — do NOT depend on content (edits would re-enter races).
  useEffect(() => {
    if (!tab) return
    const hydrateKey = `${tab.id}:${tab.path}`
    if (hydratedPath.current === hydrateKey) return
    let cancelled = false
    void (async () => {
      const platform = getPlatform()
      // Prefer latest store buffer (openFile may settle after first paint).
      const latest =
        useAppStore.getState().tabs.find((t) => t.id === tabId)?.content ?? tab.content ?? ''
      const lines = parseDialogueCsv(latest || emptyDialogueCsv())
      let choices = parseDialogueChoices('')
      let layout = null as ReturnType<typeof parseDialogueLayout> | null
      try {
        const cp = dialogueChoicesPathFor(tab.path)
        if (await platform.exists(cp)) {
          choices = parseDialogueChoices(await platform.readFile(cp))
        }
      } catch {
        /* */
      }
      try {
        const lp = dialogueLayoutPathFor(tab.path)
        if (await platform.exists(lp)) {
          layout = parseDialogueLayout(await platform.readFile(lp))
        }
      } catch {
        /* */
      }
      if (cancelled) return
      const g = graphFromDisk({
        lines,
        choices,
        layout,
        speakerName,
        speakerColor,
        speakerOperable
      })
      skipUndo.current = true
      setNodes(g.nodes)
      setEdges(g.edges)
      undoStack.current = []
      redoStack.current = []
      hydratedPath.current = hydrateKey
      graphReadyRef.current = true
      requestAnimationFrame(() => {
        skipUndo.current = false
        fitView({ padding: 0.2 })
      })
    })()
    return () => {
      cancelled = true
    }
    // speakerName/Color intentionally omitted — presentation refreshed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.path, tab?.id, tabId, fitView, setNodes, setEdges])

  // Refresh speaker labels when characters load (do not rebuild from CSV).
  useEffect(() => {
    if (!graphReadyRef.current) return
    const cur = nodesRef.current
    if (!cur.some((n) => n.data?.kind === 'line')) return
    const { openingId } = diskFromGraph(cur, edgesRef.current)
    skipUndo.current = true
    setNodes(refreshNodePresentation(cur, edgesRef.current, openingId, speakerName, speakerColor, speakerOperable))
    requestAnimationFrame(() => {
      skipUndo.current = false
    })
  }, [characters, speakerName, speakerColor, speakerOperable, setNodes])

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      if (conn.source === DIALOGUE_END_NODE_ID) return
      if (conn.target === conn.source) {
        showToast(t('dialogue.noSelfLink'), 'error')
        return
      }

      // v1.3: all outs are options; default empty text (next / end)
      const label = ''
      if (wouldCreateMixedEmptyOptions(edgesRef.current, conn.source, label)) {
        showToast(t('dialogue.noMixedEmptyOptions'), 'error')
        return
      }

      pushUndo()
      const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const edge: DialogueFlowEdge = {
        id,
        source: conn.source,
        target: conn.target,
        sourceHandle: 'out',
        targetHandle: 'in',
        ...choiceEdgeVisualProps(1),
        data: { kind: 'choice', label },
        className: 'dialogue-edge-choice'
      }
      applyGraph(nodesRef.current, [...edgesRef.current, edge])
    },
    [applyGraph, pushUndo, showToast, t]
  )

  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    const n = p.nodes[0]
    const e = p.edges[0]
    setSelectedNodeId(n && n.id !== DIALOGUE_END_NODE_ID ? n.id : n?.id === DIALOGUE_END_NODE_ID ? null : null)
    if (n?.id && n.id !== DIALOGUE_END_NODE_ID) {
      setSelectedEdgeId(null)
      setEditingEdgeLabel(null)
    } else if (e) {
      setSelectedNodeId(null)
      setSelectedEdgeId(e.id)
      const de = e as DialogueFlowEdge
      if (de.data?.kind === 'choice') {
        setEditingEdgeLabel(String(de.data.label || de.label || ''))
      } else {
        setEditingEdgeLabel(null)
      }
    } else {
      setSelectedEdgeId(null)
      setEditingEdgeLabel(null)
    }
  }, [])

  const onNodeDragStart = useCallback(() => {
    pushUndo()
  }, [pushUndo])

  const onNodeDragStop = useCallback(() => {
    applyGraph(nodesRef.current, edgesRef.current)
  }, [applyGraph])

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!deleted.length) return
      pushUndo()
      const ids = new Set(deleted.map((e) => e.id))
      applyGraph(
        nodesRef.current,
        edgesRef.current.filter((e) => !ids.has(e.id))
      )
    },
    [applyGraph, pushUndo]
  )

  const deleteSelectedNode = useCallback(async () => {
    const id = selectedNodeId
    if (!id || id === DIALOGUE_END_NODE_ID) return
    const broken = listBrokenRefsIfDelete(id, edgesRef.current)
    const seqIn = edgesRef.current.filter((e) => e.target === id || e.source === id)
    const msg =
      broken.length > 0
        ? t('dialogue.confirmDeleteNodeRefs', {
            count: broken.length,
            refs: broken.map((b) => `${b.from} → "${b.label}"`).join('\n')
          })
        : t('dialogue.confirmDeleteLine')
    const ok = await askConfirm({
      title: t('dialogue.delete'),
      message: msg,
      confirmLabel: t('dialogue.delete'),
      danger: true
    })
    if (!ok) return
    pushUndo()
    const nextNodes = nodesRef.current.filter((n) => n.id !== id)
    const nextEdges = edgesRef.current.filter((e) => e.source !== id && e.target !== id)
    void seqIn
    const openingId = resolveOpeningId(nextNodes, nextEdges)
    applyGraph(withExclusiveOpening(nextNodes, openingId), nextEdges)
    setSelectedNodeId(null)
  }, [selectedNodeId, applyGraph, pushUndo, t])

  const setOpening = useCallback(
    (lineId: string) => {
      const exists = nodesRef.current.some((n) => n.id === lineId && n.data?.kind === 'line')
      if (!exists) return
      pushUndo()
      applyGraph(withExclusiveOpening(nodesRef.current, lineId), edgesRef.current)
    },
    [applyGraph, pushUndo]
  )
  const addLine = useCallback(async () => {
    const speaker = characters[0]?.id
    if (!speaker) {
      showToast(t('dialogue.needSpeaker'), 'error')
      setCreateOpen(true)
      return
    }
    const { lines } = diskFromGraph(nodesRef.current, edgesRef.current)
    const existing = await collectWorkspaceDialogueIds(workspacePath, fileTree, tab?.path, lines)
    const id = allocateDialogueId(existing, {
      scene: defaultScene,
      fileStem,
      characterId: speaker
    })
    const line: DialogueLine = {
      id,
      speaker,
      text: '',
      note: '',
      emotion: '',
      scene: defaultScene,
      condition: '',
      audio: '',
      focus_node: '',
      font_size: '',
      text_color: ''
    }
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    })
    pushUndo()
    const node: DialogueFlowNode = {
      id,
      type: 'dialogueLine',
      position: { x: pos.x - 90, y: pos.y - 40 },
      data: {
        kind: 'line',
        line,
        speakerName: speakerName(speaker),
        speakerColor: speakerColor(speaker),
        speakerOperable: speakerOperable(speaker),
        choiceCount: 0
      }
    }
    applyGraph([...nodesRef.current, node], edgesRef.current)
    setSelectedNodeId(id)
  }, [
    characters,
    workspacePath,
    fileTree,
    tab?.path,
    defaultScene,
    fileStem,
    screenToFlowPosition,
    pushUndo,
    applyGraph,
    speakerName,
    speakerColor,
    speakerOperable,
    showToast,
    t
  ])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current)
    })
    applyGraph(prev.nodes, prev.edges)
  }, [applyGraph])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current)
    })
    applyGraph(next.nodes, next.edges)
  }, [applyGraph])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        redo()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (selectedEdgeId) {
          pushUndo()
          applyGraph(
            nodesRef.current,
            edgesRef.current.filter((ed) => ed.id !== selectedEdgeId)
          )
          setSelectedEdgeId(null)
          setEditingEdgeLabel(null)
        } else if (selectedNodeId) {
          void deleteSelectedNode()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, selectedEdgeId, selectedNodeId, deleteSelectedNode, applyGraph, pushUndo])

  const selectedLine = useMemo(() => {
    if (!selectedNodeId) return null
    const n = nodes.find((x) => x.id === selectedNodeId)
    return n?.data?.line || null
  }, [nodes, selectedNodeId])

  const selectedIsOpening = useMemo(() => {
    if (!selectedNodeId) return false
    return Boolean(nodes.find((x) => x.id === selectedNodeId)?.data?.isOpening)
  }, [nodes, selectedNodeId])

  const flowingEdgeIds = useMemo(
    () => (selectedNodeId ? edgesOnPathsTowardEnd(selectedNodeId, edges) : new Set<string>()),
    [selectedNodeId, edges]
  )

  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const flowing = flowingEdgeIds.has(e.id)
        const base = e.className || ''
        const className = flowing
          ? `${base} dialogue-edge-flow`.trim()
          : base.replace(/\bdialogue-edge-flow\b/g, '').trim()
        return {
          ...e,
          animated: flowing,
          className: className || undefined
        }
      }),
    [edges, flowingEdgeIds]
  )

  const updateSelectedLine = (patch: Partial<DialogueLine>): void => {
    if (!selectedNodeId) return
    pushUndo()
    const nextNodes = nodesRef.current.map((n) => {
      if (n.id !== selectedNodeId || !n.data.line) return n
      return { ...n, data: { ...n.data, line: { ...n.data.line, ...patch } } }
    })
    applyGraph(nextNodes, edgesRef.current)
  }

  const updateEdgeLabel = (label: string): void => {
    if (!selectedEdgeId) return
    const edge = edgesRef.current.find((e) => e.id === selectedEdgeId)
    if (!edge) return
    if (wouldCreateMixedEmptyOptions(edgesRef.current, edge.source, label, selectedEdgeId)) {
      showToast(t('dialogue.noMixedEmptyOptions'), 'error')
      return
    }
    setEditingEdgeLabel(label)
    const nextEdges = edgesRef.current.map((e) =>
      e.id === selectedEdgeId
        ? {
            ...e,
            data: { ...e.data, kind: 'choice' as const, label }
          }
        : e
    )
    applyGraph(nodesRef.current, nextEdges)
  }

  const onEdgeDoubleClick = (_: ReactMouseEvent, edge: Edge): void => {
    const de = edge as DialogueFlowEdge
    if (de.data?.kind !== 'choice') return
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
    const cur = String(de.data.label || '')
    const next = window.prompt(t('dialogue.choiceText'), cur)
    if (next === null) return
    const label = next.trim()
    if (wouldCreateMixedEmptyOptions(edgesRef.current, edge.source, label, edge.id)) {
      showToast(t('dialogue.noMixedEmptyOptions'), 'error')
      return
    }
    pushUndo()
    applyGraph(
      nodesRef.current,
      edgesRef.current.map((e) =>
        e.id === edge.id
          ? {
              ...e,
              data: { ...e.data, kind: 'choice' as const, label }
            }
          : e
      )
    )
    setEditingEdgeLabel(label)
  }

  const runAutoLayout = useCallback((): void => {
    if (!nodesRef.current.length) return
    pushUndo()
    const laid = layoutDialogueFlow(nodesRef.current, edgesRef.current)
    applyGraph(laid, edgesRef.current)
    requestAnimationFrame(() => fitView({ padding: 0.2 }))
  }, [applyGraph, pushUndo, fitView])

  const saveCharacters = async (next: Character[]): Promise<void> => {
    if (!workspacePath) return
    await getPlatform().writeFile(charactersPath(workspacePath), serializeCharactersCsv(next))
    setCharacters(next)
    await refreshTree()
  }

  const onCreateCharacter = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const name = newChar.name.trim()
    const model = newChar.model_node.trim()
    if (!name || !model) {
      showToast(t('dialogue.modelNodeRequired'), 'error')
      return
    }
    let id = (newChar.id.trim() || slugifyCharacterId(name)).trim()
    if (!id) id = slugifyCharacterId(name)
    if (characters.some((c) => c.id === id)) {
      showToast(t('dialogue.characterIdConflict'), 'error')
      return
    }
    await saveCharacters([
      ...characters,
      { id, name, color: newChar.color, note: newChar.note, model_node: model, operable: Boolean(newChar.operable) }
    ])
    setCreateOpen(false)
    setNewChar({
      id: '',
      name: '',
      color: CHARACTER_COLOR_PRESETS[0],
      note: '',
      model_node: '',
      operable: false
    })
  }

  const runExport = async (kind: 'pipeline' | 'locale'): Promise<void> => {
    if (!tab) return
    const { lines } = diskFromGraph(nodesRef.current, edgesRef.current)
    const platform = getPlatform()
    const dir = platform.dirname(tab.path)
    const stem = fileStemFromPath(tab.path)
    if (kind === 'pipeline') {
      const text = exportPipelineCsv(lines, {
        emotion: true,
        condition: true,
        audio: true,
        focus_node: true,
        font_size: true,
        text_color: true
      })
      await platform.writeFile(platform.joinPath(dir, `${stem}-pipeline.csv`), text)
    } else {
      const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en'
      await platform.writeFile(
        platform.joinPath(dir, `${stem}-locale-${lang}.csv`),
        exportLocaleCsv(lines, lang)
      )
    }
    setExportOpen(false)
    await refreshTree()
    showToast(t('dialogue.exported', { path: stem }))
  }

  const onInspectorSashDown = (e: ReactMouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = inspectorWidth
    const onMove = (ev: MouseEvent): void => {
      const next = Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, startW - (ev.clientX - startX)))
      setInspectorWidth(next)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!tab) return null

  return (
    <div className="dialogue-graph-editor">
      <div className="dialogue-graph-toolbar">
        <div className="dialogue-graph-toolbar-left">
          <button type="button" onClick={() => void addLine()}>
            {t('dialogue.addLine')}
          </button>
          <button type="button" onClick={() => fitView({ padding: 0.2 })}>
            {t('dialogue.fitView')}
          </button>
          <button type="button" onClick={runAutoLayout}>
            {t('dialogue.autoLayout')}
          </button>
          <button type="button" onClick={undo}>
            {t('dialogue.undo')}
          </button>
          <button type="button" onClick={() => setCreateOpen(true)}>
            {t('dialogue.createCharacter')}
          </button>
          <button type="button" onClick={() => setExportOpen(true)}>
            {t('dialogue.export')}
          </button>
          {selectedNodeId ? (
            <button type="button" className="danger" onClick={() => void deleteSelectedNode()}>
              {t('dialogue.delete')}
            </button>
          ) : null}
        </div>
        <div className="dialogue-graph-meta">
          {fileMeta
            ? t('dialogue.metaHint', { scene: fileMeta.godot_scene, id: fileMeta.dialogue_id })
            : t('dialogue.graphHint')}
        </div>
      </div>

      <div className="dialogue-graph-body">
        <div className="dialogue-graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onEdgesDelete={onEdgesDelete}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodeDoubleClick={(_, n) => {
              if (n.id !== DIALOGUE_END_NODE_ID) setSelectedNodeId(n.id)
            }}
            nodeTypes={dialogueNodeTypes}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            connectionMode={ConnectionMode.Loose}
            fitView
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
            <DialogueMiniMap
              bgColor={chrome.minimap.bgColor}
              nodeColor={chrome.minimap.nodeColor}
              edgeColor={chrome.minimap.edgeColor}
            />
          </ReactFlow>
        </div>
        <div
          className="sash dialogue-inspector-sash"
          onMouseDown={onInspectorSashDown}
          role="separator"
          aria-orientation="vertical"
        />
        <div className="dialogue-inspector-wrap" style={{ width: inspectorWidth }}>
          <DialogueInspector
            line={selectedLine}
            characters={characters}
            isOpening={selectedIsOpening}
            onSetOpening={() => {
              if (selectedNodeId) setOpening(selectedNodeId)
            }}
            edgeLabel={selectedEdgeId && editingEdgeLabel !== null ? editingEdgeLabel : null}
            onUpdateLine={updateSelectedLine}
            onUpdateEdgeLabel={updateEdgeLabel}
            onInvalid={(msg) => showToast(msg, 'error')}
          />
        </div>
      </div>

      {createOpen ? (
        <div className="app-dialog-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <form
            className="app-dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onCreateCharacter(e)}
          >
            <h2 className="app-dialog-title">{t('dialogue.createCharacter')}</h2>
            <label className="dialogue-inspector-field">
              <span>{t('dialogue.characterName')}</span>
              <input
                value={newChar.name}
                onChange={(e) =>
                  setNewChar((c) => ({
                    ...c,
                    name: e.target.value,
                    id: c.id || slugifyCharacterId(e.target.value)
                  }))
                }
                required
              />
            </label>
            <label className="dialogue-inspector-field">
              <span>{t('dialogue.characterId')}</span>
              <input
                value={newChar.id}
                onChange={(e) => setNewChar((c) => ({ ...c, id: e.target.value }))}
              />
            </label>
            <label className="dialogue-inspector-field">
              <span>{t('dialogue.modelNode')}</span>
              <input
                value={newChar.model_node}
                onChange={(e) => setNewChar((c) => ({ ...c, model_node: e.target.value }))}
                required
              />
            </label>
            <label className="dialogue-inspector-field character-operable-row" title={t('characters.operableHint')}>
              <input
                type="checkbox"
                checked={Boolean(newChar.operable)}
                onChange={(e) => setNewChar((c) => ({ ...c, operable: e.target.checked }))}
              />
              <span>{t('characters.operable')}</span>
            </label>
            <div className="app-dialog-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>
                {t('dialog.cancel')}
              </button>
              <button type="submit" className="btn-primary">
                {t('dialog.confirm')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {exportOpen ? (
        <div className="app-dialog-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
          <div className="app-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="app-dialog-title">{t('dialogue.export')}</h2>
            <p className="app-dialog-body">{t('dialogue.exportHint')}</p>
            <div className="app-dialog-actions">
              <button type="button" onClick={() => void runExport('pipeline')}>
                {t('dialogue.exportPipeline')}
              </button>
              <button type="button" onClick={() => void runExport('locale')}>
                {t('dialogue.exportLocale')}
              </button>
              <button type="button" onClick={() => setExportOpen(false)}>
                {t('dialog.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DialogueEditor({ tabId }: { tabId: string }) {
  return (
    <ReactFlowProvider>
      <DialogueGraphInner tabId={tabId} />
    </ReactFlowProvider>
  )
}
