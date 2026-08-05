import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import i18n, { setStoredLocale, type AppLocale } from '@/i18n'
import { getPlatform } from '@/platform'

export function StatusBar() {
  const { t } = useTranslation()
  const workspacePath = useAppStore((s) => s.workspacePath)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const tabs = useAppStore((s) => s.tabs)
  const closeWorkspace = useAppStore((s) => s.closeWorkspace)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const active = tabs.find((x) => x.id === activeTabId)

  const toggleLang = () => {
    const next: AppLocale = i18n.language === 'zh-CN' ? 'en' : 'zh-CN'
    setStoredLocale(next)
    void i18n.changeLanguage(next)
  }

  const onOpenFolder = async () => {
    const path = await getPlatform().openFolder()
    if (path) await useAppStore.getState().openWorkspace(path)
  }

  const displayPath = active?.path ?? workspacePath ?? t('status.noWorkspace')
  const short =
    workspacePath && displayPath.startsWith(workspacePath)
      ? displayPath.slice(workspacePath.length).replace(/^[/\\]/, '') ||
        getPlatform().basename(workspacePath)
      : displayPath

  return (
    <footer className="status-bar">
      <div className="left">
        <span className="status-path" title={displayPath}>
          {short}
        </span>
        {active?.dirty ? <span>{t('editor.dirty')}</span> : <span>{t('status.ready')}</span>}
      </div>
      <div className="right">
        {workspacePath ? (
          <button type="button" onClick={closeWorkspace} title={t('welcome.closeFolder')}>
            {t('welcome.closeFolder')}
          </button>
        ) : null}
        <button type="button" onClick={() => void onOpenFolder()}>
          {t('welcome.openFolder')}
        </button>
        <button type="button" onClick={() => setActiveView('settings')} title={t('activity.settings')}>
          {t('activity.settings')}
        </button>
        <button type="button" onClick={() => setFontSize(fontSize - 1)} title="A-">
          A−
        </button>
        <span>{fontSize}px</span>
        <button type="button" onClick={() => setFontSize(fontSize + 1)} title="A+">
          A+
        </button>
        <button type="button" onClick={toggleLang} title={t('status.language')}>
          {i18n.language === 'zh-CN' ? '中文' : 'EN'}
        </button>
      </div>
    </footer>
  )
}
