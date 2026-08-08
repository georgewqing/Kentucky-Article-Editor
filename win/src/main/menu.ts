import { Menu, BrowserWindow, app, shell } from 'electron'

export type MenuLocale = 'zh-CN' | 'en'

function labels(locale: MenuLocale) {
  if (locale === 'zh-CN') {
    return {
      file: '文件',
      openFolder: '打开文件夹',
      save: '保存',
      closeWindow: '关闭窗口',
      quit: '退出',
      edit: '编辑',
      undo: '撤销',
      redo: '重做',
      cut: '剪切',
      copy: '复制',
      paste: '粘贴',
      selectAll: '全选',
      view: '查看',
      reload: '重新加载',
      toggleDevtools: '切换开发者工具',
      actualSize: '实际大小',
      zoomIn: '放大',
      zoomOut: '缩小',
      toggleFullscreen: '切换全屏',
      window: '窗口',
      newWindow: '新建窗口',
      newMainWindow: '新建主窗口',
      minimize: '最小化',
      zoom: '缩放',
      help: '帮助',
      learnMore: '了解 KENTUCKY'
    }
  }
  return {
    file: 'File',
    openFolder: 'Open Folder',
    save: 'Save',
    closeWindow: 'Close Window',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    toggleDevtools: 'Toggle Developer Tools',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    toggleFullscreen: 'Toggle Full Screen',
    window: 'Window',
    newWindow: 'New Window',
    newMainWindow: 'New Main Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    help: 'Help',
    learnMore: 'About KENTUCKY'
  }
}

export function buildAppMenu(locale: MenuLocale = 'zh-CN'): Menu {
  const L = labels(locale)
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: L.quit }
            ]
          }
        ]
      : []),
    {
      label: L.file,
      submenu: [
        {
          label: L.openFolder,
          accelerator: 'CmdOrCtrl+O',
          click: (_item, win) => {
            const w = (win ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
            w?.webContents.send('menu:openFolder')
          }
        },
        {
          label: L.save,
          accelerator: 'CmdOrCtrl+S',
          click: (_item, win) => {
            const w = (win ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
            w?.webContents.send('menu:save')
          }
        },
        { type: 'separator' },
        isMac
          ? { role: 'close', label: L.closeWindow }
          : { role: 'quit', label: L.quit }
      ]
    },
    {
      label: L.edit,
      submenu: [
        { role: 'undo', label: L.undo },
        { role: 'redo', label: L.redo },
        { type: 'separator' },
        { role: 'cut', label: L.cut },
        { role: 'copy', label: L.copy },
        { role: 'paste', label: L.paste },
        { role: 'selectAll', label: L.selectAll }
      ]
    },
    {
      label: L.view,
      submenu: [
        { role: 'reload', label: L.reload },
        { type: 'separator' },
        { role: 'resetZoom', label: L.actualSize },
        { role: 'zoomIn', label: L.zoomIn },
        { role: 'zoomOut', label: L.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: L.toggleFullscreen }
      ]
    },
    {
      label: L.window,
      submenu: [
        {
          label: L.newWindow,
          click: (_item, win) => {
            const w = (win ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
            w?.webContents.send('menu:newWindow')
          }
        },
        {
          label: L.newMainWindow,
          click: (_item, win) => {
            const w = (win ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
            w?.webContents.send('menu:newMainWindow')
          }
        },
        { type: 'separator' },
        { role: 'minimize', label: L.minimize },
        ...(isMac
          ? [{ role: 'zoom' as const, label: L.zoom }, { type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const, label: L.closeWindow }])
      ]
    },
    {
      label: L.help,
      submenu: [
        {
          label: L.learnMore,
          click: () => {
            void shell.openExternal('https://github.com/CCFOX12/Kentucky-Article-Editor')
          }
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

export function applyAppMenu(locale: MenuLocale): void {
  Menu.setApplicationMenu(buildAppMenu(locale))
  // Windows/Linux: hide native menubar (sluggish / no hover styling).
  // Keep the Menu for accelerators; renderer shows a custom click menu instead.
  if (process.platform !== 'darwin') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.setAutoHideMenuBar(true)
      win.setMenuBarVisibility(false)
    }
  }
}
