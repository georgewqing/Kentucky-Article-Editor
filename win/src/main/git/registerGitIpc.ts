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
  configureGitExecutable,
  findGitRoot
} from './gitService'
import { docReloadFromDisk, docEvict } from '../documentHub'
import { existsSync } from 'fs'
import { saveAiSettings } from '../ai/aiSettings'
import { requireSenderWorkspace } from '../ipcSandbox'
import { resolveWorkspacePath } from '../ai/workspacePath'

function gitErr(e: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: e instanceof Error ? e.message : String(e)
  }
}

export function registerGitIpc(): void {
  ipcMain.handle('git:probe', async () => probeGit())

  ipcMain.handle('git:setPath', async (_e, gitPath: string | null) => {
    const path = (gitPath || '').trim()
    const probe = await configureGitExecutable(path || null)
    if (probe.ok) saveAiSettings({ gitPath: path })
    return probe
  })

  ipcMain.handle('git:findRoot', (e, workspaceRoot: string) => {
    try {
      const ws = requireSenderWorkspace(e, workspaceRoot)
      return findGitRoot(ws)
    } catch {
      return null
    }
  })

  ipcMain.handle('git:init', async (e, workspaceRoot: string) => {
    try {
      return await gitInit(requireSenderWorkspace(e, workspaceRoot))
    } catch (err) {
      return gitErr(err)
    }
  })

  ipcMain.handle('git:ensure', async (e, workspaceRoot: string) => {
    try {
      return await ensureWorkspaceGit(requireSenderWorkspace(e, workspaceRoot))
    } catch (err) {
      return { ok: false, repoRoot: null, created: false, error: gitErr(err).error }
    }
  })

  ipcMain.handle('git:status', async (e, workspaceRoot: string) => {
    try {
      const ws = requireSenderWorkspace(e, workspaceRoot)
      await ensureWorkspaceGit(ws)
      return gitStatus(ws)
    } catch (err) {
      return { repoRoot: null, branch: null, files: [], error: gitErr(err).error }
    }
  })

  ipcMain.handle(
    'git:diff',
    async (e, workspaceRoot: string, path: string, staged?: boolean) => {
      try {
        return await gitDiff(requireSenderWorkspace(e, workspaceRoot), path, Boolean(staged))
      } catch (err) {
        return { ok: false, diff: '', error: gitErr(err).error }
      }
    }
  )

  ipcMain.handle(
    'git:pull',
    async (
      e,
      workspaceRoot: string,
      opts?: { remote?: string; branch?: string; ffOnly?: boolean }
    ) => {
      try {
        return await gitPull(requireSenderWorkspace(e, workspaceRoot), opts)
      } catch (err) {
        return gitErr(err)
      }
    }
  )

  ipcMain.handle(
    'git:push',
    async (
      e,
      workspaceRoot: string,
      opts?: { remote?: string; branch?: string; setUpstream?: boolean }
    ) => {
      try {
        return await gitPush(requireSenderWorkspace(e, workspaceRoot), opts)
      } catch (err) {
        return gitErr(err)
      }
    }
  )

  ipcMain.handle('git:remotes', async (e, workspaceRoot: string) => {
    try {
      return await gitRemoteList(requireSenderWorkspace(e, workspaceRoot))
    } catch (err) {
      return { ok: false, remotes: [] as string[], error: gitErr(err).error }
    }
  })

  ipcMain.handle('git:stage', async (e, workspaceRoot: string, paths: string[]) => {
    try {
      return await gitStage(requireSenderWorkspace(e, workspaceRoot), paths || [])
    } catch (err) {
      return gitErr(err)
    }
  })

  ipcMain.handle('git:unstage', async (e, workspaceRoot: string, paths: string[]) => {
    try {
      return await gitUnstage(requireSenderWorkspace(e, workspaceRoot), paths || [])
    } catch (err) {
      return gitErr(err)
    }
  })

  ipcMain.handle('git:commit', async (e, workspaceRoot: string, message: string) => {
    try {
      return await gitCommit(requireSenderWorkspace(e, workspaceRoot), message || '')
    } catch (err) {
      return gitErr(err)
    }
  })

  ipcMain.handle(
    'git:discard',
    async (
      e,
      workspaceRoot: string,
      absPath: string,
      opts?: { untrackedConfirmed?: boolean }
    ) => {
      try {
        const ws = requireSenderWorkspace(e, workspaceRoot)
        const abs = resolveWorkspacePath(ws, absPath)
        const result = await gitDiscard(ws, abs, opts)
        if (!result.ok) return result
        if (result.deleted || !existsSync(abs)) {
          docEvict(abs)
        } else {
          await docReloadFromDisk(abs)
        }
        return result
      } catch (err) {
        return gitErr(err)
      }
    }
  )
}
