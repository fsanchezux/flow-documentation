const { app, BrowserWindow, dialog, shell } = require('electron')
const http = require('http')
const path = require('path')

// Set user data path before requiring server (used for skilldocs.config.json location)
process.env.USER_DATA_PATH = app.getPath('userData')

const { app: expressApp, setFolderPicker, setFileOpener, setUrlOpener, PORT } = require('./server')

let mainWindow

// Use Electron's native shell to show file in Explorer
setFileOpener((filePath) => {
  shell.showItemInFolder(filePath)
})

// Use Electron's native shell to open URLs in the system browser
setUrlOpener((url) => {
  shell.openExternal(url)
})

// Use Electron's native dialog for folder selection
setFolderPicker(async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de documentación',
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// Start Express server bound to localhost only
const server = http.createServer(expressApp)
server.listen(PORT, '127.0.0.1')

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: 'Flow-Docs',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false
    }
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  server.close()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
