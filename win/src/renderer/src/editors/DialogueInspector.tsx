import { useTranslation } from 'react-i18next'
import type { Character, DialogueLine } from './dialogueCsv'
import { normalizeFontSize, normalizeTextColor } from './dialogueCsv'

type Props = {
  line: DialogueLine | null
  characters: Character[]
  edgeLabel: string | null
  onUpdateLine: (patch: Partial<DialogueLine>) => void
  onUpdateEdgeLabel: (label: string) => void
  onInvalid?: (msg: string) => void
}

export function DialogueInspector({
  line,
  characters,
  edgeLabel,
  onUpdateLine,
  onUpdateEdgeLabel,
  onInvalid
}: Props) {
  const { t } = useTranslation()

  if (edgeLabel !== null && !line) {
    return (
      <aside className="dialogue-inspector">
        <h3>{t('dialogue.choiceEdge')}</h3>
        <label className="dialogue-inspector-field">
          <span>{t('dialogue.choiceText')}</span>
          <input
            value={edgeLabel}
            onChange={(e) => onUpdateEdgeLabel(e.target.value)}
            placeholder={t('dialogue.choiceTextPlaceholder')}
          />
        </label>
      </aside>
    )
  }

  if (!line) {
    return (
      <aside className="dialogue-inspector is-empty">
        <p>{t('dialogue.inspectorEmpty')}</p>
      </aside>
    )
  }

  const commitFont = (raw: string): void => {
    const n = normalizeFontSize(raw)
    if (!n.ok) onInvalid?.(t('dialogue.invalidFontSize'))
    onUpdateLine({ font_size: n.value })
  }
  const commitColor = (raw: string): void => {
    const n = normalizeTextColor(raw)
    if (!n.ok) onInvalid?.(t('dialogue.invalidTextColor'))
    onUpdateLine({ text_color: n.value })
  }

  return (
    <aside className="dialogue-inspector">
      <h3>{t('dialogue.inspectorTitle')}</h3>
      <label className="dialogue-inspector-field">
        <span>{t('dialogue.speaker')}</span>
        <select
          value={line.speaker}
          onChange={(e) => onUpdateLine({ speaker: e.target.value })}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
          {!characters.some((c) => c.id === line.speaker) ? (
            <option value={line.speaker}>{line.speaker}</option>
          ) : null}
        </select>
      </label>
      <label className="dialogue-inspector-field">
        <span>{t('dialogue.lineText')}</span>
        <textarea
          rows={5}
          value={line.text}
          onChange={(e) => onUpdateLine({ text: e.target.value })}
        />
      </label>
      <label className="dialogue-inspector-field">
        <span>{t('dialogue.note')}</span>
        <input value={line.note} onChange={(e) => onUpdateLine({ note: e.target.value })} />
      </label>
      <label className="dialogue-inspector-field">
        <span>{t('dialogue.emotion')}</span>
        <input value={line.emotion} onChange={(e) => onUpdateLine({ emotion: e.target.value })} />
      </label>
      <label className="dialogue-inspector-field">
        <span>{t('dialogue.id')}</span>
        <input value={line.id} readOnly className="is-readonly" />
      </label>
      <details className="dialogue-inspector-staging">
        <summary>{t('dialogue.staging')}</summary>
        <label className="dialogue-inspector-field">
          <span>{t('dialogue.focusNode')}</span>
          <input
            value={line.focus_node}
            onChange={(e) => onUpdateLine({ focus_node: e.target.value })}
          />
        </label>
        <label className="dialogue-inspector-field">
          <span>{t('dialogue.fontSize')}</span>
          <input
            value={line.font_size}
            onChange={(e) => onUpdateLine({ font_size: e.target.value })}
            onBlur={(e) => commitFont(e.target.value)}
          />
        </label>
        <label className="dialogue-inspector-field">
          <span>{t('dialogue.textColor')}</span>
          <input
            value={line.text_color}
            onChange={(e) => onUpdateLine({ text_color: e.target.value })}
            onBlur={(e) => commitColor(e.target.value)}
          />
        </label>
      </details>
    </aside>
  )
}
