const { Menu, app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const fetch = require('node-fetch');

let djangoServerProcess;
let mainWindow;

function getBackendPath() {
    const isDev = !app.isPackaged;
    if (isDev) {
        return path.join(__dirname, '..', 'backend');
    } else {
        return path.join(process.resourcesPath, 'backend');
    }
}

// env: { ...process.env, PYTHONUNBUFFERED: '1' }

const sleep = ms => new Promise(res => setTimeout(res, ms));
async function startDjangoServer() {
    return new Promise(async (resolve, reject) => {
        const backendPath = getBackendPath();
        const managePy = path.join(backendPath, 'manage.py');
        const venvPy = process.platform === 'win32'
            ? path.join(backendPath, '.venv', 'Scripts', 'python.exe')
            : path.join(backendPath, '.venv', 'bin', 'python');

        if (!fs.existsSync(managePy)) {
            console.error(`manage.py not found at ${managePy}`);
            return reject(new Error(`manage.py not found at ${managePy}`))
        }
        if (!fs.existsSync(venvPy)) {
            console.error(`Python executable not found at ${venvPy}`);
            return reject(new Error(`Python executable not found at ${venvPy}. Ensure backend/.venv is correctly packaged.`));
        }

        const logDir = app.getPath('userData');
        const logPath = path.join(logDir, 'backend.log');
        fs.mkdirSync(logDir, { recursive: true });
        fs.writeFileSync(logPath, `=== Starting backend at ${new Date().toISOString()} ===\n`);
        console.log(`Backend log → ${logPath}`);    

        const isDev = !app.isPackaged;
        const args = isDev
        ? [ managePy, 'runserver', '--noreload', '127.0.0.1:8000' ]
        : [ '-m', 'waitress', '--port=8000', 'mysite.wsgi:application' ];

        const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...(isDev ? {} : { DJANGO_SETTINGS_MODULE: 'mysite.settings_prod' })
        };

        console.log(`Spawning: ${venvPy} with args: ${args.join(' ')} in ${backendPath}`);
        const spawnedProcess = spawn(venvPy, args, {
            cwd: backendPath,
            env: env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        djangoServerProcess = spawnedProcess; 

        try {
            const logStream = fs.createWriteStream(logPath, { flags: 'a' });
            spawnedProcess.stdout.pipe(logStream);
            spawnedProcess.stderr.pipe(logStream);
        } catch (e) {
            console.error('Failed to pipe backend output to log file:', e);
        }

        if (djangoServerProcess) {
            djangoServerProcess.on('exit', (code, signal) => {
                const exitMsg = `CRITICAL: djangoServerProcess exited (post-startup or during) with code ${code}, signal ${signal}. Server is now down.`;
                console.error(exitMsg);
                if (fs.existsSync(logPath)) {
                    try { fs.appendFileSync(logPath, `\n${exitMsg}\n`); } catch (e) { console.error("Failed to write exit msg to backend.log", e); }
                }
                djangoServerProcess = null; 
            });
            djangoServerProcess.on('error', (err) => { 
                const errorMsg = `CRITICAL: djangoServerProcess emitted error (post-startup or during): ${err.message}. Server might be down.`;
                console.error(errorMsg);
                if (fs.existsSync(logPath)) {
                    try { fs.appendFileSync(logPath, `\n${errorMsg}\n`); } catch (e) { console.error("Failed to write error msg to backend.log", e); }
                }
                djangoServerProcess = null; 
            });
        }        

        if (isDev) {
            let buffer = '';
            const timeout = setTimeout(() => {
                console.error('Dev server start timed out. Killing process.');
                spawnedProcess.kill('SIGKILL');
                reject(new Error('Dev server start timed out'));
            }, 60000); // 20 seconds for dev server

            spawnedProcess.stdout.on('data', (chunk) => {
                const output = chunk.toString();
                buffer += output;
                console.log('Dev Django stdout:', output.trim());
                if (buffer.includes('Starting development server')) {
                    clearTimeout(timeout);
                    console.log('Dev server started successfully.');
                    resolve();
                }
            });

            spawnedProcess.stderr.on('data', (chunk) => {
                console.error('Dev Django stderr:', chunk.toString().trim());
            });

            spawnedProcess.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Dev Django spawn error:', err);
                reject(err);
            });

            spawnedProcess.on('close', (code) => {
                clearTimeout(timeout);
                console.log(`Dev Django server exited with code ${code}`);
                // Only reject if it hasn't resolved yet (i.e., "Starting development server" was not seen)
                if (!buffer.includes('Starting development server')) {
                    reject(new Error(`Dev server exited (${code}) before start`));
                }
            });
            return;
        }

        // Production (Waitress) path
        console.log('Starting production server health check loop...');
        const start = Date.now();
        const maxWait = 30000;

        spawnedProcess.on('error', (err) => {
            console.error('Production Django spawn error:', err);
            // The health check loop will eventually timeout and reject
        });

        spawnedProcess.on('close', (code) => {
            console.log(`Production Django server exited with code ${code}.`);
            // The health check loop will eventually timeout and reject if server doesn't become healthy
        });
        
        // Log any stdout/stderr from waitress immediately for debugging
        spawnedProcess.stdout.on('data', (chunk) => {
            console.log('Production Django stdout:', chunk.toString().trim());
        });
        spawnedProcess.stderr.on('data', (chunk) => {
            console.error('Production Django stderr:', chunk.toString().trim());
        });

        while (Date.now() - start < maxWait) {
            await sleep(1000); // Check every second
            if (await checkServerHealth()) {
                console.log('Production server health check successful.');
                return resolve();
            }
            console.log('Production server health check pending...');
        }
        
        console.error('Production server health check timed out. Killing process.');
        spawnedProcess.kill('SIGKILL');
        reject(new Error('Production server start timed out after health checks. Check backend.log.'));
    });
}

