/**
 * Place ffmpeg.exe at resources/ffmpeg/ffmpeg.exe for MP4 export (dev + extraResources).
 * Prefers an already-installed binary; otherwise tries winget (Gyan.FFmpeg.Essentials).
 */
const { existsSync, mkdirSync, copyFileSync, readdirSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const root = join(__dirname, '..')
const destDir = join(root, 'resources', 'ffmpeg')
const dest = join(destDir, 'ffmpeg.exe')

function runnable(bin) {
  if (!bin || !existsSync(bin)) return false
  const r = spawnSync(bin, ['-version'], { windowsHide: true, timeout: 8000, encoding: 'utf8' })
  return r.status === 0
}

function walkFind(dir, name, depth, acc) {
  if (!dir || depth < 0 || !existsSync(dir) || acc.length) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isFile() && e.name.toLowerCase() === name) {
      acc.push(p)
      return
    }
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    walkFind(join(dir, e.name), name, depth - 1, acc)
    if (acc.length) return
  }
}

function candidates() {
  const home = process.env.USERPROFILE || ''
  const local = process.env.LOCALAPPDATA || ''
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || ''
  const list = [
    process.env.KENTUCKY_FFMPEG,
    dest,
    join(pf, 'ffmpeg', 'bin', 'ffmpeg.exe'),
    join(pf, 'ffmpeg', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    join(home, 'scoop', 'apps', 'ffmpeg', 'current', 'bin', 'ffmpeg.exe'),
    join(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe')
  ]
  if (pf86) list.push(join(pf86, 'ffmpeg', 'bin', 'ffmpeg.exe'))
  const wingetPkgs = join(local, 'Microsoft', 'WinGet', 'Packages')
  const found = []
  walkFind(wingetPkgs, 'ffmpeg.exe', 5, found)
  list.push(...found)
  const where = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true })
  if (where.status === 0 && where.stdout) {
    for (const line of where.stdout.split(/\r?\n/)) {
      const p = line.trim()
      if (p) list.push(p)
    }
  }
  return list.filter(Boolean)
}

function findInstalled() {
  for (const p of candidates()) {
    if (runnable(p)) return p
  }
  return null
}

function copyToDest(src) {
  if (src.replace(/\\/g, '/').toLowerCase() === dest.replace(/\\/g, '/').toLowerCase()) return dest
  mkdirSync(destDir, { recursive: true })
  copyFileSync(src, dest)
  if (!runnable(dest)) {
    console.error('Copied ffmpeg but it is not runnable:', dest)
    process.exit(1)
  }
  return dest
}

let hit = findInstalled()
if (hit) {
  const out = copyToDest(hit)
  console.log('ffmpeg ready:', out)
  process.exit(0)
}

if (process.platform === 'win32') {
  console.log('ffmpeg not found; installing Gyan.FFmpeg.Essentials via winget…')
  const wg = spawnSync(
    'winget',
    [
      'install',
      '-e',
      '--id',
      'Gyan.FFmpeg.Essentials',
      '--accept-package-agreements',
      '--accept-source-agreements'
    ],
    { stdio: 'inherit', windowsHide: true, timeout: 300_000 }
  )
  if (wg.status !== 0) {
    console.error(
      'winget install failed. Install ffmpeg, add it to PATH, or set KENTUCKY_FFMPEG to ffmpeg.exe, then re-run npm run ensure-ffmpeg.'
    )
    process.exit(1)
  }
  hit = findInstalled()
  if (hit) {
    const out = copyToDest(hit)
    console.log('ffmpeg ready:', out)
    process.exit(0)
  }
}

console.error(
  'ffmpeg still not found. Install ffmpeg, add it to PATH, or set KENTUCKY_FFMPEG, then re-run npm run ensure-ffmpeg.'
)
process.exit(1)
