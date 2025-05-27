const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fetch = require('node-fetch');

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
function startDjangoServer() {
    return new Promise((resolve, reject) => {
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
            stdio: ['ignore', 'pipe', 'pipe'], 
            env: { ...process.env, PYTHONUNBUFFERED: '1' } // Option to try if buffering is suspected
        });

        let serverStarted = false;
        const serverStartTimeout = 45000; 

        const timeoutId = setTimeout(() => {
            if (!serverStarted) {
                console.error("Django server startup timed out. Killing process.");
                if (djangoServerProcess && !djangoServerProcess.killed) {
                    djangoServerProcess.kill('SIGKILL'); 
                }
                reject(new Error("Django server failed to start within the timeout period. Check console for Django's output."));
            }
        }, serverStartTimeout);

        let stdoutBuffer = '';
        djangoServerProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutBuffer += output;
            console.log(`Django stdout chunk: ${output}`); // CRITICAL LOGGING
            if (stdoutBuffer.includes('Starting development server at http://127.0.0.1:8000/') || 
                stdoutBuffer.includes('Quit the server with CTRL-BREAK') || 
                stdoutBuffer.includes('Quit the server with CONTROL-C')) {
                if (!serverStarted) {
                    serverStarted = true;
                    clearTimeout(timeoutId);
                    console.log("Django server detected as started successfully.");
                    resolve();
                }
            }
        });

        let stderrBuffer = '';
        djangoServerProcess.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            stderrBuffer += errorOutput;
            console.error(`Django stderr chunk: ${errorOutput}`); // CRITICAL LOGGING
        });

        djangoServerProcess.on('close', (code, signal) => {
            console.log(`Django server process exited with code ${code} and signal ${signal}`);
            if (!serverStarted) { 
                clearTimeout(timeoutId);
                reject(new Error(`Django server failed to start. Exited with code ${code}, signal ${signal}. Full stderr: ${stderrBuffer.substring(0, 1000)}`));
            }
            djangoServerProcess = null;
        });

        djangoServerProcess.on('error', (err) => {
            clearTimeout(timeoutId);
            console.error('Failed to spawn Django server process:', err);
            reject(err);
        });
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



