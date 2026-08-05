import type { editor } from 'monaco-editor'
import type * as MonacoNS from 'monaco-editor'

export const SOFT_MONACO_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  folding: false,
  glyphMargin: false,
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 10,
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  guides: {
    indentation: false,
    highlightActiveIndentation: false,
    bracketPairs: false
  },
  renderWhitespace: 'none',
  padding: { top: 16, bottom: 24 },
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10
  },
  fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  contextmenu: true
}

export function defineKentuckyMonacoThemes(monaco: typeof MonacoNS): void {
  monaco.editor.defineTheme('kentucky-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editorLineNumber.foreground': '#ffffff28',
      'editorLineNumber.activeForeground': '#ffffff55',
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#00000000',
      'editorIndentGuide.activeBackground1': '#00000000',
      'editorGutter.background': '#1e1e1e'
    }
  })

  monaco.editor.defineTheme('kentucky-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorLineNumber.foreground': '#00000028',
      'editorLineNumber.activeForeground': '#00000055',
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background1': '#00000000',
      'editorIndentGuide.activeBackground1': '#00000000',
      'editorGutter.background': '#ffffff'
    }
  })
}
