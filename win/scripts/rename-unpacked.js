/**
 * After electron-builder --win dir, rename win-unpacked → KENTUCKY-<version>
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const release = path.join(root, 'release')
const from = path.join(release, 'win-unpacked')
const to = path.join(release, `KENTUCKY-${pkg.version}`)

if (!fs.existsSync(from)) {
  console.error('Expected electron-builder output not found:', from)
  process.exit(1)
}

if (fs.existsSync(to)) {
  fs.rmSync(to, { recursive: true, force: true })
}

fs.renameSync(from, to)
console.log('Renamed to', to)
