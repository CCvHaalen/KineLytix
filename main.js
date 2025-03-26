const { app, BrowserWindow } = require('electron')
const path = require('path')

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 600,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#f5f7fa',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    mainWindow.loadFile('public/index.html')
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    });
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
