const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

const createWindow = () => {
    // create a new browser window
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 600,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#f5f7fa',
        webPreferences: {
            nodeIntegration: true, // allow using node in renderer (not very secure but okay for small apps)
            contextIsolation: false, // allows shared context (again, not super safe but convenient)
        },
        show: false, // don't show it immediately
    });

    // load the main HTML file
    mainWindow.loadFile('index.html')

    // only show window when it's ready to avoid flicker
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    });

    ipcMain.handle('fetch-data', async (event, endpoint) => {
        const url = `http://127.0.0.1:8000/${endpoint}`;
        console.log('Fetching data from:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log(`Sending data back to renderer for ${endpoint}:`, data);
            return { success: true, data: data };
        } catch (error) {
            console.error(`Error fetching data from ${url}`, error);
            return { success: false, error: error.message };
        }
    })
}

// wait until Electron is fully ready
app.whenReady().then(() => {
    createWindow()

    // on macOS, re-create a window when clicking the dock icon if none are open
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})


