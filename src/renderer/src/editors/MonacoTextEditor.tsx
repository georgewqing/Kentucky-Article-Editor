import Editor from '@monaco-editor/react'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import { getPlatform } from '@/platform'

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

export function MonacoTextEditor({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId))
  const fontSize = useSettingsStore((s) => s.fontSize)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const updateTabContent = useAppStore((s) => s.updateTabContent)

  if (!tab) return null

  return (
    <div className="monaco-host">
      <Editor
        height="100%"
        theme={themeMode === 'light' ? 'vs' : 'vs-dark'}
        language={languageForPath(tab.path)}
        value={tab.content}
        path={tab.path}
        onChange={(value) => updateTabContent(tabId, value ?? '')}
        options={{
          fontSize,
          fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          padding: { top: 8 },
          overviewRulerBorder: false
        }}
      />
    </div>
  )
}
