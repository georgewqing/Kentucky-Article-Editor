import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { askConfirm } from '@/state/confirmDialogStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import {
  CHARACTER_COLOR_PRESETS,
  type Character,
  emptyCharactersCsv,
  parseCharactersCsv,
  serializeCharactersCsv,
  slugifyCharacterId
} from './dialogueCsv'

export function CharactersEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const showToast = useAppStore((s) => s.showToast)

  const [characters, setCharacters] = useState<Character[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [idManual, setIdManual] = useState(false)
  const [form, setForm] = useState({
    id: '',
    name: '',
    color: CHARACTER_COLOR_PRESETS[0],
    note: '',
    model_node: ''
  })

  const applyingRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(listRef)

  useEffect(() => {
    if (!tab || applyingRef.current) {
      applyingRef.current = false
      return
    }
    setCharacters(parseCharactersCsv(tab.content || emptyCharactersCsv()))
  }, [tab?.content, tab?.id])

  const persist = (next: Character[]): void => {
    if (!tab) return
    applyingRef.current = true
    setCharacters(next)
    updateTabContent(tabId, serializeCharactersCsv(next))
  }

  const updateCharacter = (id: string, patch: Partial<Character>): void => {
    persist(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const deleteCharacter = async (id: string): Promise<void> => {
    const ok = await askConfirm({
      title: t('dialogue.delete'),
      message: t('characters.confirmDelete'),
      confirmLabel: t('dialogue.delete'),
      danger: true
    })
    if (!ok) return
    persist(characters.filter((c) => c.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const openCreate = (): void => {
    setIdManual(false)
    setForm({
      id: '',
      name: '',
      color: CHARACTER_COLOR_PRESETS[0],
      note: '',
      model_node: ''
    })
    setCreateOpen(true)
  }

  const submitCreate = (e?: FormEvent): void => {
    e?.preventDefault()
    const name = form.name.trim()
    const modelNode = form.model_node.trim()
    if (!name) return
    if (!modelNode) {
      showToast(t('dialogue.modelNodeRequired'), 'error')
      return
    }
    let id = (form.id.trim() || slugifyCharacterId(name)).replace(/\s+/g, '_')
    if (!id) id = 'char'
    if (characters.some((c) => c.id === id)) {
      showToast(t('dialogue.characterIdConflict'), 'error')
      return
    }
    persist([
      ...characters,
      {
        id,
        name,
        color: form.color || CHARACTER_COLOR_PRESETS[0],
        note: form.note,
        model_node: modelNode
      }
    ])
    setCreateOpen(false)
    setExpandedId(id)
  }

  if (!tab) return null

  return (
    <div className="characters-host">
      <div className="dialogue-toolbar">
        <button type="button" onClick={openCreate}>
          {t('characters.add')}
        </button>
        <span className="dialogue-toolbar-hint">
          {t('characters.count', { count: characters.length })}
        </span>
      </div>

      <div className="characters-list kentucky-overlay-scroll" ref={listRef}>
        {characters.length === 0 ? (
          <div className="dialogue-empty">{t('characters.empty')}</div>
        ) : (
          characters.map((c) => {
            const expanded = expandedId === c.id
            return (
              <div
                key={c.id}
                className={`character-card ${expanded ? 'expanded' : ''}`}
                style={{ borderLeftColor: c.color || '#88c0d0' }}
              >
                <div className="character-card-main">
                  <span
                    className="character-card-swatch"
                    style={{ background: c.color || '#88c0d0' }}
                    title={c.color}
                  />
                  <div className="character-card-body">
                    <div className="character-card-head">
                      <span className="character-card-name">{c.name}</span>
                      <span className="character-card-id">@{c.id}</span>
                    </div>
                    <div className="character-card-meta">
                      <span>
                        {t('dialogue.modelNode')}: {c.model_node || '—'}
                      </span>
                      {c.note ? <span className="character-card-note">{c.note}</span> : null}
                    </div>
                  </div>
                  <div className="character-card-actions">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : c.id)}
                    >
                      {expanded ? t('dialogue.collapse') : t('dialogue.details')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void deleteCharacter(c.id)}
                    >
                      {t('dialogue.delete')}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="character-card-details dialogue-details">
                    <label>
                      {t('dialogue.characterName')}
                      <input
                        value={c.name}
                        onChange={(e) => updateCharacter(c.id, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      {t('dialogue.characterId')}
                      <input value={c.id} disabled title={t('characters.idLocked')} />
                    </label>
                    <label title={t('dialogue.modelNodeHint')}>
                      {t('dialogue.modelNode')}
                      <input
                        value={c.model_node}
                        placeholder={t('dialogue.modelNodePlaceholder')}
                        onChange={(e) => updateCharacter(c.id, { model_node: e.target.value })}
                        spellCheck={false}
                      />
                    </label>
                    <label>
                      {t('dialogue.characterNote')}
                      <input
                        value={c.note}
                        onChange={(e) => updateCharacter(c.id, { note: e.target.value })}
                      />
                    </label>
                    <label>
                      {t('dialogue.characterColor')}
                      <div className="dialogue-color-row">
                        {CHARACTER_COLOR_PRESETS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`dialogue-color-dot ${c.color === color ? 'active' : ''}`}
                            style={{ background: color }}
                            onClick={() => updateCharacter(c.id, { color })}
                          />
                        ))}
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#88c0d0'}
                          onChange={(e) => updateCharacter(c.id, { color: e.target.value })}
                        />
                        <input
                          value={c.color}
                          onChange={(e) => updateCharacter(c.id, { color: e.target.value })}
                          spellCheck={false}
                        />
                      </div>
                    </label>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      {createOpen ? (
        <div className="app-dialog-backdrop" role="presentation">
          <form className="app-dialog" onSubmit={(e) => void submitCreate(e)}>
            <h2 className="app-dialog-title">{t('dialogue.createCharacter')}</h2>
            <div className="dialogue-char-form">
              <label>
                {t('dialogue.characterName')}
                <input
                  value={form.name}
                  required
                  autoFocus
                  onChange={(e) => {
                    const name = e.target.value
                    setForm((s) => ({
                      ...s,
                      name,
                      id: idManual ? s.id : slugifyCharacterId(name)
                    }))
                  }}
                />
              </label>
              <label>
                {t('dialogue.characterId')}
                <input
                  value={form.id}
                  onChange={(e) => {
                    setIdManual(true)
                    setForm((s) => ({ ...s, id: e.target.value.trim() }))
                  }}
                />
              </label>
              <label title={t('dialogue.modelNodeHint')}>
                {t('dialogue.modelNode')}
                <input
                  value={form.model_node}
                  required
                  placeholder={t('dialogue.modelNodePlaceholder')}
                  onChange={(e) => setForm((s) => ({ ...s, model_node: e.target.value }))}
                  spellCheck={false}
                />
              </label>
              <label>
                {t('dialogue.characterColor')}
                <div className="dialogue-color-row">
                  {CHARACTER_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`dialogue-color-dot ${form.color === color ? 'active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setForm((s) => ({ ...s, color }))}
                    />
                  ))}
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#88c0d0'}
                    onChange={(e) => setForm((s) => ({ ...s, color: e.target.value }))}
                  />
                </div>
              </label>
              <label>
                {t('dialogue.characterNote')}
                <input
                  value={form.note}
                  onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                />
              </label>
            </div>
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-btn ghost"
                onClick={() => setCreateOpen(false)}
              >
                {t('editor.cancel')}
              </button>
              <div className="app-dialog-actions-end">
                <button type="submit" className="app-dialog-btn primary">
                  {t('explorer.create')}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
