import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { DialogueNodeData } from './dialogueGraphMap'

function DialogueLineNodeView({ data, selected }: NodeProps) {
  const d = data as DialogueNodeData
  const line = d.line
  const color = d.speakerColor || 'var(--accent)'
  const name = d.speakerName || line?.speaker || '?'
  const text = (line?.text || '').trim() || '…'
  const preview = text.length > 72 ? `${text.slice(0, 72)}…` : text

  return (
    <div className={`dialogue-flow-node ${selected ? 'selected' : ''} ${d.isOpening ? 'is-opening' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" className="dialogue-handle" />
      <div className="dialogue-flow-node-head" style={{ borderLeftColor: color }}>
        <span className="dialogue-flow-speaker" style={{ color }}>
          {name}
        </span>
        {d.isOpening ? <span className="dialogue-flow-badge">开场</span> : null}
        {(d.choiceCount || 0) > 0 ? (
          <span className="dialogue-flow-badge muted">{d.choiceCount} 选项</span>
        ) : null}
      </div>
      <div className="dialogue-flow-node-body">{preview}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="sequence"
        className="dialogue-handle dialogue-handle-seq"
        title="顺序"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="choice"
        className="dialogue-handle dialogue-handle-choice"
        title="选项"
      />
    </div>
  )
}

function DialogueEndNodeView({ selected }: NodeProps) {
  return (
    <div className={`dialogue-flow-end ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="dialogue-handle" />
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
