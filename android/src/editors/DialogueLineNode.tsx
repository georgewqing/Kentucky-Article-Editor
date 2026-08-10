import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import type { DialogueNodeData } from './dialogueGraphMap'
import { truncateChoiceLabel } from './dialogueGraphMap'

function DialogueLineNodeView({ data, selected }: NodeProps) {
  const { t } = useTranslation()
  const d = data as DialogueNodeData
  const line = d.line
  const color = d.speakerColor || 'var(--accent)'
  const name = d.speakerName || line?.speaker || '?'
  const text = (line?.text || '').trim() || '…'
  const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text
  const outs = d.choiceOuts || (d.choiceLabels || []).map((label) => ({ text: label, isEnd: false }))

  return (
    <div className={`dialogue-flow-node ${selected ? 'selected' : ''} ${d.isOpening ? 'is-opening' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="dialogue-handle" />
      <div className="dialogue-flow-node-head" style={{ borderLeftColor: color }}>
        <span className="dialogue-flow-speaker" style={{ color }}>
          {name}
        </span>
        {d.isOpening ? <span className="dialogue-flow-badge">{t('dialogue.openingBadge')}</span> : null}
      </div>
      <div className="dialogue-flow-node-body">{preview}</div>
      {outs.length > 0 ? (
        <div className="dialogue-flow-choices" aria-label={t('dialogue.choiceEdge')}>
          {outs.map((opt, i) => {
            const full = opt.text
            const operable = Boolean(d.speakerOperable)
            const display = opt.isEnd
              ? full.trim()
                ? truncateChoiceLabel(full, 16)
                : t('dialogue.endChip')
              : full.trim()
                ? truncateChoiceLabel(full, 16)
                : operable
                  ? t('dialogue.nextLine')
                  : t('dialogue.autoAdvance')
            const title = opt.isEnd
              ? full.trim() || t('dialogue.endChip')
              : full.trim() ||
                (operable ? t('dialogue.nextLine') : t('dialogue.autoAdvance'))
            return (
              <div
                key={`${i}-${full}-${opt.isEnd}`}
                className={`dialogue-flow-choice-chip ${!opt.isEnd && !full.trim() && !operable ? 'is-auto' : ''}`}
                title={title}
              >
                <span className="dialogue-flow-choice-idx">{i + 1}</span>
                <span className="dialogue-flow-choice-text">{display}</span>
              </div>
            )
          })}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="dialogue-handle dialogue-handle-out"
        title={t('dialogue.choiceHandle')}
      />
    </div>
  )
}

function DialogueEndNodeView({ selected }: NodeProps) {
  return (
    <div className={`dialogue-flow-end ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="dialogue-handle" />
      <span>End</span>
    </div>
  )
}

export const DialogueLineNode = memo(DialogueLineNodeView)
export const DialogueEndNode = memo(DialogueEndNodeView)

export const dialogueNodeTypes = {
  dialogueLine: DialogueLineNode,
  dialogueEnd: DialogueEndNode
}
