import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, ArrowUp, Square, ChevronDown, ChevronRight, ChevronLeft, Infinity, FileText, Folder, Files } from 'lucide-react'
import { BorderBeam } from 'border-beam'
import { useAiStore, type AgentMode, type AiSkillView } from '@/state/aiStore'
import { useAppStore } from '@/state/appStore'
import { useSettingsStore } from '@/state/settingsStore'
import type { FileEntry } from '@/platform'
import { getPlatform } from '@/platform'
import { KENTUCKY_PATH_MIME } from '@/workbench/dnd'
import { useOverlayScroll } from '@/hooks/useOverlayScroll'
import { FileMountChip } from './FileMountChip'

const MODES: AgentMode[] = ['agent', 'plan', 'outline', 'ask']
const SLASH_SKILL_PREVIEW = 4
const AT_RECENT_PREVIEW = 24
const AT_SEARCH_PREVIEW = 40
const AT_TREE_CAP = 400

type SlashKind = 'skill' | 'command'

type SlashItem = {
  kind: SlashKind
  id: string
  label: string
  description: string
}

type AtItem = {
  kind: 'file' | 'folder' | 'browse' | 'up'
  id: string
  name: string
  hint: string
  rel?: string
  isDirectory?: boolean
}

function parseSlashQuery(draft: string): { start: number; query: string } | null {
  const m = draft.match(/(?:^|[\s])(\/[^\s]*)$/)
  if (!m || m.index == null) return null
  const token = m[1]
  const start = draft.length - token.length
  return { start, query: token.slice(1).toLowerCase() }
}

function parseAtQuery(draft: string): { start: number; query: string } | null {
  const m = draft.match(/(?:^|[\s])(@[^\s]*)$/)
  if (!m || m.index == null) return null
  const token = m[1]
  const start = draft.length - token.length
  return { start, query: token.slice(1).toLowerCase() }
}

function toRelPath(workspacePath: string, abs: string, platform: ReturnType<typeof getPlatform>): string {
  const rel = platform.relativeTo(workspacePath, abs) || platform.basename(abs)
  return rel.replace(/\\/g, '/')
}

function pathHint(rel: string): string {
  const parts = rel.replace(/\/+$/, '').split('/')
  if (parts.length <= 1) return ''
  parts.pop()
  const dir = parts.join('/')
  if (dir.length <= 28) return dir
  return `…${dir.slice(-26)}`
}

function collectWorkspaceFiles(
  entries: FileEntry[],
  workspacePath: string,
  platform: ReturnType<typeof getPlatform>,
  acc: Array<{ rel: string; name: string; isDirectory: boolean }> = []
): Array<{ rel: string; name: string; isDirectory: boolean }> {
  for (const e of entries) {
    if (acc.length >= AT_TREE_CAP) return acc
    const relRaw = toRelPath(workspacePath, e.path, platform)
    const rel = e.isDirectory ? relRaw.replace(/\/+$/, '') + '/' : relRaw.replace(/\/+$/, '')
    acc.push({ rel, name: e.name, isDirectory: e.isDirectory })
    if (e.children?.length) collectWorkspaceFiles(e.children, workspacePath, platform, acc)
  }
  return acc
}

function childrenOfRel(entries: FileEntry[], rel: string): FileEntry[] | null {
  if (!rel) return entries
  const parts = rel.replace(/\/+$/, '').split('/').filter(Boolean)
  let list = entries
  let node: FileEntry | undefined
  for (const part of parts) {
    node = list.find((e) => e.name === part)
    if (!node) return null
    list = node.children || []
  }
  if (!node) return entries
  if (!node.children) return null
  return node.children
}

function parentRel(rel: string): string | null {
  const parts = rel.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length === 0) return null
  parts.pop()
  return parts.join('/')
}

function scoreAtFile(name: string, rel: string, q: string): number {
  if (!q) return 1
  const n = name.toLowerCase()
  const r = rel.toLowerCase()
  if (n === q || r === q) return 100
  if (n.startsWith(q) || r.startsWith(q)) return 80
  if (n.includes(q)) return 60
  if (r.includes(q)) return 40
  return 0
}

