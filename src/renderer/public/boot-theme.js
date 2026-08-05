/* Early splash theme — loaded as classic script (CSP: script-src 'self'). */
;(function () {
  var DEFAULT_ACCENT = '#88c0d0'
  var accent = DEFAULT_ACCENT
  var dark = true
  try {
    var raw = localStorage.getItem('kentucky.settings')
    if (raw) {
      var s = JSON.parse(raw)
      if (typeof s.accent === 'string') {
        var a = s.accent.trim()
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(a)) accent = a
      }
      if (s.themeMode === 'light') dark = false
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
  root.style.setProperty('--boot-bg', dark ? '#141414' : '#f3f3f3')
  root.style.setProperty('--boot-elev', dark ? '#242424' : '#eeeeee')
  root.style.setProperty('--boot-fg', dark ? '#f0f0f0' : '#111111')
  root.style.setProperty('--boot-accent', accent)
  root.style.setProperty(
    '--boot-accent-soft',
    'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 0.15)'
  )
  root.style.setProperty(
    '--boot-bar-track',
    dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'
  )
})()
