import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

export type SegmentedOption<T extends string | boolean | number> = {
  value: T
  label: ReactNode
}

type Props<T extends string | boolean | number> = {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  'aria-label'?: string
  className?: string
}

/**
 * Segmented control with clip-path active reveal (Emil tab-indicator recipe).
 * Purpose: state indication + press feedback. Transitions only — interruptible.
 */
export function SegmentedControl<T extends string | boolean | number>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  className
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const activeLayerRef = useRef<HTMLDivElement>(null)
  const [clip, setClip] = useState('inset(0 100% 0 0)')
  const [ready, setReady] = useState(false)

  const measure = useCallback(() => {
    const layer = activeLayerRef.current
    if (!layer) return
    const buttons = layer.querySelectorAll<HTMLElement>('[data-value]')
    const target = String(value)
    const active = Array.from(buttons).find((btn) => btn.dataset.value === target)
    if (!active) return
    const layerRect = layer.getBoundingClientRect()
    const btnRect = active.getBoundingClientRect()
    const left = Math.max(0, btnRect.left - layerRect.left)
    const right = Math.max(0, layerRect.right - btnRect.right)
    setClip(`inset(0 ${right}px 0 ${left}px round 7px)`)
    setReady(true)
  }, [value])

  useLayoutEffect(() => {
    measure()
  }, [measure, options])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div
      ref={rootRef}
      className={['seg-control', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
      data-ready={ready ? 'true' : undefined}
    >
      <div className="seg-control-layer seg-control-base">
        {options.map((opt) => {
          const active = Object.is(opt.value, value)
          return (
            <button
              key={String(opt.value)}
              type="button"
              data-value={String(opt.value)}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
            >
              <span className="seg-control-label">{opt.label}</span>
            </button>
          )
        })}
      </div>
      <div
        ref={activeLayerRef}
        className="seg-control-layer seg-control-active"
        aria-hidden
        style={{ clipPath: clip }}
      >
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            tabIndex={-1}
            data-value={String(opt.value)}
          >
            <span className="seg-control-label">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
