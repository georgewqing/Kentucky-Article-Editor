import { FileDown, Folder } from 'lucide-react'
import { getPlatform } from '@/platform'

type Props = {
  path: string
  onRemove?: () => void
  removeLabel?: string
  /** Sent-message variant uses a round accent glyph. */
  variant?: 'composer' | 'message'
  /** Prefer explicit flag; otherwise trailing `/` marks a folder mount. */
  isDirectory?: boolean
}

export function isMountedDirectory(path: string, isDirectory?: boolean): boolean {
  if (typeof isDirectory === 'boolean') return isDirectory
  return /[/\\]$/.test(path)
}

export function FileMountChip({
  path,
  onRemove,
  removeLabel,
  variant = 'composer',
  isDirectory
}: Props) {
  const dir = isMountedDirectory(path, isDirectory)
  const name = getPlatform().basename(path.replace(/[/\\]+$/, '')) || path
  const Icon = dir ? Folder : FileDown
  return (
    <span
      className={`ai-mount-chip ai-mount-chip-${variant}${dir ? ' is-dir' : ''}`}
      title={path}
    >
      <span className="ai-mount-chip-icon" aria-hidden>
        <Icon size={variant === 'message' ? 11 : 12} strokeWidth={2.25} />
      </span>
      <span className="ai-mount-chip-name">{dir ? `${name}/` : name}</span>
      {onRemove ? (
        <button
          type="button"
          className="ai-mount-chip-x"
          aria-label={removeLabel || 'Remove'}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}
