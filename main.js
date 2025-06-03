const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fetch = require('node-fetch');
const FormData = require('form-data');
const os = require('os');

let djangoServerProcess;
let mainWindow;

function getBackendPath() {
    const isDev = !app.isPackaged;
    if (isDev) {
        return path.join(__dirname, '..', 'TNO-Backend');
    } else {
        return path.join(process.resourcesPath, 'app', 'TNO-Backend');
    }
}


const sleep = ms => new Promise(res => setTimeout(res, ms));
async function startDjangoServer() {
    return new Promise(async (resolve, reject) => {
        const backendPath = getBackendPath();
        const managePyPath = path.join(backendPath, 'manage.py');

        let pythonExecutable = 'python'; // Default to system python
        const venvPythonPathWin = path.join(backendPath, 'venv', 'Scripts', 'python.exe');
        const venvPythonPathNonWin = path.join(backendPath, 'venv', 'bin', 'python');

        if (process.platform === 'win32') {
            if (require('fs').existsSync(venvPythonPathWin)) {
                pythonExecutable = venvPythonPathWin;
            } else {
                console.warn(`Virtual environment Python not found at ${venvPythonPathWin}. Falling back to system 'python'.`);
            }
        } else { // For macOS, Linux
            if (require('fs').existsSync(venvPythonPathNonWin)) {
                pythonExecutable = venvPythonPathNonWin;
            } else {
                console.warn(`Virtual environment Python not found at ${venvPythonPathNonWin}. Falling back to system 'python'.`);
            }
        }
        
        console.log(`Backend path: ${backendPath}`);
        console.log(`Using Python executable: ${pythonExecutable}`);
        console.log(`Using manage.py: ${managePyPath}`);

        if (!require('fs').existsSync(managePyPath)) {
            const errorMsg = `manage.py not found at ${managePyPath}`;
            console.error(errorMsg);
            dialog.showErrorBox("Backend Error", `${errorMsg}\nPlease ensure the backend is correctly packaged.`);
            return reject(new Error(errorMsg));
        }

        djangoServerProcess = spawn(pythonExecutable, [managePyPath, 'runserver', '--noreload', '127.0.0.1:8000'], {
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
            }, 20000);

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
                if (!buffer.includes('Starting development server')) {
                    reject(new Error(`Dev server exited (${code}) before start`));
                }
            });
            return;
        }

        console.log('Starting production server health check loop...');
        const start = Date.now();
        const maxWait = 30000;

        spawnedProcess.on('error', (err) => {
            console.error('Production Django spawn error:', err);
        });

        spawnedProcess.on('close', (code) => {
            console.log(`Production Django server exited with code ${code}.`);
        });
        
        spawnedProcess.stdout.on('data', (chunk) => {
            console.log('Production Django stdout:', chunk.toString().trim());
        });
        spawnedProcess.stderr.on('data', (chunk) => {
            console.error('Production Django stderr:', chunk.toString().trim());
        });

        while (Date.now() - start < maxWait) {
            await sleep(1000);
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
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#f5f7fa',
        webPreferences: {
            nodeIntegration: true, 
            contextIsolation: false, 
        },
        show: false, 
    });

    try {
        console.log('Attempting to start Django server...');
        await startDjangoServer();
        console.log('Django server is presumed running. Loading window content.');
    } catch (error) {
        console.error('Fatal: Failed to start Django server:', error);
        dialog.showErrorBox("Application Startup Error", `Failed to start the backend server: ${error.message}\nThe application might not function correctly.`);
    }

    mainWindow.loadFile('index.html')

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

ipcMain.handle('fetch-data', async (event, endpoint) => {
    const url = `http://127.0.0.1:8000/${endpoint}`;
    console.log('Fetching data from:', url);

    const isDev = !app.isPackaged;

    if (!isDev && !djangoServerProcess && !(await checkServerHealth())) {

        const errorMsg = 'Backend Sserver is not running or has been stopped.';
        console.error(`Main: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    try {
        const response = await fetch(url, { timeout: 10000});
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Main: HTTP error! status: ${response.status}, message: ${errorText.substring(0,500)}`);
            throw new Error(`HTTP error ${response.status}: ${errorText.substring(0, 200)}`);
        }
        const data = await response.json();
        return { success: true, data: data };
    } catch (error) {
        console.error(`Main: Error fetching data from: ${url}`, error);
        return { success: false, error: error.message }; 
    }
});

ipcMain.handle('post-data', async (event, { endpoint, payload }) => {
  const url = `http://127.0.0.1:8000/${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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

// Handle video upload call to Django server

ipcMain.handle('upload-video', async (event, payload) => {
  const url = 'http://127.0.0.1:8000/api/videos/';
  console.log(`Main: Received 'upload-video' IPC. Uploading video: '${payload.title}'`);
  
  try {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('folder', payload.folder);
    
    const buffer = Buffer.from(payload.fileBuffer);
    formData.append('file', buffer, {
      filename: payload.fileName,
      contentType: payload.fileType,
      knownLength: buffer.length
    });
    
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
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
        return response.ok;
    } catch (error) {
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
        app.exit(); 
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});