function stopDjangoServer() {
    return new Promise((resolve) => {
        if (djangoServerProcess) {
            console.log("Stopping Django server...");
            const pid = djangoServerProcess.pid;

            djangoServerProcess.removeAllListeners('close'); 
            djangoServerProcess.removeAllListeners('error');


            djangoServerProcess.on('close', () => {
                console.log('Django server process closed successfully.');
                djangoServerProcess = null;
                resolve();
            });

                        if (process.platform === "win32") {
                const taskkill = spawn("taskkill", ["/pid", pid, '/f', '/t']);
                taskkill.on('error', (err) => {
                    console.error("Failed to taskkill Django server, attempting SIGKILL:", err);
                    if(djangoServerProcess) djangoServerProcess.kill('SIGKILL'); 
                });
                taskkill.on('exit', () => {
                    console.log("Taskkill command executed for Django server.");
                });
            } else {
                djangoServerProcess.kill('SIGTERM'); 
                setTimeout(() => {
                    if (djangoServerProcess) {
                        console.warn("Django server SIGTERM timeout, sending SIGKILL.");
                        djangoServerProcess.kill('SIGKILL');
                    }
                }, 3000); 
            }
        } else {
            console.log('Django server process not running or already stopped.');
            resolve();
        }
    });
}

const createWindow = async () => {
    // create a new browser window
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#f5f7fa',
        webPreferences: {
            nodeIntegration: true, // allow using node in renderer (not very secure but okay for small apps)
            contextIsolation: false, // allows shared context (again, not super safe but convenient)
        },
        show: false, // don't show it immediately
    });

    try {
        console.log('Attempting to start Django server...');
        await startDjangoServer();
        console.log('Django server is presumed running. Loading window content.');
    } catch (error) {
        console.error('Fatal: Failed to start Django server:', error);
        dialog.showErrorBox("Application Startup Error", `Failed to start the backend server: ${error.message}\nThe application might not function correctly.`);
        // Depending on how critical the backend is, you might app.quit() here
        // For now, we'll let the app load so the user can see the error.
    }

    // load the main HTML file
    mainWindow.loadFile('index.html')

    // only show window when it's ready to avoid flicker
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

