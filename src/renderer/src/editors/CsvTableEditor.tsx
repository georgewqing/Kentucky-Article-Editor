import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { parseCsvTable, serializeCsvTable, type CsvTable } from '@shared/csvTable'
import { MonacoTextEditor } from './MonacoTextEditor'

const LARGE_ROWS = 1500

export function CsvTableEditor({ tabId }: { tabId: string }): ReactNode {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const [mode, setMode] = useState<'table' | 'source'>('table')
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const applyingRef = useRef(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  useOverlayScroll(scrollerRef)

  const parsed = useMemo(() => parseCsvTable(tab?.content || ''), [tab?.content])
  const large = (parsed.table?.rows.length || 0) > LARGE_ROWS
  const parseFailed = !parsed.table

  useEffect(() => {
    if (parseFailed || large) setMode('source')
  }, [parseFailed, large, tab?.id])

  if (!tab) return null

  const persist = (table: CsvTable): void => {
    applyingRef.current = true
    updateTabContent(tabId, serializeCsvTable(table))
    queueMicrotask(() => {
      applyingRef.current = false
    })
  }

  const table = parsed.table

  const setHeader = (c: number, value: string): void => {
    if (!table) return
    const headers = table.headers.map((h, i) => (i === c ? value : h))
    persist({ ...table, headers })
  }

  const setCell = (r: number, c: number, value: string): void => {
    if (!table) return
    const rows = table.rows.map((row, i) =>
      i === r ? row.map((cell, j) => (j === c ? value : cell)) : row
    )
    persist({ ...table, rows })
  }

  const addRow = (): void => {
    if (!table) return
    persist({
      ...table,
      rows: [...table.rows, table.headers.map(() => '')]
    })
  }

  const addCol = (): void => {
    if (!table) return
    const name = `col${table.headers.length + 1}`
    persist({
      delimiter: table.delimiter,
      headers: [...table.headers, name],
      rows: table.rows.map((row) => [...row, ''])
    })
  }

  const delRow = (): void => {
    if (!table || sel == null) return
    if (table.rows.length <= 0) return
    persist({ ...table, rows: table.rows.filter((_, i) => i !== sel.r) })
    setSel(null)
  }

  const delCol = (): void => {
    if (!table || sel == null) return
    if (table.headers.length <= 1) return
    persist({
      delimiter: table.delimiter,
      headers: table.headers.filter((_, i) => i !== sel.c),
      rows: table.rows.map((row) => row.filter((_, i) => i !== sel.c))
    })
    setSel(null)
  }

  const tableMode = mode === 'table' && table && !parseFailed

  return (
    <div className="csv-host">
      <div className="dialogue-toolbar csv-toolbar">
        <button
          type="button"
          className={tableMode ? 'is-on' : ''}
          disabled={parseFailed}
          onClick={() => setMode('table')}
        >
          {t('csv.modeTable')}
        </button>
        <button
          type="button"
          className={!tableMode ? 'is-on' : ''}
          onClick={() => setMode('source')}
        >
          {t('csv.modeSource')}
        </button>
        {tableMode ? (
          <>
            <button type="button" onClick={addRow}>
              {t('csv.addRow')}
            </button>
            <button type="button" onClick={addCol}>
              {t('csv.addCol')}
            </button>
            <button type="button" onClick={delRow} disabled={sel == null || table.rows.length === 0}>
              {t('csv.delRow')}
            </button>
            <button type="button" onClick={delCol} disabled={sel == null || table.headers.length <= 1}>
              {t('csv.delCol')}
            </button>
          </>
        ) : null}
        <span className="dialogue-toolbar-hint">
          {parseFailed
            ? t('csv.parseError')
            : large
              ? t('csv.largeHint')
              : t('csv.hint')}
        </span>
      </div>
      {tableMode && table ? (
        <div className="csv-scroll kentucky-overlay-scroll" ref={scrollerRef}>
          <table className="csv-table">
            <thead>
              <tr>
                <th className="csv-gutter" />
                {table.headers.map((h, c) => (
                  <th key={c}>
                    <input
                      value={h}
                      aria-label={t('csv.header', { n: c + 1 })}
                      onFocus={() => setSel({ r: -1, c })}
                      onChange={(e) => setHeader(c, e.target.value)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  <th className="csv-gutter">{r + 1}</th>
                  {table.headers.map((_, c) => (
                    <td
                      key={c}
                      className={sel?.r === r && sel?.c === c ? 'is-sel' : ''}
                    >
                      <input
                        value={row[c] ?? ''}
                        onFocus={() => setSel({ r, c })}
                        onChange={(e) => setCell(r, c, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <MonacoTextEditor tabId={tabId} />
      )}
    </div>
  )
}
