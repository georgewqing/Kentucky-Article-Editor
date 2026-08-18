/* Early splash theme — loaded as classic script (CSP: script-src 'self').
 * Order: URL query (main→splash window) > localStorage (in-app boot-splash) > defaults.
 */
;(function () {
  var DEFAULT_ACCENT = '#88c0d0'
  var accent = DEFAULT_ACCENT
  var dark = true
  var modeFromQuery = false
  var accentFromQuery = false

  try {
    var params = new URLSearchParams(window.location.search || '')
    var qa = params.get('accent')
    if (qa) {
      qa = qa.trim()
      if (qa.charAt(0) !== '#') qa = '#' + qa
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(qa)) {
        accent = qa
        accentFromQuery = true
      }
    }
    var qm = params.get('mode')
    if (qm === 'light') {
      dark = false
      modeFromQuery = true
    } else if (qm === 'dark') {
      dark = true
      modeFromQuery = true
    }
  } catch (e) {}

  try {
    var raw = localStorage.getItem('kentucky.settings')
    if (raw) {
      var s = JSON.parse(raw)
      if (!accentFromQuery && typeof s.accent === 'string') {
        var a = s.accent.trim()
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(a)) accent = a
      }
      if (!modeFromQuery && s.themeMode === 'light') dark = false
    }
  } catch (e) {}

  function expandHex(hex) {
    var h = hex.replace('#', '')
    if (h.length === 3) {
      h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2)
    }
    return h
  }

  function hexToRgb(hex) {
    var n = parseInt(expandHex(hex), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  var rgb = hexToRgb(accent)
  var root = document.documentElement
  root.dataset.bootTheme = dark ? 'dark' : 'light'
  root.style.setProperty('--boot-bg', dark ? '#0A0A0A' : '#f3f3f3')
  root.style.setProperty('--boot-elev', dark ? '#1C1C1C' : '#eeeeee')
  root.style.setProperty('--boot-fg', dark ? '#f0f0f0' : '#111111')
  root.style.setProperty('--boot-accent', accent)
  root.style.setProperty(
    '--boot-accent-soft',
    'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 0.22)'
  )
  root.style.setProperty(
    '--boot-bar-track',
    dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
  )
})()
