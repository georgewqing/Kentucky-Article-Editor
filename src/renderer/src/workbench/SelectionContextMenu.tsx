import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/platform'
import { useFittedMenuPos } from './fitContextMenu'

type MenuState = {
  x: number
  y: number
  text: string
  root: HTMLElement | null
}

const SKIP_SELECTOR =
  '.file-tree-wrap, .mindmap-host, .mindmap-canvas, .activity-bar, .app-menu-bar, .app-menu-dropdown, .ctx-menu, .ai-slash-menu, .ai-context-popover, .tab-bar, .pane-file-picker, .pane-file-menu'

function selectionRoot(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement
  if (!el) return null
  return (
    (el.closest(
      '[contenteditable="true"], textarea, input, .monaco-editor, .article-body, .ai-messages, .ai-composer'
    ) as HTMLElement | null) ?? el
  )
}

function selectAllIn(root: HTMLElement | null): void {
  if (!root) {
    document.execCommand('selectAll')
    return
  }
  if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) {
    root.focus()
    root.select()
    return
  }
  const editable = root.isContentEditable
    ? root
    : (root.querySelector('[contenteditable="true"]') as HTMLElement | null)
  if (editable) {
    const range = document.createRange()
    range.selectNodeContents(editable)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    return
  }
  const monacoTa = root.querySelector('textarea.inputarea') as HTMLTextAreaElement | null
  if (monacoTa) {
    monacoTa.focus()
    monacoTa.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    )
    return
  }
  document.execCommand('selectAll')
}

function modKeyLabel(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
}

export function SelectionContextMenu() {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const { menuRef, menuPos } = useFittedMenuPos(Boolean(menu), menu?.x ?? 0, menu?.y ?? 0)
  const mod = modKeyLabel()

  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    const onContextMenu = (e: MouseEvent): void => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest(SKIP_SELECTOR)) return

      const sel = window.getSelection()
      const text = sel?.toString() ?? ''
      if (!text) return

      e.preventDefault()
      e.stopPropagation()

      setMenu({
        x: e.clientX,
        y: e.clientY,
        text,
        root: selectionRoot(sel?.anchorNode ?? null)
      })
    }

    document.addEventListener('contextmenu', onContextMenu, true)
    return () => document.removeEventListener('contextmenu', onContextMenu, true)
  }, [])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: PointerEvent): void => {
      const el = e.target
      if (el instanceof Element && el.closest('.ctx-menu.selection-ctx-menu')) return
      close()
    }
    const onScroll = (): void => close()
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, close])

  if (!menu) return null

  const onCopy = (): void => {
    const text = menu.text
    close()
    void navigator.clipboard.writeText(text).catch(() => {
      document.execCommand('copy')
    })
  }

  const onSelectAll = (): void => {
    const root = menu.root
    close()
    queueMicrotask(() => selectAllIn(root))
  }

  const onSearchGoogle = (): void => {
    const q = menu.text.trim()
    close()
    if (!q) return
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`
    void getPlatform().openExternal(url)
  }

  return (
    <div
      ref={menuRef}
      className="ctx-menu selection-ctx-menu"
      style={{ left: menuPos.x, top: menuPos.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      <button
        type="button"
        className="ctx-menu-item"
        role="menuitem"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCopy}
      >
        <span>{t('menu.copy')}</span>
        <span className="ctx-menu-shortcut">{mod}+C</span>
      </button>
      <div className="ctx-sep" />
      <button
        type="button"
        className="ctx-menu-item"
        role="menuitem"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelectAll}
      >
        <span>{t('menu.selectAll')}</span>
        <span className="ctx-menu-shortcut">{mod}+A</span>
      </button>
      <button
        type="button"
        className="ctx-menu-item"
        role="menuitem"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSearchGoogle}
      >
        <span>{t('menu.searchWithGoogle')}</span>
      </button>
    </div>
  )
}
