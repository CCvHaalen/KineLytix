const { app, BrowserWindow, ipcMain } = require('electron')
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

    mainWindow.loadFile('index.html')
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

    // ipcMain.on('get-data', async (event, arg) => {
    //     console.log('Main process received:', arg);

    //     try {
    //         const simulatedData = { message: 'Data from backend (simulated)', timestamp: Date.now() }
            
    //         console.log('Sending data back to renderer:', simulatedData);
    //         event.reply('data-reply', {success: true, data: simulatedData});
    //     } catch (error) {
    //         console.error('Error fetching data:', error);
    //         event.reply('data-reply', {success: false, error: error.message});
    //     }
    // });
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


