import { ipcMain } from 'electron'
import {
  probeGit,
  gitInit,
  ensureWorkspaceGit,
  gitStatus,
  gitDiff,
  gitStage,
  gitUnstage,
  gitCommit,
  gitDiscard,
  gitPull,
  gitPush,
  gitRemoteList,
  setGitExecutable,
  findGitRoot
} from './gitService'
import { docReloadFromDisk, docEvict } from '../documentHub'
import { existsSync } from 'fs'
import { loadAiSettings, saveAiSettings } from '../ai/aiSettings'

export function registerGitIpc(): void {
  try {
    setGitExecutable(loadAiSettings().gitPath)
  } catch {
    /* ignore */
  }

  ipcMain.handle('git:probe', async () => probeGit())

  ipcMain.handle('git:setPath', async (_e, gitPath: string | null) => {
    const path = (gitPath || '').trim()
    setGitExecutable(path || null)
    saveAiSettings({ gitPath: path })
    return probeGit()
  })

  ipcMain.handle('git:findRoot', (_e, workspaceRoot: string) => findGitRoot(workspaceRoot))

  ipcMain.handle('git:init', async (_e, workspaceRoot: string) => gitInit(workspaceRoot))

  ipcMain.handle('git:ensure', async (_e, workspaceRoot: string) => ensureWorkspaceGit(workspaceRoot))

  ipcMain.handle('git:status', async (_e, workspaceRoot: string) => {
    await ensureWorkspaceGit(workspaceRoot)
    return gitStatus(workspaceRoot)
  })

  ipcMain.handle(
    'git:diff',
    async (_e, workspaceRoot: string, path: string, staged?: boolean) =>
      gitDiff(workspaceRoot, path, Boolean(staged))
  )

  ipcMain.handle(
    'git:pull',
    async (
      _e,
      workspaceRoot: string,
      opts?: { remote?: string; branch?: string; ffOnly?: boolean }
    ) => gitPull(workspaceRoot, opts)
  )

  ipcMain.handle(
    'git:push',
    async (
      _e,
      workspaceRoot: string,
      opts?: { remote?: string; branch?: string; setUpstream?: boolean }
    ) => gitPush(workspaceRoot, opts)
  )

  ipcMain.handle('git:remotes', async (_e, workspaceRoot: string) => gitRemoteList(workspaceRoot))

  ipcMain.handle('git:stage', async (_e, workspaceRoot: string, paths: string[]) =>
    gitStage(workspaceRoot, paths || [])
  )

  ipcMain.handle('git:unstage', async (_e, workspaceRoot: string, paths: string[]) =>
    gitUnstage(workspaceRoot, paths || [])
  )

  ipcMain.handle('git:commit', async (_e, workspaceRoot: string, message: string) =>
    gitCommit(workspaceRoot, message || '')
  )

  ipcMain.handle(
    'git:discard',
    async (
      _e,
      workspaceRoot: string,
      absPath: string,
      opts?: { untrackedConfirmed?: boolean }
    ) => {
      const result = await gitDiscard(workspaceRoot, absPath, opts)
      if (!result.ok) return result
      if (result.deleted || !existsSync(absPath)) {
        docEvict(absPath)
      } else {
        await docReloadFromDisk(absPath)
      }
      return result
    }
  )
}