function findTreeEntry(entries: FileEntry[], targetPath: string): FileEntry | null {
  const norm = targetPath.replace(/\\/g, '/').toLowerCase()
  const walk = (list: FileEntry[]): FileEntry | null => {
    for (const e of list) {
      if (e.path.replace(/\\/g, '/').toLowerCase() === norm) return e
      if (e.children?.length) {
        const hit = walk(e.children)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(entries)
}

function pathHasKentuckyDrag(e: DragEvent): boolean {
  const types = Array.from(e.dataTransfer.types || [])
  return types.includes(KENTUCKY_PATH_MIME) || types.includes('text/plain')
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function popoverOffset(
  shell: HTMLElement,
  trigger: HTMLElement
): { left: number; bottom: number } {
  const s = shell.getBoundingClientRect()
  const b = trigger.getBoundingClientRect()
  return {
    left: b.left - s.left,
    bottom: s.bottom - b.top + 6
  }
}

export function AiComposer() {
  const { t } = useTranslation()
  const draft = useAiStore((s) => s.draft)
  const setDraft = useAiStore((s) => s.setDraft)
  const send = useAiStore((s) => s.send)
  const abort = useAiStore((s) => s.abort)
  const streaming = useAiStore((s) => s.streaming)
  const pendingAsk = useAiStore((s) => s.pendingAsk)
  const busy = streaming || Boolean(pendingAsk)
  const agentMode = useAiStore((s) => s.agentMode)
  const setAgentMode = useAiStore((s) => s.setAgentMode)
  const newChat = useAiStore((s) => s.newChat)
  const profiles = useAiStore((s) => s.profiles)
  const settings = useAiStore((s) => s.settings)
  const setActiveProfile = useAiStore((s) => s.setActiveProfile)
  const attachments = useAiStore((s) => s.composerAttachments)
  const removeAttachment = useAiStore((s) => s.removeComposerAttachment)
  const pickAttachments = useAiStore((s) => s.pickComposerAttachments)
  const addAttachment = useAiStore((s) => s.addComposerAttachment)
  const composerSkillId = useAiStore((s) => s.composerSkillId)
  const setComposerSkillId = useAiStore((s) => s.setComposerSkillId)
  const listSkills = useAiStore((s) => s.listSkills)
  const workspacePath = useAppStore((s) => s.workspacePath)
  const fileTree = useAppStore((s) => s.fileTree)
  const tabs = useAppStore((s) => s.tabs)
  const themeMode = useSettingsStore((s) => s.themeMode)
  const reduceMotion = usePrefersReducedMotion()

  const [modeOpen, setModeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [skills, setSkills] = useState<AiSkillView[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [atOpen, setAtOpen] = useState(false)
  const [atIndex, setAtIndex] = useState(0)
  const [atBrowseRel, setAtBrowseRel] = useState<string | null>(null)
  const [atDirExtra, setAtDirExtra] = useState<FileEntry[] | null>(null)
  const [atDirLoading, setAtDirLoading] = useState(false)
  const atMenuRef = useRef<HTMLDivElement>(null)
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modeBtnRef = useRef<HTMLButtonElement>(null)
  const profileBtnRef = useRef<HTMLButtonElement>(null)
  const dragDepth = useRef(0)
  useOverlayScroll(atMenuRef, 1000, atOpen)
  const [modeMenuPos, setModeMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const [profileMenuPos, setProfileMenuPos] = useState<{ left: number; bottom: number } | null>(
    null
  )

  const activeProfile =
    profiles.find((p) => p.id === settings?.activeProfileId) || profiles[0] || null

  const slashToken = useMemo(() => parseSlashQuery(draft), [draft])
  const atToken = useMemo(() => parseAtQuery(draft), [draft])

  useEffect(() => {
    if (!slashToken || atToken) {
      setSlashOpen(false)
      setSkillsExpanded(false)
      return
    }
    setSlashOpen(true)
    setSlashIndex(0)
    void listSkills().then((list) =>
      setSkills(list.filter((s) => s.enabled && s.id !== 'caveman'))
    )
  }, [slashToken?.query, slashToken?.start, atToken, listSkills])

  useEffect(() => {
    if (!atToken) {
      setAtOpen(false)
      setAtBrowseRel(null)
      setAtDirExtra(null)
      return
    }
    setAtOpen(true)
    setAtIndex(0)
    setSlashOpen(false)
    setModeOpen(false)
    setProfileOpen(false)
  }, [atToken?.query, atToken?.start])

  useEffect(() => {
    if (atBrowseRel == null || !workspacePath) {
      setAtDirExtra(null)
      setAtDirLoading(false)
      return
    }
    const fromTree = childrenOfRel(fileTree, atBrowseRel)
    if (fromTree) {
      setAtDirExtra(null)
      setAtDirLoading(false)
      return
    }
    const platform = getPlatform()
    const abs = atBrowseRel
      ? platform.joinPath(workspacePath, atBrowseRel)
      : workspacePath
    setAtDirLoading(true)
    void platform
      .readDir(abs)
      .then((list) => setAtDirExtra(list))
      .catch(() => setAtDirExtra([]))
      .finally(() => setAtDirLoading(false))
  }, [atBrowseRel, workspacePath, fileTree])

  const slashItems = useMemo(() => {
    if (!slashToken) return [] as SlashItem[]
    const q = slashToken.query
    const skillItems: SlashItem[] = skills
      .filter((s) => !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .map((s) => ({
        kind: 'skill' as const,
        id: s.id,
        label: `/${s.id}`,
        description: s.description || s.name
      }))
    const commands: SlashItem[] = (
      [
        {
          kind: 'command' as const,
          id: 'agent',
          label: '/agent',
          description: t('ai.modeHint.agent')
        },
        {
          kind: 'command' as const,
          id: 'plan',
          label: '/plan',
          description: t('ai.modeHint.plan')
        },
        {
          kind: 'command' as const,
          id: 'outline',
          label: '/outline',
          description: t('ai.modeHint.outline')
        },
        {
          kind: 'command' as const,
          id: 'ask',
          label: '/ask',
          description: t('ai.modeHint.ask')
        },
        {
          kind: 'command' as const,
          id: 'new',
          label: '/new',
          description: t('ai.slashNewChat')
        }
      ] satisfies SlashItem[]
    ).filter((c) => !q || c.id.includes(q) || c.label.toLowerCase().includes(q))

    const skillVisible = skillsExpanded
      ? skillItems
      : skillItems.slice(0, SLASH_SKILL_PREVIEW)
    return [...skillVisible, ...commands]
  }, [slashToken, skills, skillsExpanded, t])

  const skillMatchCount = useMemo(() => {
    if (!slashToken) return 0
    const q = slashToken.query
    return skills.filter(
      (s) => !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).length
  }, [slashToken, skills])

  const atItems = useMemo(() => {
    const browse: AtItem = {
      kind: 'browse',
      id: '__browse__',
      name: t('ai.atBrowse'),
      hint: ''
    }
    if (!atToken || !workspacePath) return atBrowseRel == null ? [browse] : []
    const platform = getPlatform()
    const q = atToken.query

    const toItem = (
      rel: string,
      name: string,
      isDirectory: boolean
    ): AtItem => ({
      kind: isDirectory ? 'folder' : 'file',
      id: rel,
      name: isDirectory ? `${name.replace(/\/+$/, '')}/` : name,
      hint: atBrowseRel == null ? pathHint(rel) : '',
      rel,
      isDirectory
    })

    if (atBrowseRel != null) {
      const fromTree = childrenOfRel(fileTree, atBrowseRel)
      const kids = fromTree ?? (atDirLoading ? [] : atDirExtra) ?? []
      const listed: AtItem[] = kids
        .map((e) => {
          const relRaw = toRelPath(workspacePath, e.path, platform)
          const rel = e.isDirectory ? relRaw.replace(/\/+$/, '') + '/' : relRaw.replace(/\/+$/, '')
          return { rel, name: e.name, isDirectory: e.isDirectory }
        })
        .filter((f) => scoreAtFile(f.name, f.rel, q) > 0)
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map((f) => toItem(f.rel, f.name, f.isDirectory))
      const up: AtItem = {
        kind: 'up',
        id: '__up__',
        name: atBrowseRel ? t('ai.atUp') : t('ai.atBack'),
        hint: '',
        rel: parentRel(atBrowseRel) ?? undefined
      }
      return [up, ...listed]
    }

    const treeFiles = collectWorkspaceFiles(fileTree, workspacePath, platform)
    const tabFiles: Array<{ rel: string; name: string; isDirectory: boolean; fromTab: boolean }> =
      []
    const seen = new Set<string>()
    for (const tab of tabs) {
      if (!tab.path) continue
      const rel = toRelPath(workspacePath, tab.path, platform).replace(/\/+$/, '')
      const key = rel.toLowerCase()
      if (!rel || seen.has(key)) continue
      seen.add(key)
      tabFiles.push({
        rel,
        name: tab.title || platform.basename(rel),
        isDirectory: false,
        fromTab: true
      })
    }
    const rest = treeFiles.filter((f) => {
      const key = f.rel.replace(/\/+$/, '').toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const cap = q ? AT_SEARCH_PREVIEW : AT_RECENT_PREVIEW
    const ranked = [...tabFiles, ...rest]
      .map((f) => ({
        ...f,
        score: scoreAtFile(f.name, f.rel, q) + ('fromTab' in f && f.fromTab && !q ? 10 : 0)
      }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, cap)
    const files: AtItem[] = ranked.map((f) => toItem(f.rel, f.name, f.isDirectory))
    return [...files, browse]
  }, [atToken, workspacePath, fileTree, tabs, t, atBrowseRel, atDirExtra, atDirLoading])

  useEffect(() => {
    if (!atOpen) return
    const el = atMenuRef.current?.querySelector('[aria-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [atIndex, atOpen, atItems])

  useEffect(() => {
    if (!modeOpen && !profileOpen && !slashOpen && !atOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setModeOpen(false)
        setProfileOpen(false)
        setSlashOpen(false)
        setAtOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [modeOpen, profileOpen, slashOpen, atOpen])

  useLayoutEffect(() => {
    const shell = rootRef.current
    const btn = modeBtnRef.current
    if (!modeOpen || !shell || !btn) {
      setModeMenuPos(null)
      return
    }
    setModeMenuPos(popoverOffset(shell, btn))
  }, [modeOpen])

  useLayoutEffect(() => {
    const shell = rootRef.current
    const btn = profileBtnRef.current
    if (!profileOpen || !shell || !btn) {
      setProfileMenuPos(null)
      return
    }
    setProfileMenuPos(popoverOffset(shell, btn))
  }, [profileOpen])

  const applySlashItem = (item: SlashItem): void => {
    if (!slashToken) return
    if (item.kind === 'command') {
      if (item.id === 'new') {
        void newChat()
        setDraft('')
      } else if (MODES.includes(item.id as AgentMode)) {
        setAgentMode(item.id as AgentMode)
        setDraft(draft.slice(0, slashToken.start).trimEnd())
      }
      setSlashOpen(false)
      return
    }
    const before = draft.slice(0, slashToken.start).trimEnd()
    setComposerSkillId(item.id)
    setDraft(before)
    setSlashOpen(false)
    inputRef.current?.focus()
  }

  const applyAtItem = (item: AtItem): void => {
    if (!atToken) return
    if (item.kind === 'browse') {
      setAtBrowseRel('')
      setAtIndex(0)
      atMenuRef.current && (atMenuRef.current.scrollTop = 0)
      return
    }
    if (item.kind === 'up') {
      setAtBrowseRel(typeof item.rel === 'string' ? item.rel : null)
      setAtIndex(0)
      atMenuRef.current && (atMenuRef.current.scrollTop = 0)
      return
    }
    if (item.kind === 'folder' && item.rel) {
      setAtBrowseRel(item.rel.replace(/\/+$/, ''))
      setAtIndex(0)
      atMenuRef.current && (atMenuRef.current.scrollTop = 0)
      return
    }
    const before = draft.slice(0, atToken.start).trimEnd()
    setDraft(before)
    setAtOpen(false)
    setAtBrowseRel(null)
    if (item.rel) addAttachment(item.rel)
    inputRef.current?.focus()
  }

  const openManageProfiles = (): void => {
    setProfileOpen(false)
    void import('@/state/appStore').then(({ useAppStore }) => {
      useAppStore.getState().setActiveView('settings')
    })
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kentucky:open-ai-settings'))
    }, 50)
  }

  const resolveDropRelPath = async (raw: string): Promise<string | null> => {
    const trimmed = raw.trim().replace(/\\/g, '/')
    if (!trimmed || !workspacePath) return null
    const platform = getPlatform()
    const rootNorm = workspacePath.replace(/[/\\]+$/, '').replace(/\\/g, '/')
    const rootLower = rootNorm.toLowerCase()
    const pathLower = trimmed.toLowerCase()
    let rel = trimmed
    if (pathLower === rootLower) return null
    if (pathLower.startsWith(rootLower + '/')) {
      rel = trimmed.slice(rootNorm.length).replace(/^\/+/, '')
    } else if (/^[a-z]:\//i.test(trimmed) || trimmed.startsWith('/')) {
      // Absolute path outside workspace — ignore (composer mounts stay sandboxed).
      return null
    }
    if (!rel) return null
    const absCandidate = platform.joinPath(workspacePath, rel)
    const entry =
      findTreeEntry(fileTree, trimmed) || findTreeEntry(fileTree, absCandidate)
    // Folders keep a trailing slash so chips / agent context can tell them apart.
    if (entry?.isDirectory) {
      return rel.replace(/\/+$/, '') + '/'
    }
    // Tree may not have the node yet — probe the filesystem.
    if (await platform.isDirectory(absCandidate)) {
      return rel.replace(/\/+$/, '') + '/'
    }
    return rel.replace(/\/+$/, '')
  }

  const onDragEnter = (e: DragEvent): void => {
    if (!pathHasKentuckyDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setDropActive(true)
  }

  const onDragOver = (e: DragEvent): void => {
    if (!pathHasKentuckyDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: DragEvent): void => {
    if (!pathHasKentuckyDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropActive(false)
  }

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDropActive(false)
    const raw =
      e.dataTransfer.getData(KENTUCKY_PATH_MIME) || e.dataTransfer.getData('text/plain') || ''
    void resolveDropRelPath(raw).then((rel) => {
      if (rel) addAttachment(rel)
    })
  }

  return (
    <div className="ai-composer-shell" ref={rootRef}>
    <BorderBeam
      size="md"
      colorVariant="colorful"
      theme={themeMode}
      borderRadius={14}
      active={!reduceMotion}
      className="ai-composer-beam"
    >
      <div
        className={`ai-composer${dropActive ? ' is-drop-target' : ''}${busy ? ' is-streaming' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
      <div className="ai-composer-input-wrap">
        {composerSkillId || attachments.length > 0 ? (
          <div className="ai-composer-mounts">
            {composerSkillId ? (
              <span className="ai-skill-chip" title={`/${composerSkillId}`}>
                <span className="ai-skill-chip-label">/{composerSkillId}</span>
                <button
                  type="button"
                  className="ai-skill-chip-x"
                  aria-label={t('ai.removeSkill')}
                  onClick={() => setComposerSkillId(null)}
                >
                  ×
                </button>
              </span>
            ) : null}
            {attachments.map((path) => (
              <FileMountChip
                key={path}
                path={path}
                variant="composer"
                removeLabel={t('ai.removeAttachment')}
                onRemove={() => removeAttachment(path)}
              />
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          className="ai-composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('ai.composerPlaceholder')}
          rows={2}
          onKeyDown={(e) => {
            if (atOpen && atItems.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setAtIndex((i) => (i + 1) % atItems.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setAtIndex((i) => (i - 1 + atItems.length) % atItems.length)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                applyAtItem(atItems[atIndex] || atItems[0])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setAtOpen(false)
                return
              }
              if (e.key === 'Tab') {
                e.preventDefault()
                applyAtItem(atItems[atIndex] || atItems[0])
                return
              }
            }
            if (slashOpen && slashItems.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashIndex((i) => (i + 1) % slashItems.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashIndex((i) => (i - 1 + slashItems.length) % slashItems.length)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                applySlashItem(slashItems[slashIndex] || slashItems[0])
                return
              }
            if (e.key === 'Escape') {
              e.preventDefault()
              setSlashOpen(false)
              return
            }
            if (e.key === 'Tab') {
              e.preventDefault()
              applySlashItem(slashItems[slashIndex] || slashItems[0])
              return
            }
          }
          if (e.key === 'Escape' && busy) {
            e.preventDefault()
            void abort()
            return
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!busy) void send()
          }
          }}
        />
      </div>

      <div className="ai-composer-toolbar">
        <div className="ai-composer-toolbar-left">
          <div className="ai-composer-menu-wrap">
            <button
              ref={modeBtnRef}
              type="button"
              className="ai-composer-pill"
              aria-expanded={modeOpen}
              onClick={() => {
                setModeOpen((v) => !v)
                setProfileOpen(false)
              }}
            >
              <Infinity size={14} aria-hidden />
              <span>{t(`ai.mode.${agentMode}`)}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>

          <div className="ai-composer-menu-wrap">
            <button
              ref={profileBtnRef}
              type="button"
              className="ai-composer-model"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((v) => !v)
                setModeOpen(false)
              }}
            >
              <span>{activeProfile?.label || activeProfile?.model || t('ai.noProfile')}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
          </div>
        </div>

        <div className="ai-composer-toolbar-right">
          <button
            type="button"
            className="ai-composer-icon-btn"
            title={t('ai.attachFiles')}
            aria-label={t('ai.attachFiles')}
            onClick={() => void pickAttachments()}
          >
            <Paperclip size={22} strokeWidth={1.75} aria-hidden />
          </button>
          {busy ? (
            <button
              type="button"
              className="ai-composer-send is-stop"
              title={t('ai.stop')}
              aria-label={t('ai.stop')}
              onClick={() => void abort()}
            >
              <Square size={12} strokeWidth={1.75} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="ai-composer-send"
              title={t('ai.send')}
              aria-label={t('ai.send')}
              disabled={!draft.trim() && !composerSkillId && attachments.length === 0}
              onClick={() => void send()}
            >
              <ArrowUp size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </div>
      </div>
    </BorderBeam>
      {atOpen && atToken ? (
        <div
          ref={atMenuRef}
          className="ai-slash-menu ai-at-menu kentucky-overlay-scroll"
          role="listbox"
          aria-label={t('ai.atMenu')}
        >
          <div className="ai-slash-section-title">
            {atBrowseRel != null
              ? atBrowseRel
                ? atBrowseRel.split('/').filter(Boolean).pop()
                : t('ai.atBrowse')
              : atToken.query
                ? t('ai.atMenu')
                : t('ai.atRecent')}
          </div>
          {atDirLoading ? (
            <div className="ai-slash-empty">{t('ai.loading')}</div>
          ) : null}
          {atItems.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={itemIndex === atIndex}
              className={`ai-at-item${itemIndex === atIndex ? ' active' : ''}`}
              onMouseEnter={() => setAtIndex(itemIndex)}
              onClick={() => applyAtItem(item)}
            >
              <span className="ai-at-item-icon" aria-hidden>
                {item.kind === 'up' ? (
                  <ChevronLeft size={16} strokeWidth={1.75} />
                ) : item.kind === 'browse' || item.kind === 'folder' ? (
                  item.kind === 'browse' ? (
                    <Files size={16} strokeWidth={1.75} />
                  ) : (
                    <Folder size={16} strokeWidth={1.75} />
                  )
                ) : (
                  <FileText size={16} strokeWidth={1.75} />
                )}
              </span>
              <span className="ai-at-item-name">{item.name}</span>
              {item.hint ? <span className="ai-at-item-path">{item.hint}</span> : null}
              {item.kind === 'folder' || item.kind === 'browse' ? (
                <ChevronRight size={14} className="ai-at-item-chevron" aria-hidden />
              ) : null}
            </button>
          ))}
          {!atDirLoading && atItems.filter((it) => it.kind === 'file' || it.kind === 'folder').length === 0 ? (
            <div className="ai-slash-empty">{t('ai.atEmpty')}</div>
          ) : null}
        </div>
      ) : null}
      {slashOpen && slashToken ? (
        <div className="ai-slash-menu" role="listbox" aria-label={t('ai.slashMenu')}>
          {skillMatchCount > 0 ? (
            <div className="ai-slash-section">
              <div className="ai-slash-section-title">{t('ai.slashSkills')}</div>
              {(skillsExpanded
                ? skills.filter(
                    (s) =>
                      !slashToken.query ||
                      s.id.toLowerCase().includes(slashToken.query) ||
                      s.name.toLowerCase().includes(slashToken.query)
                  )
                : skills
                    .filter(
                      (s) =>
                        !slashToken.query ||
                        s.id.toLowerCase().includes(slashToken.query) ||
                        s.name.toLowerCase().includes(slashToken.query)
                    )
                    .slice(0, SLASH_SKILL_PREVIEW)
              ).map((s) => {
                const itemIndex = slashItems.findIndex(
                  (it) => it.kind === 'skill' && it.id === s.id
                )
                return (
                  <button
                    key={`skill-${s.id}`}
                    type="button"
                    role="option"
                    aria-selected={itemIndex === slashIndex}
                    className={`ai-slash-item${itemIndex === slashIndex ? ' active' : ''}`}
                    onMouseEnter={() => setSlashIndex(Math.max(0, itemIndex))}
                    onClick={() =>
                      applySlashItem({
                        kind: 'skill',
                        id: s.id,
                        label: `/${s.id}`,
                        description: s.description || s.name
                      })
                    }
                  >
                    <span className="ai-slash-item-label">/{s.id}</span>
                    <span className="ai-slash-item-desc">
                      {s.description || s.name}
                    </span>
                  </button>
                )
              })}
              {!skillsExpanded && skillMatchCount > SLASH_SKILL_PREVIEW ? (
                <button
                  type="button"
                  className="ai-slash-more"
                  onClick={() => setSkillsExpanded(true)}
                >
                  {t('ai.slashShowMore', { count: skillMatchCount - SLASH_SKILL_PREVIEW })}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="ai-slash-section">
            <div className="ai-slash-section-title">{t('ai.slashCommands')}</div>
            {slashItems
              .filter((it) => it.kind === 'command')
              .map((item) => {
                const itemIndex = slashItems.findIndex(
                  (it) => it.kind === 'command' && it.id === item.id
                )
                return (
                  <button
                    key={`cmd-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={itemIndex === slashIndex}
                    className={`ai-slash-item${itemIndex === slashIndex ? ' active' : ''}`}
                    onMouseEnter={() => setSlashIndex(Math.max(0, itemIndex))}
                    onClick={() => applySlashItem(item)}
                  >
                    <span className="ai-slash-item-label">{item.label}</span>
                    <span className="ai-slash-item-desc">{item.description}</span>
                  </button>
                )
              })}
          </div>

          {slashItems.length === 0 ? (
            <div className="ai-slash-empty">{t('ai.slashEmpty')}</div>
          ) : null}
        </div>
      ) : null}

      {modeOpen && modeMenuPos ? (
        <div
          className="ai-composer-menu"
          role="menu"
          style={{ left: modeMenuPos.left, bottom: modeMenuPos.bottom }}
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitem"
              className={m === agentMode ? 'active' : ''}
              onClick={() => {
                setAgentMode(m)
                setModeOpen(false)
              }}
            >
              <span>{t(`ai.mode.${m}`)}</span>
              <small>{t(`ai.modeHint.${m}`)}</small>
            </button>
          ))}
        </div>
      ) : null}

      {profileOpen && profileMenuPos ? (
        <div
          className="ai-composer-menu ai-composer-menu-wide"
          role="menu"
          style={{ left: profileMenuPos.left, bottom: profileMenuPos.bottom }}
        >
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className={p.id === activeProfile?.id ? 'active' : ''}
              onClick={() => {
                void setActiveProfile(p.id)
                setProfileOpen(false)
              }}
            >
              <span>
                {p.label}
                {!p.hasKey ? ` · ${t('ai.noKey')}` : ''}
              </span>
              <small>{p.model}</small>
            </button>
          ))}
          <button type="button" role="menuitem" className="ai-composer-manage" onClick={openManageProfiles}>
            {t('ai.manageProfiles')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