ipcMain.handle('fetch-data', async (event, endpoint) => {
    const url = `http://127.0.0.1:8000/${endpoint}`;
    console.log(`Main: Received 'fetch-data' IPC. Endpoint: '${endpoint}', Target URL: ${url}`);

    const isDev = !app.isPackaged;

    if (!isDev && !djangoServerProcess && !(await checkServerHealth())) {
        const errorMsg = 'Backend Server is not running or has been stopped.';
        console.error(`Main: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    try {
         console.log(`Main: Attempting GET to ${url}`);
        const response = await fetch(url, {
            method: 'GET', 
            timeout: 10000
        });

        console.log(`Main: GET response status from ${url}: ${response.status}`); 

        if (!response.ok) {
        const errorText = await response.text();
        console.error(`Main: POST HTTP error! Status: ${response.status}, Body: ${errorText.substring(0, 500)}`); 
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0,200)}`);
        }

        const data = await response.json();
        console.log(`Main: POST to ${url} successful. Response data:`, data); 
        return { success: true, data };
    } catch (err) {
        console.error(`Main: POST to ${url} failed. Error:`, err); 
        return { success: false, error: err.message };
    }
});

ipcMain.handle('post-data', async (event, { endpoint, payload }) => {
    const url = `http://127.0.0.1:8000/${endpoint}`;
    console.log(`Main: Received 'post-data' IPC. Endpoint: '${endpoint}', Payload:`, payload, `Target URL: ${url}`);
    const isDev = !app.isPackaged;
    if ((isDev && !djangoServerProcess) || (!isDev && !(await checkServerHealth()))) {
        const errorMsg = 'Main: Backend Server is not running or not healthy (post-data).';
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
    
    try {
        console.log(`Main: Attempting POST to ${url} with payload:`, JSON.stringify(payload));
        const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 10000
        });

        if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (err) {
        console.error("Main: POST failed", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-data', async (event, endpoint) => {
  const backendBaseUrl = 'http://127.0.0.1:8000/';
  const targetUrl = `${backendBaseUrl}${endpoint}`;

  console.log(`Main Process: Received delete request for endpoint: ${endpoint}`);
  console.log(`Main Process: Sending DELETE request to: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'DELETE',
    });

    if (response.ok) { 
      console.log(`Main Process: Successfully deleted resource at ${targetUrl}. Status: ${response.status}`);
      return { success: true };
    } else {
      let errorText = `Failed to delete. Status: ${response.status}`;
      try {
        const errorData = await response.json(); 
        errorText = errorData.detail || errorData.message || JSON.stringify(errorData);
      } catch (e) {
        const text = await response.text();
        if (text) errorText = text;
      }
      console.error(`Main Process: Failed to delete resource at ${targetUrl}. Error: ${errorText}`);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error(`Main Process: Network or other error during DELETE request to ${targetUrl}:`, error);
    return { success: false, error: error.message || 'Network error or server unreachable' };
  }
});

ipcMain.handle('update-data', async (event, endpoint, payload) => {
  const url = `http://127.0.0.1:8000/${endpoint}`;
  console.log(`Main: Received 'update-data' IPC. PATCH to ${url} with:`, payload);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("Main: Update successful:", data);
    return { success: true, data };
  } catch (error) {
    console.error("Main: Update failed", error);
    return { success: false, error: error.message };
  }
});

// Handle video upload call to Django server

const FormData = require('form-data');

ipcMain.handle('upload-video', async (event, payload) => {
  const url = 'http://127.0.0.1:8000/api/videos/';
  console.log(`Main: Received 'upload-video' IPC. Uploading video: '${payload.title}'`);
  
  try {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('folder', payload.folder);

    if (payload.participantData) {
      console.log("Main: Attaching participant_data:", payload.participantData); 
      formData.append('participant_data', payload.participantData);
    } else {
      console.log("Main: No participant_data found in payload or it's empty.");
    }
    
    const buffer = Buffer.from(payload.fileBuffer);
    formData.append('file', buffer, {
      filename: payload.fileName,
      contentType: payload.fileType
    });
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(), // Add FormData headers
      timeout: 30000 
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error("Main: Video upload failed", err);
    return { success: false, error: err.message };
  }
});


async function checkServerHealth() {
    try {
        const response = await fetch('http://127.0.0.1:8000/', { method: 'HEAD', timeout: 1000 }); // A lightweight check
        console.log(`Health check: Server responded to GET / with status ${response.status}`);
        return true;
    } catch (error) {
        console.log('Health check failed:', error);
        return false;
    }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('will-quit', async (event) => {
    console.log('Application "will-quit" event triggered.');
    event.preventDefault(); 
    try {
        await stopDjangoServer();
        console.log('Django server stopped. Proceeding to quit application.');
    } catch (error) {
        console.error('Error stopping Django server:', error);
    } finally {
        app.exit(); // Now actually quit the application
    }
});

app.on('window-all-closed', () => {
    // On macOS it's common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    // The 'will-quit' event will handle server shutdown.
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ABOUT MENU CODE BELOW

//const { BrowserWindow, ipcMain } = require('electron');
//const path = require('path');

let aboutWindow = null;

function createAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }

    aboutWindow = new BrowserWindow({
        width: 400,
        height: 500,
        title: 'About',
        resizable: false,
        minimizable: false,
        maximizable: false,
        modal: true,
        parent: BrowserWindow.getFocusedWindow(),
        webPreferences: {
            preload: path.join(__dirname, 'about.js'),
        },
    });

    aboutWindow.loadFile('about.html');

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });
}

//module.exports = { createAboutWindow };

//const { Menu } = require('electron');
//const { createAboutWindow } = require('./path/to/your/about-window-module'); // adjust as needed

const isMac = process.platform === 'darwin';

const template = [
    // Mac: App menu
    ...(isMac ? [{
        label: app.name,
        submenu: [
            {
                label: 'About',
                click: createAboutWindow
            },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []),

    // File menu (cross-platform)
    {
        label: 'File',
        submenu: [
            // Windows/Linux: About under File
            ...(!isMac ? [{
                label: 'About',
                click: createAboutWindow
            }] : []),
            { role: isMac ? 'close' : 'quit' }
        ]
    },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
// END ABOUT CODE


// const { app, BrowserWindow, ipcMain, dialog } = require('electron')
// const path = require('path')
// const { spawn } = require('child_process')
// const fetch = require('node-fetch');
// const FormData = require('form-data');
// const os = require('os');
// const { env } = require('process');

// let djangoServerProcess;
// let mainWindow;

// function getBackendPath() {
//     const isDev = !app.isPackaged;
//     if (isDev) {
//         return path.join(__dirname, '..', 'TNO-Backend');
//     } else {
//         return path.join(process.resourcesPath, 'app', 'TNO-Backend');
//     }
// }


// const sleep = ms => new Promise(res => setTimeout(res, ms));
// // ...existing code...

// async function startDjangoServer() {
//     return new Promise(async (resolve, reject) => {
//         const backendPath = getBackendPath();
//         const managePyPath = path.join(backendPath, 'manage.py');
//         const isDev = !app.isPackaged;
//         const fs = require('fs');
//         const logPath = path.join(app.getPath('userData'), 'backend.log');

//         let pythonExecutable = 'python'; // Default to system python
//         const venvPythonPathWin = path.join(backendPath, 'venv', 'Scripts', 'python.exe');
//         const venvPythonPathNonWin = path.join(backendPath, 'venv', 'bin', 'python');

//         if (process.platform === 'win32') {
//             if (require('fs').existsSync(venvPythonPathWin)) {
//                 pythonExecutable = venvPythonPathWin;
//             } else {
//                 console.warn(`Virtual environment Python not found at ${venvPythonPathWin}. Falling back to system 'python'.`);
//             }
//         } else { // For macOS, Linux
//             if (require('fs').existsSync(venvPythonPathNonWin)) {
//                 pythonExecutable = venvPythonPathNonWin;
//             } else {
//                 console.warn(`Virtual environment Python not found at ${venvPythonPathNonWin}. Falling back to system 'python'.`);
//             }
//         }
        
//         console.log(`Backend path: ${backendPath}`);
//         console.log(`Using Python executable: ${pythonExecutable}`);
//         console.log(`Using manage.py: ${managePyPath}`);

//         if (!require('fs').existsSync(managePyPath)) {
//             const errorMsg = `manage.py not found at ${managePyPath}`;
//             console.error(errorMsg);
//             dialog.showErrorBox("Backend Error", `${errorMsg}\nPlease ensure the backend is correctly packaged.`);
//             return reject(new Error(errorMsg));
//         }

//         const processEnv = { ...process.env };

//         djangoServerProcess = spawn(pythonExecutable, [managePyPath, 'runserver', '--noreload', '127.0.0.1:8000'], {
//             cwd: backendPath,
//             env: env,  // Use processEnv instead of undefined env
//             stdio: ['ignore', 'pipe', 'pipe']
//         });

//         try {
//             const logStream = fs.createWriteStream(logPath, { flags: 'a' });
//             djangoServerProcess.stdout.pipe(logStream);
//             djangoServerProcess.stderr.pipe(logStream);
//         } catch (e) {
//             console.error('Failed to pipe backend output to log file:', e);
//         }

//         if (djangoServerProcess) {
//             djangoServerProcess.on('exit', (code, signal) => {
//                 const exitMsg = `CRITICAL: djangoServerProcess exited (post-startup or during) with code ${code}, signal ${signal}. Server is now down.`;
//                 console.error(exitMsg);
//                 if (fs.existsSync(logPath)) {
//                     try { fs.appendFileSync(logPath, `\n${exitMsg}\n`); } catch (e) { console.error("Failed to write exit msg to backend.log", e); }
//                 }
//                 djangoServerProcess = null; 
//             });
//             djangoServerProcess.on('error', (err) => { 
//                 const errorMsg = `CRITICAL: djangoServerProcess emitted error (post-startup or during): ${err.message}. Server might be down.`;
//                 console.error(errorMsg);
//                 if (fs.existsSync(logPath)) {
//                     try { fs.appendFileSync(logPath, `\n${errorMsg}\n`); } catch (e) { console.error("Failed to write error msg to backend.log", e); }
//                 }
//                 djangoServerProcess = null; 
//             });
//         }        

//         if (isDev) {
//             let buffer = '';
//             const timeout = setTimeout(() => {
//                 console.error('Dev server start timed out. Killing process.');
//                 djangoServerProcess.kill('SIGKILL');
//                 reject(new Error('Dev server start timed out'));
//             }, 20000);

//             djangoServerProcess.stdout.on('data', (chunk) => {
//                 const output = chunk.toString();
//                 buffer += output;
//                 console.log('Dev Django stdout:', output.trim());
//                 if (buffer.includes('Starting development server')) {
//                     clearTimeout(timeout);
//                     console.log('Dev server started successfully.');
//                     resolve();
//                 }
//             });

//             djangoServerProcess.stderr.on('data', (chunk) => {
//                 console.error('Dev Django stderr:', chunk.toString().trim());
//             });

//             djangoServerProcess.on('error', (err) => {
//                 clearTimeout(timeout);
//                 console.error('Dev Django spawn error:', err);
//                 reject(err);
//             });

//             djangoServerProcess.on('close', (code) => {
//                 clearTimeout(timeout);
//                 console.log(`Dev Django server exited with code ${code}`);
//                 if (!buffer.includes('Starting development server')) {
//                     reject(new Error(`Dev server exited (${code}) before start`));
//                 }
//             });
//             return;
//         }

//         console.log('Starting production server health check loop...');
//         const start = Date.now();
//         const maxWait = 30000;

//         djangoServerProcess.on('error', (err) => {
//             console.error('Production Django spawn error:', err);
//         });

//         djangoServerProcess.on('close', (code) => {
//             console.log(`Production Django server exited with code ${code}.`);
//         });
        
//         djangoServerProcess.stdout.on('data', (chunk) => {
//             console.log('Production Django stdout:', chunk.toString().trim());
//         });
//         djangoServerProcess.stderr.on('data', (chunk) => {
//             console.error('Production Django stderr:', chunk.toString().trim());
//         });

//         while (Date.now() - start < maxWait) {
//             await sleep(1000);
//             if (await checkServerHealth()) {
//                 console.log('Production server health check successful.');
//                 return resolve();
//             }
//             console.log('Production server health check pending...');
//         }
        
//         console.error('Production server health check timed out. Killing process.');
//         djangoServerProcess.kill('SIGKILL');
//         reject(new Error('Production server start timed out after health checks. Check backend.log.'));
//     });
// }

// // ...existing code...

// function stopDjangoServer() {
//     return new Promise((resolve) => {
//         if (djangoServerProcess) {
//             console.log("Stopping Django server...");
//             const pid = djangoServerProcess.pid;

//             djangoServerProcess.removeAllListeners('close'); 
//             djangoServerProcess.removeAllListeners('error');


//             djangoServerProcess.on('close', () => {
//                 console.log('Django server process closed successfully.');
//                 djangoServerProcess = null;
//                 resolve();
//             });

//                         if (process.platform === "win32") {
//                 const taskkill = spawn("taskkill", ["/pid", pid, '/f', '/t']);
//                 taskkill.on('error', (err) => {
//                     console.error("Failed to taskkill Django server, attempting SIGKILL:", err);
//                     if(djangoServerProcess) djangoServerProcess.kill('SIGKILL'); 
//                 });
//                 taskkill.on('exit', () => {
//                     console.log("Taskkill command executed for Django server.");
//                 });
//             } else {
//                 djangoServerProcess.kill('SIGTERM'); 
//                 setTimeout(() => {
//                     if (djangoServerProcess) {
//                         console.warn("Django server SIGTERM timeout, sending SIGKILL.");
//                         djangoServerProcess.kill('SIGKILL');
//                     }
//                 }, 3000); 
//             }
//         } else {
//             console.log('Django server process not running or already stopped.');
//             resolve();
//         }
//     });
// }

// const createWindow = async () => {
//     mainWindow = new BrowserWindow({
//         width: 1280,
//         height: 720,
//         minWidth: 900,
//         minHeight: 600,
//         backgroundColor: '#f5f7fa',
//         webPreferences: {
//             nodeIntegration: true, 
//             contextIsolation: false, 
//         },
//         show: false, 
//     });

//     try {
//         console.log('Attempting to start Django server...');
//         await startDjangoServer();
//         console.log('Django server is presumed running. Loading window content.');
//     } catch (error) {
//         console.error('Fatal: Failed to start Django server:', error);
//         dialog.showErrorBox("Application Startup Error", `Failed to start the backend server: ${error.message}\nThe application might not function correctly.`);
//     }

//     mainWindow.loadFile('index.html')

//     mainWindow.once('ready-to-show', () => {
//         mainWindow.show()
//     });

//     mainWindow.on('closed', () => {
//         mainWindow = null;
//     });
// };

// ipcMain.handle('fetch-data', async (event, endpoint) => {
//     const url = `http://127.0.0.1:8000/${endpoint}`;
//     console.log('Fetching data from:', url);

//     const isDev = !app.isPackaged;

//     if (!isDev && !djangoServerProcess && !(await checkServerHealth())) {

//         const errorMsg = 'Backend Sserver is not running or has been stopped.';
//         console.error(`Main: ${errorMsg}`);
//         return { success: false, error: errorMsg };
//     }

//     try {
//         const response = await fetch(url, { timeout: 10000});
//         if (!response.ok) {
//             const errorText = await response.text();
//             console.error(`Main: HTTP error! status: ${response.status}, message: ${errorText.substring(0,500)}`);
//             throw new Error(`HTTP error ${response.status}: ${errorText.substring(0, 200)}`);
//         }
//         const data = await response.json();
//         return { success: true, data: data };
//     } catch (error) {
//         console.error(`Main: Error fetching data from: ${url}`, error);
//         return { success: false, error: error.message }; 
//     }
// });

// ipcMain.handle('post-data', async (event, { endpoint, payload }) => {
//   const url = `http://127.0.0.1:8000/${endpoint}`;

//   try {
//     const response = await fetch(url, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify(payload)
//     });

//     if (!response.ok) {
//       const errorText = await response.text();
//       throw new Error(`HTTP ${response.status}: ${errorText}`);
//     }

//     const data = await response.json();
//     return { success: true, data };
//   } catch (err) {
//     console.error("Main: POST failed", err);
//     return { success: false, error: err.message };
//   }
// });

// ipcMain.handle('delete-data', async (event, endpoint) => {
//   const backendBaseUrl = 'http://127.0.0.1:8000/';
//   const targetUrl = `${backendBaseUrl}${endpoint}`;

//   console.log(`Main Process: Received delete request for endpoint: ${endpoint}`);
//   console.log(`Main Process: Sending DELETE request to: ${targetUrl}`);

//   try {
//     const response = await fetch(targetUrl, {
//       method: 'DELETE',
//     });

//     if (response.ok) { 
//       console.log(`Main Process: Successfully deleted resource at ${targetUrl}. Status: ${response.status}`);
//       return { success: true };
//     } else {
//       let errorText = `Failed to delete. Status: ${response.status}`;
//       try {
//         const errorData = await response.json(); 
//         errorText = errorData.detail || errorData.message || JSON.stringify(errorData);
//       } catch (e) {
//         const text = await response.text();
//         if (text) errorText = text;
//       }
//       console.error(`Main Process: Failed to delete resource at ${targetUrl}. Error: ${errorText}`);
//       return { success: false, error: errorText };
//     }
//   } catch (error) {
//     console.error(`Main Process: Network or other error during DELETE request to ${targetUrl}:`, error);
//     return { success: false, error: error.message || 'Network error or server unreachable' };
//   }
// });

// // Handle video upload call to Django server

// ipcMain.handle('upload-video', async (event, payload) => {
//   const url = 'http://127.0.0.1:8000/api/videos/';
//   console.log(`Main: Received 'upload-video' IPC. Uploading video: '${payload.title}'`);
  
//   try {
//     const formData = new FormData();
//     formData.append('title', payload.title);
//     formData.append('folder', payload.folder);
    
//     const buffer = Buffer.from(payload.fileBuffer);
//     formData.append('file', buffer, {
//       filename: payload.fileName,
//       contentType: payload.fileType,
//       knownLength: buffer.length
//     });
    
//     const response = await fetch(url, {
//       method: 'POST',
//       body: formData,
//       timeout: 30000 
//     });
    
//     if (!response.ok) {
//       const errorText = await response.text();
//       throw new Error(`HTTP ${response.status}: ${errorText}`);
//     }
    
//     const data = await response.json();
//     return { success: true, data };
//   } catch (err) {
//     console.error("Main: Video upload failed", err);
//     return { success: false, error: err.message };
//   }
// });

// async function checkServerHealth() {
//     try {
//         const response = await fetch('http://127.0.0.1:8000/', { method: 'HEAD', timeout: 1000 }); // A lightweight check
//         return response.ok;
//     } catch (error) {
//         return false;
//     }
// }

// app.whenReady().then(createWindow);

// app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) {
//         createWindow();
//     }
// });

// app.on('will-quit', async (event) => {
//     console.log('Application "will-quit" event triggered.');
//     event.preventDefault(); 
//     try {
//         await stopDjangoServer();
//         console.log('Django server stopped. Proceeding to quit application.');
//     } catch (error) {
//         console.error('Error stopping Django server:', error);
//     } finally {
//         app.exit(); 
//     }
// });

// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit();
//     }
// });



