import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { getPlatform } from '@/platform'
import { SOFT_MONACO_OPTIONS, defineKentuckyMonacoThemes } from './softMonaco'
import { bindMonacoLinePick, flashMonacoLine } from './monacoLineNav'
import { syncMonacoAgentSpans } from './agentEditHighlight'
import { agentEditPathKey } from '@shared/agentEditSpans'

function languageForPath(path: string): string {
  const ext = getPlatform().extname(path)
  switch (ext) {
    case '.md':
      return 'markdown'
    case '.json':
    case '.kmind':
      return 'json'
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.js':
    case '.jsx':
      return 'javascript'
    case '.css':
      return 'css'
    case '.html':
      return 'html'
    default:
      return 'plaintext'
  }
}

function pathsEqual(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

export function MonacoTextEditor({ tabId }: { tabId: string }) {
  const { t } = useTranslation()
  const tab = useAppStore((s) => s.tabs.find((x) => x.id === tabId))
  const fontSize = useSettingsStore((s) => s.fontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const updateTabContent = useAppStore((s) => s.updateTabContent)
  const showToast = useAppStore((s) => s.showToast)
  const lineFlash = useAppStore((s) => s.lineFlash)
  const clearLineFlash = useAppStore((s) => s.clearLineFlash)
  const agentChangeRanges = useAppStore((s) => s.agentChangeRanges)
  const linePickSession = useAppStore((s) => s.linePickSession)
  const confirmLinePick = useAppStore((s) => s.confirmLinePick)
  const cancelLinePick = useAppStore((s) => s.cancelLinePick)
  const picking = Boolean(tab && linePickSession?.targetPath === tab.path)
  const flashForTab =
    tab && lineFlash && pathsEqual(lineFlash.path, tab.path) ? lineFlash : null

  const monacoRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const clearFlashRef = useRef<(() => void) | null>(null)
  const appliedNonce = useRef<number | null>(null)
  const [monacoTick, setMonacoTick] = useState(0)

  useEffect(() => {
    if (!tab || !flashForTab) return
    if (appliedNonce.current === flashForTab.nonce) return
    let cancelled = false
    let attempt = 0
    const tryFlash = (): void => {
      if (cancelled) return
      const ed = monacoRef.current
      if (!ed) {
        if (attempt < 20) {
          attempt += 1
          window.setTimeout(tryFlash, 50)
        }
        return
      }
      const model = ed.getModel()
      if (!model || flashForTab.line > model.getLineCount()) {
        showToast(t('mindmap.lineNotFound'), 'info')
        clearLineFlash()
        return
      }
      clearFlashRef.current?.()
      clearFlashRef.current = flashMonacoLine(ed, flashForTab.line, {
        hideLineNumbers: true
      })
      appliedNonce.current = flashForTab.nonce
    }
    const id = window.setTimeout(tryFlash, 60)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [tab, flashForTab, showToast, t, clearLineFlash, monacoTick])

  useEffect(() => {
    if (!tab) return
    const spans = agentChangeRanges[agentEditPathKey(tab.path)] || []
    return syncMonacoAgentSpans(monacoRef.current, spans)
  }, [tab, agentChangeRanges, monacoTick])

  useEffect(() => {
    const ed = monacoRef.current
    if (!ed) return
    ed.updateOptions({
      readOnly: picking,
      domReadOnly: picking,
      contextmenu: !picking,
      cursorStyle: picking ? 'underline' : 'line'
    })
  }, [picking, monacoTick])

  useEffect(() => {
    const ed = monacoRef.current
    if (!ed || !picking) return
    return bindMonacoLinePick(ed, (line) => confirmLinePick(line))
  }, [picking, confirmLinePick, monacoTick])

  useEffect(() => {
    return () => {
      clearFlashRef.current?.()
      clearFlashRef.current = null
    }
  }, [])

  if (!tab) return null

  return (
    <div className={`monaco-host ${picking ? 'line-pick-active' : ''}`}>
      {picking ? (
        <div className="line-pick-banner">
          <span>{t('mindmap.pickLineHint')}</span>
          <button type="button" onClick={() => cancelLinePick()}>
            {t('explorer.cancel')}
          </button>
        </div>
      ) : null}
      <div className="monaco-host-body">
        <Editor
          height="100%"
          theme={themeMode === 'light' ? 'kentucky-light' : 'kentucky-dark'}
          language={languageForPath(tab.path)}
          value={tab.content}
          path={tab.path}
          onChange={(value) => {
            if (picking) return
            updateTabContent(tabId, value ?? '')
          }}
          beforeMount={defineKentuckyMonacoThemes}
          onMount={(ed) => {
            monacoRef.current = ed
            ed.updateOptions({
              readOnly: picking,
              domReadOnly: picking,
              contextmenu: !picking,
              cursorStyle: picking ? 'underline' : 'line'
            })
            setMonacoTick((n) => n + 1)
          }}
          options={{
            ...SOFT_MONACO_OPTIONS,
            fontSize,
            readOnly: picking,
            domReadOnly: picking,
            contextmenu: !picking,
            cursorStyle: picking ? 'underline' : 'line'
          }}
        />
      </div>
    </div>
  )
}
