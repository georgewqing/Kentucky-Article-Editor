import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlatform } from '@/platform'
import { useAppStore } from '@/state/appStore'

type MenuItem =
  | { type: 'item'; id: string; label: string; shortcut?: string; disabled?: boolean }
  | { type: 'sep' }

type MenuGroup = {
  id: string
  label: string
  items: MenuItem[]
}

export function AppMenuBar() {
  const { t } = useTranslation()
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const canNewWindow = useAppStore((s) => {
    if (s.windowRole === 'float') return Boolean(s.tabs[0])
    return Boolean(s.workspacePath && s.activeTabId)
  })

  const groups: MenuGroup[] = useMemo(
    () => [
      {
        id: 'file',
        label: t('menu.file'),
        items: [
          { type: 'item', id: 'openFolder', label: t('menu.openFolder'), shortcut: 'Ctrl+O' },
          { type: 'item', id: 'save', label: t('menu.save'), shortcut: 'Ctrl+S' },
          { type: 'sep' },
          { type: 'item', id: 'close', label: t('menu.closeWindow') }
        ]
      },
      {
        id: 'edit',
        label: t('menu.edit'),
        items: [
          { type: 'item', id: 'undo', label: t('menu.undo'), shortcut: 'Ctrl+Z' },
          { type: 'item', id: 'redo', label: t('menu.redo'), shortcut: 'Ctrl+Y' },
          { type: 'sep' },
          { type: 'item', id: 'cut', label: t('menu.cut'), shortcut: 'Ctrl+X' },
          { type: 'item', id: 'copy', label: t('menu.copy'), shortcut: 'Ctrl+C' },
          { type: 'item', id: 'paste', label: t('menu.paste'), shortcut: 'Ctrl+V' },
          { type: 'item', id: 'selectAll', label: t('menu.selectAll'), shortcut: 'Ctrl+A' }
        ]
      },
      {
        id: 'view',
        label: t('menu.view'),
        items: [
          { type: 'item', id: 'reload', label: t('menu.reload') },
          { type: 'sep' },
          { type: 'item', id: 'resetZoom', label: t('menu.actualSize') },
          { type: 'item', id: 'zoomIn', label: t('menu.zoomIn') },
          { type: 'item', id: 'zoomOut', label: t('menu.zoomOut') },
          { type: 'sep' },
          { type: 'item', id: 'toggleFullscreen', label: t('menu.toggleFullscreen') }
        ]
      },
      {
        id: 'window',
        label: t('menu.window'),
        items: [
          {
            type: 'item',
            id: 'newWindow',
            label: t('menu.newWindow'),
            disabled: !canNewWindow
          },
          { type: 'item', id: 'newMainWindow', label: t('menu.newMainWindow') },
          { type: 'sep' },
          { type: 'item', id: 'minimize', label: t('menu.minimize') },
          { type: 'item', id: 'close', label: t('menu.closeWindow') }
        ]
      },
      {
        id: 'help',
        label: t('menu.help'),
        items: [{ type: 'item', id: 'learnMore', label: t('menu.learnMore') }]
      }
    ],
    [t, canNewWindow]
  )

  useEffect(() => {
    if (!openId) return
    const onDown = (e: PointerEvent): void => {
      const el = rootRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setOpenId(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  const run = (actionId: string, disabled?: boolean): void => {
    if (disabled) return
    setOpenId(null)
    if (actionId === 'newWindow') {
      void useAppStore.getState().spawnNewWindow()
      return
    }
    if (actionId === 'newMainWindow') {
      void useAppStore.getState().spawnNewMainWindow()
      return
    }
    void getPlatform().runMenuAction(actionId)
  }

  return (
    <div className="app-menu-bar" ref={rootRef} role="menubar">
      {groups.map((group) => {
        const open = openId === group.id
        return (
          <div key={group.id} className={`app-menu-top ${open ? 'open' : ''}`}>
            <button
              type="button"
              className="app-menu-top-btn"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : group.id)}
              onMouseEnter={() => {
                if (openId !== null) setOpenId(group.id)
              }}
            >
              {group.label}
            </button>
            {open ? (
              <div className="app-menu-dropdown" role="menu">
                {group.items.map((item, i) =>
                  item.type === 'sep' ? (
                    <div key={`sep-${i}`} className="app-menu-sep" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      className={`app-menu-item${item.disabled ? ' disabled' : ''}`}
                      role="menuitem"
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      onClick={() => run(item.id, item.disabled)}
                    >
                      <span>{item.label}</span>
                      {item.shortcut ? (
                        <span className="app-menu-shortcut">{item.shortcut}</span>
                      ) : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
