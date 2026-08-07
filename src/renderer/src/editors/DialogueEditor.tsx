import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import {
  allocateDialogueId,
  CHARACTER_COLOR_PRESETS,
  type Character,
  type DialogueLine,
  emptyDialogueCsv,
  exportLocaleCsv,
  exportPipelineCsv,
  fileStemFromPath,
  isDialoguePath,
  dialogueMetaPathFor,
  normalizeFontSize,
  normalizeTextColor,
  parseCharactersCsv,
  parseDialogueCsv,
  parseDialogueFileMeta,
  type DialogueFileMeta,
  serializeCharactersCsv,
  serializeDialogueCsv,
  slugifyCharacterId
} from './dialogueCsv'

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
        /* ignore unreadable files */
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

export function DialogueEditor({ tabId }: { tabId: string }) {
  const { t, i18n } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const workspacePath = useAppStore((s) => s.workspacePath)
  const fileTree = useAppStore((s) => s.fileTree)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const showToast = useAppStore((s) => s.showToast)
  const refreshTree = useAppStore((s) => s.refreshTree)

  const [lines, setLines] = useState<DialogueLine[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
  const [draft, setDraft] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
  /** Line ids with Godot staging subsection expanded (default collapsed). */
  const [stagingOpenIds, setStagingOpenIds] = useState<Set<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [idManual, setIdManual] = useState(false)
  const [fileMeta, setFileMeta] = useState<DialogueFileMeta | null>(null)

  const [newChar, setNewChar] = useState({
    id: '',
    name: '',
    color: CHARACTER_COLOR_PRESETS[0],
    note: '',
    model_node: ''
  })
  const applyingRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useOverlayScroll(listRef)

  const fileStem = tab ? fileStemFromPath(tab.path) : 'dialogue'
  const defaultScene = fileMeta?.dialogue_id?.trim() || fileStem
  const charMap = useMemo(() => {
    const m = new Map<string, Character>()
    for (const c of characters) m.set(c.id, c)
    return m
  }, [characters])

  const loadCharacters = useCallback(async () => {
    if (!workspacePath) {
      setCharacters([])
      return
    }
    const path = charactersPath(workspacePath)
    const platform = getPlatform()
    try {
      const exists = await platform.exists(path)
      if (!exists) {
        setCharacters([])
        return
      }
      const raw = await platform.readFile(path)
      setCharacters(parseCharactersCsv(raw))
    } catch {
      setCharacters([])
    }
  }, [workspacePath])

  const saveCharacters = useCallback(
    async (next: Character[]) => {
      if (!workspacePath) return
      const path = charactersPath(workspacePath)
      await getPlatform().writeFile(path, serializeCharactersCsv(next))
      setCharacters(next)
      await refreshTree()
    },
    [workspacePath, refreshTree]
  )

  useEffect(() => {
    void loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    if (!tab) {
      setFileMeta(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
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
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tab?.path])

  useEffect(() => {
    if (!tab) return
    if (applyingRef.current) return
    setLines(parseDialogueCsv(tab.content || emptyDialogueCsv()))
  }, [tab?.id, tab?.content])

  const persist = useCallback(
    (next: DialogueLine[]) => {
      setLines(next)
      applyingRef.current = true
      updateTabContent(tabId, serializeDialogueCsv(next))
      requestAnimationFrame(() => {
        applyingRef.current = false
      })
    },
    [tabId, updateTabContent]
  )

  const scrollToBottom = (): void => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const appendLine = async (): Promise<void> => {
    const text = draft.trim()
    if (!text) return
    if (!selectedSpeaker) {
      showToast(t('dialogue.needSpeaker'), 'error')
      return
    }
    const char = charMap.get(selectedSpeaker)
    if (!char) {
      showToast(t('dialogue.unknownSpeaker'), 'error')
      return
    }
    const existing = await collectWorkspaceDialogueIds(workspacePath, fileTree, tab?.path, lines)
    const scene = defaultScene
    const id = allocateDialogueId(existing, {
      scene,
      fileStem,
      characterId: char.id
    })
    const line: DialogueLine = {
      id,
      speaker: char.id,
      text,
      note: '',
      emotion: '',
      scene,
      condition: '',
      audio: '',
      focus_node: '',
      font_size: '',
      text_color: ''
    }
    persist([...lines, line])
    setDraft('')
    setMentionOpen(false)
    scrollToBottom()
  }

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void appendLine()
    }
  }

  const updateLine = (id: string, patch: Partial<DialogueLine>): void => {
    persist(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const updateStagingField = (
    id: string,
    field: 'focus_node' | 'font_size' | 'text_color',
    raw: string,
    commit: boolean
  ): void => {
    if (field === 'focus_node') {
      updateLine(id, { focus_node: raw })
      return
    }
    if (!commit) {
      updateLine(id, { [field]: raw } as Partial<DialogueLine>)
      return
    }
    if (field === 'font_size') {
      const n = normalizeFontSize(raw)
      if (!n.ok) showToast(t('dialogue.invalidFontSize'), 'error')
      updateLine(id, { font_size: n.value })
      return
    }
    const n = normalizeTextColor(raw)
    if (!n.ok) showToast(t('dialogue.invalidTextColor'), 'error')
    updateLine(id, { text_color: n.value })
  }

  const deleteLine = (id: string): void => {
    if (!window.confirm(t('dialogue.confirmDeleteLine'))) return
    persist(lines.filter((l) => l.id !== id))
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
    if (expandedId === id) setExpandedId(null)
  }

  const duplicateLine = async (id: string): Promise<void> => {
    const src = lines.find((l) => l.id === id)
    if (!src) return
    const existing = await collectWorkspaceDialogueIds(workspacePath, fileTree, tab?.path, lines)
    const newId = allocateDialogueId(existing, {
      scene: src.scene,
      fileStem,
      characterId: src.speaker || 'char'
    })
    const copy: DialogueLine = { ...src, id: newId }
    const idx = lines.findIndex((l) => l.id === id)
    const next = [...lines]
    next.splice(idx + 1, 0, copy)
    persist(next)
  }

  const onDropReorder = (targetId: string): void => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    const from = lines.findIndex((l) => l.id === dragId)
    const to = lines.findIndex((l) => l.id === targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      return
    }
    const next = [...lines]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    persist(next)
    setDragId(null)
  }

  const submitCreateCharacter = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    const name = newChar.name.trim()
    const modelNode = newChar.model_node.trim()
    if (!name) return
    if (!modelNode) {
      showToast(t('dialogue.modelNodeRequired'), 'error')
      return
    }
    let id = (newChar.id.trim() || slugifyCharacterId(name)).replace(/\s+/g, '_')
    if (!id) id = 'char'
    if (editingCharacter) {
      if (!selectedSpeaker) return
      const next = characters.map((c) =>
        c.id === selectedSpeaker
          ? {
              ...c,
              name,
              color: newChar.color || CHARACTER_COLOR_PRESETS[0],
              note: newChar.note,
              model_node: modelNode
            }
          : c
      )
      await saveCharacters(next)
      setCreateOpen(false)
      setEditingCharacter(false)
      setPickerOpen(false)
      setIdManual(false)
      setNewChar({ id: '', name: '', color: CHARACTER_COLOR_PRESETS[0], note: '', model_node: '' })
      return
    }
    if (characters.some((c) => c.id === id)) {
      showToast(t('dialogue.characterIdConflict'), 'error')
      return
    }
    const next = [
      ...characters,
      {
        id,
        name,
        color: newChar.color || CHARACTER_COLOR_PRESETS[0],
        note: newChar.note,
        model_node: modelNode
      }
    ]
    await saveCharacters(next)
    setSelectedSpeaker(id)
    setCreateOpen(false)
    setEditingCharacter(false)
    setPickerOpen(false)
    setIdManual(false)
    setNewChar({ id: '', name: '', color: CHARACTER_COLOR_PRESETS[0], note: '', model_node: '' })
  }

  const openEditCharacter = (): void => {
    const c = selectedSpeaker ? charMap.get(selectedSpeaker) : undefined
    if (!c) return
    setPickerOpen(false)
    setEditingCharacter(true)
    setIdManual(true)
    setNewChar({
      id: c.id,
      name: c.name,
      color: c.color,
      note: c.note,
      model_node: c.model_node || ''
    })
    setCreateOpen(true)
  }

  const deleteCharacter = async (id: string): Promise<void> => {
    const usedHere = lines.some((l) => l.speaker === id)
    const msg = usedHere ? t('dialogue.confirmDeleteCharacterUsed') : t('dialogue.confirmDeleteCharacter')
    if (!window.confirm(msg)) return
    await saveCharacters(characters.filter((c) => c.id !== id))
    if (selectedSpeaker === id) setSelectedSpeaker('')
    setPickerOpen(false)
  }

  const exportSelection = (): DialogueLine[] => {
    if (selectedIds.size === 0) return lines
    return lines.filter((l) => selectedIds.has(l.id))
  }

  const runExport = async (
    mode: 'pipeline' | 'locale',
    opts: {
      emotion: boolean
      condition: boolean
      audio: boolean
      focus_node: boolean
      font_size: boolean
      text_color: boolean
      lang: string
    }
  ): Promise<void> => {
    const data = exportSelection()
    if (data.length === 0) {
      showToast(t('dialogue.nothingToExport'), 'error')
      return
    }
    const platform = getPlatform()
    const csv =
      mode === 'pipeline' ? exportPipelineCsv(data, opts) : exportLocaleCsv(data, opts.lang)
    const suffix = mode === 'pipeline' ? 'pipeline' : `locale-${opts.lang}`
    const name = `${fileStem}-${suffix}.csv`
    const dir = tab ? platform.dirname(tab.path) : workspacePath
    if (!dir) return
    const outPath = platform.joinPath(dir, name)
    try {
      await platform.writeFile(outPath, csv)
      await refreshTree()
      setExportOpen(false)
      showToast(t('dialogue.exported', { path: name }), 'info')
    } catch {
      showToast(t('errors.saveFailed'), 'error')
    }
  }

  const filteredMentions = useMemo(() => {
    if (!mentionOpen) return []
    const at = draft.lastIndexOf('@')
    const q = at >= 0 ? draft.slice(at + 1).toLowerCase() : ''
    if (!q) return characters
    return characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    )
  }, [mentionOpen, draft, characters])

  const pickMention = (c: Character): void => {
    setSelectedSpeaker(c.id)
    setMentionOpen(false)
    const at = draft.lastIndexOf('@')
    if (at >= 0) setDraft(draft.slice(0, at).replace(/\s+$/, ''))
    inputRef.current?.focus()
  }

  if (!tab) return null

  const selectedChar = selectedSpeaker ? charMap.get(selectedSpeaker) : undefined

  return (
    <div className="dialogue-host">
      <div className="dialogue-toolbar">
        <button type="button" onClick={() => setExportOpen(true)}>
          {t('dialogue.export')}
        </button>
        <span className="dialogue-toolbar-hint">
          {fileMeta
            ? t('dialogue.metaHint', { scene: fileMeta.godot_scene, id: fileMeta.dialogue_id })
            : selectedIds.size > 0
              ? t('dialogue.selectedCount', { count: selectedIds.size })
              : t('dialogue.lineCount', { count: lines.length })}
        </span>
      </div>

      <div className="dialogue-list kentucky-overlay-scroll" ref={listRef}>
        {lines.length === 0 ? (
          <div className="dialogue-empty">{t('dialogue.empty')}</div>
        ) : (
          lines.map((line) => {
            const char = charMap.get(line.speaker)
            const name = char?.name ?? t('dialogue.unknownCharacter')
            const color = char?.color ?? '#8b8b8b'
            const selected = selectedIds.has(line.id)
            const expanded = expandedId === line.id
            return (
              <div
                key={line.id}
                className={`dialogue-bubble ${selected ? 'selected' : ''} ${dragId === line.id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(line.id)}
                onDragOver={(e: DragEvent) => e.preventDefault()}
                onDrop={() => onDropReorder(line.id)}
              >
                <label className="dialogue-select">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const n = new Set(prev)
                        if (n.has(line.id)) n.delete(line.id)
                        else n.add(line.id)
                        return n
                      })
                    }}
                  />
                </label>
                <div className="dialogue-bubble-body">
                  <div className="dialogue-bubble-head">
                    <span className="dialogue-speaker" style={{ color }}>
                      {name}
                    </span>
                    <button
                      type="button"
                      className="dialogue-id"
                      title={t('dialogue.copyId')}
                      onClick={() => void navigator.clipboard.writeText(line.id)}
                    >
                      {line.id}
                    </button>
                  </div>
                  {editingId === line.id ? (
                    <textarea
                      className="dialogue-edit-text"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => {
                        updateLine(line.id, { text: editText })
                        setEditingId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingId(null)
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          updateLine(line.id, { text: editText })
                          setEditingId(null)
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="dialogue-text"
                      onClick={() => {
                        setEditingId(line.id)
                        setEditText(line.text)
                      }}
                    >
                      {line.text || t('dialogue.emptyText')}
                    </button>
                  )}
                  <div className="dialogue-bubble-actions">
                    <button type="button" onClick={() => setExpandedId(expanded ? null : line.id)}>
                      {expanded ? t('dialogue.collapse') : t('dialogue.details')}
                    </button>
                    <button type="button" onClick={() => void duplicateLine(line.id)}>
                      {t('dialogue.duplicate')}
                    </button>
                    <button type="button" className="danger" onClick={() => deleteLine(line.id)}>
                      {t('dialogue.delete')}
                    </button>
                  </div>
                  {expanded ? (
                    <div className="dialogue-details">
                      <label>
                        {t('dialogue.speaker')}
                        <select
                          value={line.speaker}
                          onChange={(e) => updateLine(line.id, { speaker: e.target.value })}
                        >
                          {!char ? (
                            <option value={line.speaker}>{t('dialogue.unknownCharacter')}</option>
                          ) : null}
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t('dialogue.scene')}
                        <input
                          value={line.scene}
                          onChange={(e) => updateLine(line.id, { scene: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('dialogue.note')}
                        <input
                          value={line.note}
                          onChange={(e) => updateLine(line.id, { note: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('dialogue.emotion')}
                        <input
                          value={line.emotion}
                          onChange={(e) => updateLine(line.id, { emotion: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('dialogue.condition')}
                        <input
                          value={line.condition}
                          onChange={(e) => updateLine(line.id, { condition: e.target.value })}
                        />
                      </label>
                      <label>
                        {t('dialogue.audio')}
                        <input
                          value={line.audio}
                          onChange={(e) => updateLine(line.id, { audio: e.target.value })}
                        />
                      </label>
                      <div className="dialogue-staging">
                        <button
                          type="button"
                          className="dialogue-staging-toggle"
                          onClick={() =>
                            setStagingOpenIds((prev) => {
                              const n = new Set(prev)
                              if (n.has(line.id)) n.delete(line.id)
                              else n.add(line.id)
                              return n
                            })
                          }
                        >
                          {stagingOpenIds.has(line.id)
                            ? t('dialogue.stagingCollapse')
                            : t('dialogue.staging')}
                        </button>
                        {stagingOpenIds.has(line.id) ? (
                          <div className="dialogue-staging-fields">
                            <label>
                              {t('dialogue.focusNode')}
                              <input
                                value={line.focus_node ?? ''}
                                placeholder={t('dialogue.focusNodePlaceholder')}
                                onChange={(e) =>
                                  updateStagingField(line.id, 'focus_node', e.target.value, false)
                                }
                                spellCheck={false}
                              />
                            </label>
                            <label>
                              {t('dialogue.fontSize')}
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={line.font_size ?? ''}
                                placeholder={t('dialogue.fontSizePlaceholder')}
                                onChange={(e) =>
                                  updateStagingField(line.id, 'font_size', e.target.value, false)
                                }
                                onBlur={(e) =>
                                  updateStagingField(line.id, 'font_size', e.target.value, true)
                                }
                              />
                            </label>
                            <label>
                              {t('dialogue.textColor')}
                              <div className="dialogue-color-row">
                                <input
                                  type="color"
                                  value={
                                    /^#[0-9a-fA-F]{6}$/.test(line.text_color ?? '')
                                      ? line.text_color
                                      : /^#[0-9a-fA-F]{3}$/.test(line.text_color ?? '')
                                        ? `#${(line.text_color as string)
                                            .slice(1)
                                            .split('')
                                            .map((c) => c + c)
                                            .join('')}`
                                        : '#ffffff'
                                  }
                                  onChange={(e) =>
                                    updateStagingField(line.id, 'text_color', e.target.value, true)
                                  }
                                  title={t('dialogue.textColor')}
                                />
                                <input
                                  value={line.text_color ?? ''}
                                  placeholder={t('dialogue.textColorPlaceholder')}
                                  onChange={(e) =>
                                    updateStagingField(line.id, 'text_color', e.target.value, false)
                                  }
                                  onBlur={(e) =>
                                    updateStagingField(line.id, 'text_color', e.target.value, true)
                                  }
                                  spellCheck={false}
                                />
                                {(line.text_color ?? '') ? (
                                  <button
                                    type="button"
                                    className="dialogue-staging-clear"
                                    onClick={() =>
                                      updateStagingField(line.id, 'text_color', '', true)
                                    }
                                  >
                                    {t('dialogue.clearColor')}
                                  </button>
                                ) : null}
                              </div>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="dialogue-composer">
        {mentionOpen && filteredMentions.length > 0 ? (
          <div className="dialogue-mention-menu">
            {filteredMentions.map((c) => (
              <button key={c.id} type="button" onClick={() => pickMention(c)}>
                <span className="dialogue-mention-swatch" style={{ background: c.color }} />
                {c.name}
                <span className="muted">@{c.id}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="dialogue-composer-card">
          <textarea
            ref={inputRef}
            className="dialogue-composer-input"
            rows={2}
            placeholder={t('dialogue.composerPlaceholder')}
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              setMentionOpen(v.includes('@'))
            }}
            onKeyDown={onComposerKey}
          />
          <div className="dialogue-composer-footer">
            <div className="dialogue-mode-picker">
              <button
                type="button"
                className={`dialogue-mode-chip ${pickerOpen ? 'open' : ''}`}
                onClick={() => setPickerOpen((v) => !v)}
              >
                {selectedChar ? (
                  <>
                    <span
                      className="dialogue-mention-swatch"
                      style={{ background: selectedChar.color }}
                    />
                    {selectedChar.name}
                  </>
                ) : (
                  t('dialogue.pickSpeaker')
                )}
                <span className="dialogue-mode-caret">▾</span>
              </button>
              {pickerOpen ? (
                <div className="dialogue-mode-menu">
                  {characters.length === 0 ? (
                    <div className="dialogue-mode-empty">{t('dialogue.noCharacters')}</div>
                  ) : (
                    characters.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={c.id === selectedSpeaker ? 'active' : ''}
                        onClick={() => {
                          setSelectedSpeaker(c.id)
                          setPickerOpen(false)
                        }}
                      >
                        <span className="dialogue-mention-swatch" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    ))
                  )}
                  <div className="ctx-sep" />
                  <button
                    type="button"
                    onClick={() => {
                      setPickerOpen(false)
                      setEditingCharacter(false)
                      setCreateOpen(true)
                      setIdManual(false)
                      setNewChar({
                        id: '',
                        name: '',
                        color:
                          CHARACTER_COLOR_PRESETS[characters.length % CHARACTER_COLOR_PRESETS.length],
                        note: '',
                        model_node: ''
                      })
                    }}
                  >
                    {t('dialogue.createCharacter')}
                  </button>
                  {selectedSpeaker ? (
                    <button type="button" onClick={() => openEditCharacter()}>
                      {t('dialogue.editCharacter')}
                    </button>
                  ) : null}
                  {selectedSpeaker ? (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void deleteCharacter(selectedSpeaker)}
                    >
                      {t('dialogue.deleteCharacter')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="dialogue-send"
              title={t('dialogue.send')}
              aria-label={t('dialogue.send')}
              disabled={!draft.trim()}
              onClick={() => void appendLine()}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 3a.75.75 0 0 1 .53.22l3.5 3.5a.75.75 0 0 1-1.06 1.06L8.75 5.56v7.19a.75.75 0 0 1-1.5 0V5.56L5.03 7.78a.75.75 0 0 1-1.06-1.06l3.5-3.5A.75.75 0 0 1 8 3Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {createOpen ? (
        <div className="app-dialog-backdrop" role="presentation">
          <form className="app-dialog" onSubmit={(e) => void submitCreateCharacter(e)}>
            <h2 className="app-dialog-title">
              {editingCharacter ? t('dialogue.editCharacter') : t('dialogue.createCharacter')}
            </h2>
            <div className="dialogue-char-form">
              <label>
                {t('dialogue.characterName')}
                <input
                  value={newChar.name}
                  required
                  onChange={(e) => {
                    const name = e.target.value
                    setNewChar((s) => ({
                      ...s,
                      name,
                      id: editingCharacter || idManual ? s.id : slugifyCharacterId(name)
                    }))
                  }}
                />
              </label>
              <label>
                {t('dialogue.characterId')}
                <input
                  value={newChar.id}
                  disabled={editingCharacter}
                  onChange={(e) => {
                    setIdManual(true)
                    setNewChar((s) => ({ ...s, id: e.target.value.trim() }))
                  }}
                />
              </label>
              <label title={t('dialogue.modelNodeHint')}>
                {t('dialogue.modelNode')}
                <input
                  value={newChar.model_node}
                  required
                  placeholder={t('dialogue.modelNodePlaceholder')}
                  title={t('dialogue.modelNodeHint')}
                  onChange={(e) => setNewChar((s) => ({ ...s, model_node: e.target.value }))}
                  spellCheck={false}
                />
              </label>
              <label>
                {t('dialogue.characterColor')}
                <div className="dialogue-color-row">
                  {CHARACTER_COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`dialogue-color-dot ${newChar.color === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewChar((s) => ({ ...s, color: c }))}
                    />
                  ))}
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(newChar.color) ? newChar.color : '#88c0d0'}
                    onChange={(e) => setNewChar((s) => ({ ...s, color: e.target.value }))}
                  />
                </div>
              </label>
              <label>
                {t('dialogue.characterNote')}
                <input
                  value={newChar.note}
                  onChange={(e) => setNewChar((s) => ({ ...s, note: e.target.value }))}
                />
              </label>
            </div>
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-btn ghost"
                onClick={() => {
                  setCreateOpen(false)
                  setEditingCharacter(false)
                }}
              >
                {t('editor.cancel')}
              </button>
              <div className="app-dialog-actions-end">
                <button type="submit" className="app-dialog-btn primary">
                  {editingCharacter ? t('dialogue.saveCharacter') : t('explorer.create')}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {exportOpen ? (
        <ExportDialog
          langDefault={i18n.language.startsWith('zh') ? 'zh' : 'en'}
          onClose={() => setExportOpen(false)}
          onExport={(mode, opts) => void runExport(mode, opts)}
        />
      ) : null}
    </div>
  )
}

function ExportDialog({
  langDefault,
  onClose,
  onExport
}: {
  langDefault: string
  onClose: () => void
  onExport: (
    mode: 'pipeline' | 'locale',
    opts: {
      emotion: boolean
      condition: boolean
      audio: boolean
      focus_node: boolean
      font_size: boolean
      text_color: boolean
      lang: string
    }
  ) => void
}) {
  const { t } = useTranslation()
  const [emotion, setEmotion] = useState(true)
  const [condition, setCondition] = useState(true)
  const [audio, setAudio] = useState(true)
  const [focusNode, setFocusNode] = useState(true)
  const [fontSize, setFontSize] = useState(true)
  const [textColor, setTextColor] = useState(true)
  const [lang, setLang] = useState(langDefault)

  const opts = {
    emotion,
    condition,
    audio,
    focus_node: focusNode,
    font_size: fontSize,
    text_color: textColor,
    lang
  }

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <div className="app-dialog">
        <h2 className="app-dialog-title">{t('dialogue.export')}</h2>
        <p className="app-dialog-body">{t('dialogue.exportHint')}</p>
        <div className="dialogue-export-opts">
          <label>
            <input type="checkbox" checked={emotion} onChange={(e) => setEmotion(e.target.checked)} />
            emotion
          </label>
          <label>
            <input
              type="checkbox"
              checked={condition}
              onChange={(e) => setCondition(e.target.checked)}
            />
            condition
          </label>
          <label>
            <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
            audio
          </label>
          <label>
            <input
              type="checkbox"
              checked={focusNode}
              onChange={(e) => setFocusNode(e.target.checked)}
            />
            focus_node
          </label>
          <label>
            <input
              type="checkbox"
              checked={fontSize}
              onChange={(e) => setFontSize(e.target.checked)}
            />
            font_size
          </label>
          <label>
            <input
              type="checkbox"
              checked={textColor}
              onChange={(e) => setTextColor(e.target.checked)}
            />
            text_color
          </label>
          <label>
            {t('dialogue.localeLang')}
            <input value={lang} onChange={(e) => setLang(e.target.value.trim() || 'zh')} />
          </label>
        </div>
        <div className="app-dialog-actions">
          <button type="button" className="app-dialog-btn ghost" onClick={onClose}>
            {t('editor.cancel')}
          </button>
          <div className="app-dialog-actions-end">
            <button
              type="button"
              className="app-dialog-btn"
              onClick={() => onExport('locale', opts)}
            >
              {t('dialogue.exportLocale')}
            </button>
            <button
              type="button"
              className="app-dialog-btn primary"
              onClick={() => onExport('pipeline', opts)}
            >
              {t('dialogue.exportPipeline')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
