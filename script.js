const { ipcRenderer } = require('electron');
const path = require('path');

const elements = {
  sidebar: document.getElementById('sidebar'),
  dropArea: document.getElementById('dropArea'),
  videoFileInput: document.getElementById('videoFile'),
  videoList: document.getElementById('videoList'),
  video: document.getElementById('video'),
  canvas: document.getElementById('overlay'),
  videoContainer: document.getElementById('video-container'),
  activateBtn: document.getElementById('activateAnnotation'),
  clearBtn: document.getElementById('clearAnnotation'),
  createCheckpointBtn: document.getElementById('createCheckpoint'),
  checkpointList: document.getElementById('checkpointList'),
  result: document.getElementById('result'),
  speedSelect: document.getElementById('speedSelect'),
  speedValue: document.getElementById('speedValue'),
  newProjectModal: document.getElementById('newProjectModal'),
  newProjectInput: document.getElementById('newProjectInput'),
  confirmModalBtn: document.getElementById('confirmModalBtn'),
  cancelModalBtn: document.getElementById('cancelModalBtn'),
  loginModal: document.getElementById('loginModal'),
  modalContent: document.getElementById('modalContent'), 
  openLoginBtn: document.getElementById('openLogin'),
  saveToDbModal: document.getElementById('saveToDbModal'),
  dbFolderSelect: document.getElementById('dbFolderSelect'),
  dbVideoTitleInput: document.getElementById('dbVideoTitleInput'),
  confirmSaveToDbBtn: document.getElementById('confirmSaveToDbBtn'),
  cancelSaveToDbBtn: document.getElementById('cancelSaveToDbBtn'),
};

if (typeof FileManager !== 'undefined' && elements.folderList && elements.fileManagerView) {
  try {
    FileManager.init(ipcRenderer, {
      folderList: elements.folderList,
      fileManagerView: elements.fileManagerView,
    });
  } catch (e) {
    console.error("Error initializing FileManager:", e);
  }
} else {
  console.warn("FileManager or its required DOM elements (folderList, fileManagerView) not found/initialized. File management may be affected.");
}

let ctx;
if (elements.canvas) {
  try {
    ctx = elements.canvas.getContext('2d');
  } catch (e) {
    console.error("Error getting canvas context:", e);
    if(elements.canvas) elements.canvas.style.border = "2px solid red";
  }
} else {
  console.error("Canvas element ('overlay') not found! Annotations will not work.");
}

const state = {
  annotationActive: false,
  points: [],
  videoFiles: [],
  checkpoints: [],
  currentVideoIndex: -1,
  angles: [],
  selectedAngle: null,
  hoveredAngle: null,
  showInnerAngle: true,
  currentDbVideoTitle: null,
};

const data = [];

const btnDownloadCsv = document.getElementById('btnDownloadCsv');

btnDownloadCsv.addEventListener("click",()=>{
  downloadCsv("results.csv", json2csv.parse(data));
});

/**
 * Creates a hidden download link for CSV data and programmatically clicks it to trigger a file download of the data
 * Data must already by in CSV format
 * @param {string} filename the name for the CSV file to be downloaded
 * @param {string} csvData the string containing the CSV formatted data
 */
function downloadCsv(filename, csvData) {
  const element= document.createElement("a");

  element.setAttribute("href",`data:text/csv;charset=utf-8,${encodeURIComponent(csvData)}`);
  element.setAttribute("download", filename);
  element.style.display = "none";

  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * Initialization function
 * Sets up event listeners, drag-and-drop functionality, a frame-adding tile, and a speed control slider that adjusts
 * the video playback rate and displays the current speed.
 */
function init() {
  setupEventListeners();
  setupDragAndDrop();
  createAddFrameTile();
  setupSidebarToggle();
  setupNewProjectModal();
  setupLoginModal();
  setupSaveToDbModal();
  testFetchData();
  elements.speedSelect = document.getElementById('speedSelect');
  elements.speedValue  = document.getElementById('speedValue');

  elements.video.playbackRate = parseFloat(elements.speedSelect.value);

  elements.speedSelect.addEventListener('change', () => {
    const speed = parseFloat(elements.speedSelect.value);
    elements.video.playbackRate = speed;
    elements.speedValue.textContent = speed.toFixed(2) + 'x';
  });
  
//   elements.speedSlider.addEventListener('input', () => {
//   const speed = parseFloat(elements.speedSlider.value);
//   elements.video.playbackRate = speed;
//   elements.speedValue.textContent = speed.toFixed(2) + 'x';
// });

  elements.toggleBtn.style.display = 'inline-block';
  elements.toggleBtn.addEventListener('click', () => {
    state.showInnerAngle = !state.showInnerAngle;
    elements.toggleBtn.textContent = state.showInnerAngle ? 'Show Outer Angle' : 'Show Inner Angle';
    if (state.points.length === 3) {
    renderAngleDisplay();
    return;
    }

    const now = elements.video.currentTime;
    const saved = state.angles.find(a => Math.abs(a.time - now) < 0.2);
    if (saved) {
      const { inner, outer } = calculateAngle(...saved.points);
      const displayed = state.showInnerAngle ? inner : outer;
      const label = state.showInnerAngle ? 'Inner' : 'Outer';
      elements.result.textContent = `${label} angle: ${displayed.toFixed(1)}° at ${saved.time.toFixed(2)}s`;
    }
  });
}

function setupNewProjectModal() {
  if (!elements.newProjectModal) {
    console.error("New Project Modal element not found!");
    return;
  }

  elements.addProjectBox.addEventListener('click', () => {
    elements.newProjectModal.style.display = 'flex';
    elements.newProjectInput.value = '';
    elements.newProjectInput.focus();
  });

  elements.confirmModalBtn.addEventListener('click', async () => {
    const folderName = elements.newProjectInput.value.trim();
    if (!folderName) {
      console.log("Folder name cannot be empty.");
      return;
    }
    elements.newProjectModal.style.display = 'none';
    console.log("New Project Modal Hidden");
    try {
      const payload = { name: folderName };
      console.log("Payload for folder creation:", payload); 
      const response = await ipcRenderer.invoke('post-data', {
        endpoint: 'api/folders/',
        payload,
      });
      console.log("Response from main process for folder creation:", response);
      if (response.success) {
        console.log("Project created successfully");
        if (typeof FileManager !== 'undefined' && FileManager.refreshNow) {
          FileManager.refreshNow();
        }
      } else {
        alert("Failed to create project: " + response.error);
      }
    } catch (error) {
      console.error("Error creating project:", error);
      alert("An error occurred while creating the project.");
    }
  });

  elements.cancelModalBtn.addEventListener('click', () => {
    elements.newProjectModal.style.display = 'none';
    console.log("New Project Modal Hidden");
  });
}

function setupLoginModal() {
  if (!elements.loginModal) {
    console.error("Login Modal element not found!");
    return;
  }

  elements.openLoginBtn.addEventListener('click', () => {
    elements.loginModal.style.display = 'flex';
  });

  elements.loginModal.addEventListener('click', (event) => {
    if (elements.modalContent && !elements.modalContent.contains(event.target)) {
      elements.loginModal.style.display = 'none';
    }
  });
}

function setupSaveToDbModal() {
  if (!elements.saveToDbModal || !elements.cancelSaveToDbBtn || !elements.confirmSaveToDbBtn) {
    console.error("Save to DB Modal elements not found!");
    return;
  }

  elements.cancelSaveToDbBtn.addEventListener('click', () => {
    elements.saveToDbModal.style.display = 'none';
  });
  
  elements.confirmSaveToDbBtn.addEventListener('click', handleVideoUpload);
  
  populateFolderDropdown();
}

/**
 * Opens the Save to DB modal and prepares it for the selected video
 * @param {number} videoIndex The index of the video in the state.videoFiles array
 */
function promptAndSaveVideoToDb(videoIndex) {
  if (videoIndex < 0 || videoIndex >= state.videoFiles.length) {
    console.error("Invalid video index");
    return;
  }
  
  const videoFile = state.videoFiles[videoIndex];
  
  document.getElementById('dbVideoTitleInput').value = videoFile.name.replace(/\.[^/.]+$/, ""); // Set default title (filename without extension)
  document.getElementById('dbVideoFileInput').value = "";
  
  populateFolderDropdown();
  
  state.currentDbVideoIndex = videoIndex;
  
  document.getElementById('saveToDbModal').style.display = 'flex';
}

/**
 * Populates the folder dropdown with available folders from the server
 */
async function populateFolderDropdown() {
  const folderSelect = document.getElementById('dbFolderSelect');
  
  try {
    let folders = [];
    if (typeof FileManager !== 'undefined' && FileManager.getFolders) {
      folders = await FileManager.getFolders();
    } else {
      const result = await ipcRenderer.invoke('fetch-data', 'api/folders/');
      if (result.success) {
        folders = result.data;
      } else {
        console.error('Failed to fetch folders:', result.error);
      }
    }
    
    folderSelect.innerHTML = '';
    
    if (folders.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No folders available';
      option.disabled = true;
      option.selected = true;
      folderSelect.appendChild(option);
    } else {
      const defaultOption = document.createElement('option');
      defaultOption.textContent = 'Select a folder';
      defaultOption.value = '';
      defaultOption.selected = true;
      defaultOption.disabled = true;
      folderSelect.appendChild(defaultOption);
      
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        folderSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading folders:', error);
    folderSelect.innerHTML = '<option disabled selected>Error loading folders</option>';
  }
}

/**
 * Creates and submits the video upload payload from the saveToDbModal form
 * Uses FormData to properly handle file uploads to the backend
 */
function handleVideoUpload() {
  const folderSelect = document.getElementById('dbFolderSelect');
  const fileInput = document.getElementById('dbVideoFileInput');
  const titleInput = document.getElementById('dbVideoTitleInput');

  if (!folderSelect.value) {
    alert('Please select a folder');
    return;
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a video file');
    return;
  }

  if (!titleInput.value.trim()) {
    alert('Please enter a title for the video');
    return;
  }

  const videoFile = fileInput.files[0];
  const formData = new FormData();
  
  formData.append('title', titleInput.value.trim());
  formData.append('folder', folderSelect.value);
  formData.append('file', videoFile);

  const saveBtn = document.getElementById('confirmSaveToDbBtn');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Uploading...';
  saveBtn.disabled = true;

  uploadVideoToServer(formData)
    .then(result => {
      if (result.success) {
        alert('Video uploaded successfully!');
        document.getElementById('saveToDbModal').style.display = 'none';
        
        if (typeof FileManager !== 'undefined' && FileManager.refreshNow) {
          FileManager.refreshNow();
        }
      } else {
        alert(`Upload failed: ${result.error}`);
      }
    })
    .catch(error => {
      alert(`Upload error: ${error.message}`);
      console.error('Video upload error:', error);
    })
    .finally(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    });
}

/**
 * Handles sending the FormData to the backend server via main process
 * @param {FormData} formData The form data containing title, folder, and file
 * @returns {Promise<Object>} Promise that resolves to success/error response
 */
async function uploadVideoToServer(formData) {
  const file = formData.get('file');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async function() {
      try {
        const payload = {
          title: formData.get('title'),
          folder: formData.get('folder'),
          fileBuffer: reader.result,
          fileName: file.name,
          fileType: file.type
        };
                const response = await ipcRenderer.invoke('upload-video', payload);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    reader.readAsArrayBuffer(file);
  });
}


function setupSidebarToggle() {
  elements.toggleVideoLibraryBtn.addEventListener('click', () => showView('video-library'));
  elements.toggleFileManagerBtn.addEventListener('click', () => showView('file-manager'));
}

function showView(viewName) {
  elements.videoLibraryView.classList.remove('active-view');
  elements.fileManagerView.classList.remove('active-view');

  elements.toggleVideoLibraryBtn.classList.remove('active');
  elements.toggleFileManagerBtn.classList.remove('active');

  if (viewName === 'video-library') {
    elements.videoLibraryView.classList.add('active-view');
    elements.toggleVideoLibraryBtn.classList.add('active');
  } else if (viewName === 'file-manager') {
    elements.fileManagerView.classList.add('active-view');
    elements.toggleFileManagerBtn.classList.add('active');
    FileManager.activateView();
  }
}


async function testFetchData() {
  console.log('Renderer: Sending test request to main process...');
  try {
    const result = await ipcRenderer.invoke('fetch-data', 'api/videos/');
    console.log('Renderer: Received response from main process:', result);

    if (result.success) {
      console.log('Renderer: Test fetch successful! Data:', result.data);
    } else {
      console.error('Renderer: Test fetch failed:', result.error);
    }
  } catch (error) {
    console.error('Renderer: Error invoking IPC handler:', error);
  }
}


function setupEventListeners() {
  elements.dropArea.addEventListener('click', () => {
    elements.videoFileInput.click();
  });

  elements.videoFileInput.addEventListener('change', handleFileImport);
  
  elements.video.addEventListener('loadedmetadata', handleVideoLoaded);
  
  elements.activateBtn.addEventListener('click', activateAnnotationMode);
  
  elements.clearBtn.addEventListener('click', clearAnnotations);
  
  elements.canvas.addEventListener('click', handleCanvasClick);
  
  elements.saveFrameBtn.addEventListener('click', saveFrame);

  elements.saveAngleBtn.addEventListener('click', saveAngle);

  window.addEventListener('resize', resizeCanvasToVideo);

  elements.video.addEventListener('timeupdate', checkAndRenderAngles);

  document.getElementById('deleteSelectedAngle').addEventListener('click', deleteSelectedAngle);

  elements.videoContainer.addEventListener('mousemove', handleCanvasMouseMove);

  elements.createCheckpointBtn.addEventListener('click', createCheckpoint);

  elements.btnDownloadCsv.addEventListener('click', downloadCsv);

  window.addEventListener('resize', resizeCanvasToVideo);
}

/**
 * Enables drag-and-drop video file import by preventing default drag behaviors, visually indicating when a file is
 * dragged over the drop zone, and importing video files when they are dropped.
 */
function setupDragAndDrop() {
  const dropTargets = [elements.sidebar, elements.dropArea];
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropTargets.forEach(target => {
      target.addEventListener(eventName, preventDefaults, false);
    });
  });
  ['dragenter', 'dragover'].forEach(eventName => {
    elements.sidebar.addEventListener(eventName, () => {
      elements.sidebar.classList.add('drop-zone');
      elements.dropArea.classList.add('active');
    }, false);
    elements.dropArea.addEventListener(eventName, () => {
      elements.dropArea.classList.add('active');
    }, false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    elements.sidebar.addEventListener(eventName,() => {
      elements.sidebar.classList.remove('drop-zone');
      elements.dropArea.classList.remove('active');
    }, false);
    elements.dropArea.addEventListener(eventName, () => {
      elements.dropArea.classList.remove('active');
    }, false);
  });
  
  dropTargets.forEach(target => {
    target.addEventListener('drop', event => {
      const files = Array.from(event.dataTransfer.files).filter(file => 
        file.type.startsWith('video/')
      );
      
      if (files.length > 0) {
        importVideos(files);
      }
    }, false);
  });
}

/**
 * Stops the browser’s default behavior and prevents the event from bubbling up the DOM,
 * used to allow custom drag-and-drop handling.
 * @param {event} e the event object
 */
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Converts selected file input into an array, imports the videos if any are selected, and then clears the input
 * value to allow re-selection of the same file later.
 */
function handleFileImport() {
  const files = Array.from(this.files);
  if (files.length > 0) {
    importVideos(files);
  }
  this.value = '';
}

/**
 * Appends new video files to the application state, updates the displayed video list, and automatically selects
 * the first video if none is currently selected.
 * @param {array} files array of video file objects
 */
function importVideos(files) {
  state.videoFiles = [...state.videoFiles, ...files];
  updateVideoList();
  
  if (state.currentVideoIndex === -1 && state.videoFiles.length > 0) {
    selectVideo(0);
  }
}

/**
 * Refreshes the video list UI by clearing the current list, creating list items for each video file, marking the
 * selected one as active, and adding click handlers to allow video selection.
 */
function updateVideoList() {
  elements.videoList.innerHTML = '';
  
  state.videoFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    li.dataset.index = index;
    
    if (index === state.currentVideoIndex) {
      li.classList.add('active');
    }

    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.classList.add('video-item-actions');

    const saveToDbBtn = document.createElement('button');
    saveToDbBtn.textContent = 'Save to DB';
    saveToDbBtn.className = 'btn btn-small btn-save-to-db';
    saveToDbBtn.title = 'Save this video to the database';
    saveToDbBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      promptAndSaveVideoToDb(index);
    });
    actionButtonsContainer.appendChild(saveToDbBtn);
    
    const deleteBtn = document.createElement('span');
    deleteBtn.textContent = '×';
    deleteBtn.className = 'delete-btn';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteVideo(index);
    });
    actionButtonsContainer.appendChild(deleteBtn);

    li.appendChild(actionButtonsContainer);

    li.addEventListener('click', () => {
      selectVideo(index);
    });
    
    elements.videoList.appendChild(li);
  });
}

/**
 * Validates the index, updates the current video state, highlights the selected list item, loads and displays the
 * chosen video via a blob URL, hides the placeholder, clears any existing annotations, and shows frame items only for
 * the selected video while hiding others.
 * @param {integer} index the position of the video in state.videoFiles to select
 */
function selectVideo(index) {
  if (index < 0 || index >= state.videoFiles.length) return;

  state.currentVideoIndex = index;

  document.querySelectorAll('#videoList li').forEach((li, i) => {
    if (i === index) {
      li.classList.add('active');
    } else {
      li.classList.remove('active');
    }
  });

  const file = state.videoFiles[index];
  const url = URL.createObjectURL(file);
  elements.video.src = url;
  elements.video.load();
  elements.video.style.display = 'block';
  clearAnnotations();

  document.querySelectorAll('.frame-item').forEach(item => {
    if (parseInt(item.dataset.videoIndex) === state.currentVideoIndex) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });

  updateCheckpointVisibility();
}

/**
 * Sets the canvas size to match the loaded video’s resolution, displays the canvas, and calls a function to adjust
 * its layout accordingly
 */
function handleVideoLoaded() {
  elements.canvas.width = this.videoWidth;
  elements.canvas.height = this.videoHeight;
  elements.canvas.style.display = 'block';
  resizeCanvasToVideo();
}

/**
 * resizes the canvas to match the actual resolution and on-screen size of the video element, ensuring proper alignment
 * for overlays or annotations.
 */
function resizeCanvasToVideo() {
  if (elements.video.videoWidth > 0 && elements.video.style.display !== 'none') {
    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    elements.canvas.style.width = elements.video.clientWidth + "px";
    elements.canvas.style.height = elements.video.clientHeight + "px";
  }
}

/**
 * Clears the canvas, finds all angle annotations whose timestamp is within 0.2 seconds of the video’s current time,
 * and then draws each angle with a colored stroke—red if selected, orange if hovered, or green otherwise—connecting
 * its three defined points.
 */
function checkAndRenderAngles() {
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  const currentTime = elements.video.currentTime;
  const matchingAngles = state.angles.filter(a => Math.abs(a.time - currentTime) < 0.2);

  matchingAngles.forEach(angleObj => {
    if (state.selectedAngle === angleObj.id) {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
    } else if (state.hoveredAngle === angleObj.id) {
      ctx.strokeStyle = 'orange';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 2;
    }

    ctx.beginPath();
    ctx.moveTo(angleObj.points[0].x, angleObj.points[0].y);
    ctx.lineTo(angleObj.points[1].x, angleObj.points[1].y);
    ctx.lineTo(angleObj.points[2].x, angleObj.points[2].y);
    ctx.stroke();
  });
}

/**
 * Activates annotation mode by disabling video interaction, clearing previous data, enabling UI controls for saving
 * angles and frames, and guiding the user to place three points on the canvas to measure an angle
 */
function activateAnnotationMode() {
  if (state.currentVideoIndex === -1) {
    elements.result.textContent = "Please select a video first";
    return;
  }
  elements.video.style.pointerEvents = 'none';
  
  state.annotationActive = true;
  state.points = [];

  elements.saveAngleBtn.style.display = 'inline-block';

  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  elements.canvas.classList.add('active');

  elements.result.textContent = "Click on the video to place 3 points and measure an angle";

  elements.saveFrameBtn.style.display = 'inline-block';
  elements.activateBtn.disabled = true;
}

/**
 * Exits annotation mode by clearing points and canvas drawings, resetting related UI elements, re-enabling video
 * interaction, and restoring buttons to their default state
 */
function clearAnnotations() {
  state.points = [];
  state.annotationActive = false;
  elements.result.textContent = "";
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  elements.video.style.pointerEvents = "auto";
  elements.canvas.classList.remove('active');
  elements.saveFrameBtn.style.display = 'none';
  elements.activateBtn.disabled = false;
}

/**
 * When annotation mode is active, this function translates the click into canvas coordinates, adds the point to the
 * annotation array (keeping only the latest three), and redraws the helper points and lines. Otherwise, it handles
 * selection or deselection of existing angles—updating the selected angle state, showing/hiding the delete button,
 * and re-rendering angles accordingly.
 * @param {event} event the mouse click even on the canvas
 */
function handleCanvasClick(event) {
  if (state.annotationActive) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (elements.canvas.width / elements.canvas.clientWidth);
    const y = (event.clientY - rect.top) * (elements.canvas.height / elements.canvas.clientHeight);

    state.points.push({ x, y });

    if (state.points.length > 3) {
      state.points.shift();
    }

    drawPointsAndLines();
  } else if (state.hoveredAngle) {
    state.selectedAngle = state.hoveredAngle;
    elements.result.textContent = "Angle selected. Click 'Delete Selected Angle' to remove.";
    document.getElementById('deleteSelectedAngle').style.display = 'inline-block';
    checkAndRenderAngles();
  } else {
    state.selectedAngle = null;
    elements.result.textContent = '';
    document.getElementById('deleteSelectedAngle').style.display = 'none';
    checkAndRenderAngles();
  }
}

/**
 * Clears the canvas and then draws red circles for the first point and blue lines connecting the first to second
 * points, and second to third points if those points exist, visually helping the user place and see the angle points.
 */
function drawPointsAndLines() {
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  if (state.points.length >= 1) {
    ctx.beginPath();
    ctx.arc(state.points[0].x, state.points[0].y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'red';
    ctx.fill();
  }
  if (state.points.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(state.points[0].x, state.points[0].y);
    ctx.lineTo(state.points[1].x, state.points[1].y);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (state.points.length === 3) {
    ctx.beginPath();
    ctx.moveTo(state.points[1].x, state.points[1].y);
    ctx.lineTo(state.points[2].x, state.points[2].y);
    ctx.stroke();
  }
}

/**
 * Clears the canvas, converts relative point coordinates to absolute positions, draws each point and connecting lines,
 * and if three points are present, calculates and draws the measured angle arc.
 */
function drawAnnotations() {
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  
  if (state.points.length === 0) return;
  
  const absPoints = state.points.map(p => ({
    x: p.xRel * elements.canvas.width,
    y: p.yRel * elements.canvas.height
  }));
 
  absPoints.forEach((pt, index) => {
    drawPoint(pt.x, pt.y, index + 1);
  });
  
  if (absPoints.length >= 2) {
    drawLine(absPoints[0], absPoints[1]);
  }
  
  if (absPoints.length === 3) {
    drawLine(absPoints[1], absPoints[2]);
    
    const angleDeg = calculateAngle(absPoints[0], absPoints[1], absPoints[2]);
    drawAngleArc(absPoints, angleDeg);
  }
}

/**
 * Draws a labeled point on the canvas using concentric circles with different styles and places a number at its
 * center to indicate its order or identifier
 * @param {number} x X-coordinate of the point on the canvas
 * @param {number} y Y-coordinate of the point on the canvas
 * @param {number} number Label number to display inside the point
 */
function drawPoint(x, y, number) {
  ctx.fillStyle = 'rgba(52, 152, 219, 0.6)';
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, 2 * Math.PI);
  ctx.fill();
  
  ctx.fillStyle = '#3498db';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fill();
  
  ctx.fillStyle = 'white';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(number.toString(), x, y);
}

/**
 * Draws a blue line with a width of 2 pixels connecting two given points on the canvas
 * @param {object} p1 First point with { x, y } coordinates
 * @param {object} p2 Second point with { x, y } coordinates
 */
function drawLine(p1, p2) {
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

/**
 * Calculates the direction of the angle at the middle point (p2) between three points and draws a red arc
 * representing the angle, then labels it with the angle's degree value.
 * @param {array} points Array of three point objects { x, y }, defining the angle
 * @param {number} angleDeg The calculated angle in degrees to display
 */
function drawAngleArc(points, angleDeg) {
  const arcRadius = 40;
  const p1 = points[0];
  const p2 = points[1];
  const p3 = points[2];
  
  const angleToP1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
  const angleToP3 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
  
  const cross = (p1.x - p2.x) * (p3.y - p2.y) - (p1.y - p2.y) * (p3.x - p2.x);
  
  let startAngle, endAngle;
  
  if (cross > 0) {
    startAngle = angleToP1;
    endAngle = angleToP3;
  } else {
    startAngle = angleToP3;
    endAngle = angleToP1;
  }
  
  if (Math.abs(endAngle - startAngle) > Math.PI) {
    if (startAngle < endAngle) {
      startAngle += 2 * Math.PI;
    } else {
      endAngle += 2 * Math.PI;
    }
  }
  
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p2.x, p2.y, arcRadius, startAngle, endAngle);
  ctx.stroke();
  
  const midAngle = (startAngle + endAngle) / 2;
  const labelX = p2.x + (arcRadius + 15) * Math.cos(midAngle);
  const labelY = p2.y + (arcRadius + 15) * Math.sin(midAngle);
  
  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${angleDeg.toFixed(1)}°`, labelX, labelY);
}

/**
 * Uses the Law of Cosines to calculate the angle at point p2 formed by the triangle defined by p1, p2, and p3.
 * @param {object} p1 Points with { x, y } coordinates that form an angle at p2
 * @param {object} p2 Points with { x, y } coordinates that form an angle at p2
 * @param {object} p3 Points with { x, y } coordinates that form an angle at p2
 * @returns {number} A number representing the angle at p2 in degrees
 */
function calculateAngle(p1, p2, p3) {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  let inner = Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
  let outer = 360 - inner;
  return { inner, outer };
}

/**
 * Displays either the inner or outer angle based on the current selection in state.showInnerAngle
 */
function renderAngleDisplay() {
  const [p1,p2,p3] = state.points;
  const { inner, outer } = calculateAngle(p1,p2,p3);
  const displayed = state.showInnerAngle ? inner : outer;
  const label = state.showInnerAngle ? 'Inner' : 'Outer';
  elements.result.textContent = `${label} angle: ${displayed.toFixed(1)}°`;
}

/**
 * Creates a clickable “Add Frame” button, assigns it an event to activate annotation mode when clicked, and appends
 * it to the frame bar in the UI.
 */
let addTile;
function createAddFrameTile() {
  addTile = document.createElement('div');
  addTile.className = 'add-frame-btn';
  addTile.textContent = 'Add Frame';
  addTile.addEventListener('click', activateAnnotationMode);
  elements.frameBar.appendChild(addTile);
  
  // Make sure the add tile appears at the beginning of the frameBar
  if (elements.frameBar.firstChild) {
    elements.frameBar.insertBefore(addTile, elements.frameBar.firstChild);
  } else {
    elements.frameBar.appendChild(addTile);
  }
}

/**
 * Captures the current video frame along with any canvas drawings, creates a thumbnail preview with a jump button for
 * that moment, and adds it to the frame bar. It then clears any active annotations.
 */
function saveFrame() {
  const w = elements.canvas.width;
  const h = elements.canvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(elements.video, 0, 0, w, h);
  tctx.drawImage(elements.canvas, 0, 0, w, h);

  const item = document.createElement('div');
  item.className = 'frame-item';
  item.dataset.videoIndex = state.currentVideoIndex;

  const thumb = document.createElement('img');
  thumb.src = tmp.toDataURL();
  item.appendChild(thumb);

  const button = document.createElement('button');
  button.className = 'frame-jump-button';
  const time = elements.video.currentTime;
  button.textContent = `Jump to ${time.toFixed(2)}s`;
  button.addEventListener('click', () => {
    elements.video.currentTime = time;
  });
  item.appendChild(button);

  elements.frameBar.insertBefore(item, elements.frameBar.lastElementChild);
  
  // Scroll to show the new checkpoint
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  clearAnnotations();
}

/**
 * Saves an angle annotation defined by 3 clicked points on the canvas at the current video timestamp. It validates
 * input, calculates the angle, stores it, updates the UI with feedback, and redraws annotations.
 */
function saveAngle() {
  if (state.points.length !== 3) {
    elements.result.textContent = "Please mark exactly 3 points before saving!";
    return;
  }

  const [p1, p2, p3] = state.points;
  const { inner, outer } = calculateAngle(p1, p2, p3);
  const displayed = state.showInnerAngle ? inner : outer;

  if (isNaN(displayed)) {
    elements.result.textContent = "Failed to calculate angle!";
    return;
  }

  const time = elements.video.currentTime;

  state.angles.push({
    id: Date.now() + Math.random(),
    time,
    points: [...state.points],
    angle: displayed
  });

  elements.result.textContent =
    `Saved angle: ${displayed.toFixed(2)}° at ${time.toFixed(2)}s`;

  state.points = [];
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  checkAndRenderAngles();
}

/**
 * Draws a green angle line (in the shape of a "V") connecting three saved points on the canvas, representing a
 * previously saved angle annotation.
 * @param {array} points Array of 3 point objects, each with x and y coordinates.
 */
function drawSavedAngle(points) {
  if (points.length < 3) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.lineTo(points[2].x, points[2].y);
  ctx.strokeStyle = 'green';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Checks if the user clicked near any saved angle on the current video frame. If so, it selects that angle, updates
 * the UI to show info and a delete button; otherwise, it clears the selection and hides the delete button, then
 * redraws the annotations.
 * @param {object} clickPoint Object with { x, y } coordinates representing the user's click position on the canvas
 */
function selectAngleAtPosition(clickPoint) {
  const currentTime = elements.video.currentTime;
  const matchingAngles = state.angles.filter(a => Math.abs(a.time - currentTime) < 0.2);

  for (let angleObj of matchingAngles) {
    if (isPointNearAngle(clickPoint, angleObj.points)) {
      state.selectedAngle = angleObj.id;
      elements.result.textContent = `Angle: ${angleObj.angle.toFixed(2)}° (Click "Delete Selected" to remove)`;

      document.getElementById('deleteSelectedAngle').style.display = 'inline-block';

      checkAndRenderAngles();
      return;
    }
  }

  state.selectedAngle = null;
  elements.result.textContent = '';

  document.getElementById('deleteSelectedAngle').style.display = 'none';

  checkAndRenderAngles();
}

/**
 * Checks if the click position is within 10 pixels of any of the given angle points, returning true if so,
 * otherwise false
 * @param {object} click Object with { x, y } coordinates representing a click position
 * @param {array} points Array of point objects, each with { x, y } coordinates representing the angle's points.
 * @returns {boolean} A boolean (true or false)
 */
function isPointNearAngle(click, points) {
  const threshold = 10;

  return points.some(p => {
    const dx = p.x - click.x;
    const dy = p.y - click.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  });
}

/**
 * Deletes the currently selected angle from the saved angles list, clears the selection and UI messages, hides the
 * delete button, and then redraws the remaining angles on the canvas
 */
function deleteSelectedAngle() {
  if (state.selectedAngle == null) return;

  const idx = state.angles.findIndex(a => a.id === state.selectedAngle);
  if (idx !== -1) {
    state.angles.splice(idx, 1);
  }

  state.selectedAngle = null;
  elements.result.textContent = '';

  document.getElementById('deleteSelectedAngle').style.display = 'none';
  checkAndRenderAngles();
}

/**
 * Tracks the mouse position over the canvas and checks if it’s near any angle points for the current video time;
 * if so, updates the hovered angle state and triggers a redraw to visually highlight the hovered angle
 * @param {event} event Mouse event object from moving the mouse over the canvas
 */
function handleCanvasMouseMove(event) {
  if (state.annotationActive) return;

  const rect = elements.canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (elements.canvas.width / elements.canvas.clientWidth);
  const y = (event.clientY - rect.top) * (elements.canvas.height / elements.canvas.clientHeight);

  const currentTime = elements.video.currentTime;
  const matchingAngles = state.angles.filter(a => Math.abs(a.time - currentTime) < 0.2);

  let hovered = null;
  for (const angleObj of matchingAngles) {
    if (isPointNearAngle({ x, y }, angleObj.points)) {
      hovered = angleObj.id;
      break;
    }
  }

  if (hovered !== state.hoveredAngle) {
    state.hoveredAngle = hovered;
    checkAndRenderAngles();
  }

  const overlay = elements.canvas;
  const btn     = elements.hoverDeleteBtn;

  if (state.annotationActive || state.hoveredAngle !== null) {
    overlay.classList.add('active');
  } else {
    overlay.classList.remove('active');
  }

  if (state.hoveredAngle !== null) {
    const angleObj = state.angles.find(a => a.id === state.hoveredAngle);
    const p        = angleObj.points[1];

    const rect    = overlay.getBoundingClientRect();
    const xClient = rect.left + (p.x / overlay.width) * rect.width;
    const yClient = rect.top  + (p.y / overlay.height) * rect.height;

    btn.style.left    = `${xClient}px`;
    btn.style.top     = `${yClient}px`;
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }

}
/**
 * Creates a new checkpoint at the current video time
 */
function createCheckpoint() {
  if (state.currentVideoIndex === -1) {
    elements.result.textContent = "Please select a video first";
    return;
  }

  const time = elements.video.currentTime;
  const checkpointId = Date.now();
  
  // Create checkpoint object
  const checkpoint = {
    id: checkpointId,
    time: time,
    videoIndex: state.currentVideoIndex
  };
  
  // Add to state
  state.checkpoints.push(checkpoint);
  
  // Add to UI
  addCheckpointToUI(checkpoint);
  
  elements.result.textContent = `Checkpoint created at ${time.toFixed(2)}s`;
}

/**
 * Adds a checkpoint to the UI checkpoint list
 * @param {object} checkpoint The checkpoint object to add
 */
function addCheckpointToUI(checkpoint) {
  const item = document.createElement('div');
  item.className = 'checkpoint-item';
  item.dataset.id = checkpoint.id;
  item.dataset.videoIndex = checkpoint.videoIndex;
  
  if (parseInt(item.dataset.videoIndex) !== state.currentVideoIndex) {
    item.style.display = 'none';
  }
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'checkpoint-time';
  timeSpan.textContent = `${checkpoint.time.toFixed(2)}s`;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'checkpoint-delete';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.title = "Delete checkpoint";
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteCheckpoint(checkpoint.id);
  });
  
  item.appendChild(timeSpan);
  item.appendChild(deleteBtn);
  
  item.addEventListener('click', () => {
    jumpToCheckpoint(checkpoint.time);
  });
  
  elements.checkpointList.appendChild(item);
  
  // Ensure new checkpoint is visible by scrolling to it
  setTimeout(() => {
    elements.checkpointList.scrollLeft = elements.checkpointList.scrollWidth;
  }, 50);
}

/**
 * Jumps to the specified time in the current video
 * @param {number} time The time to jump to in seconds
 */
function jumpToCheckpoint(time) {
  elements.video.currentTime = time;
  elements.result.textContent = `Jumped to checkpoint at ${time.toFixed(2)}s`;
}

/**
 * Deletes a checkpoint by ID
 * @param {number} id The ID of the checkpoint to delete
 */
function deleteCheckpoint(id) {
  // Remove from state
  const index = state.checkpoints.findIndex(cp => cp.id === id);
  if (index !== -1) {
    state.checkpoints.splice(index, 1);
  }
  
  // Remove from UI
  const item = document.querySelector(`.checkpoint-item[data-id="${id}"]`);
  if (item) {
    elements.checkpointList.removeChild(item);
  }
  
  elements.result.textContent = "Checkpoint deleted";
}

/**
 * Updates visibility of checkpoints based on current video
 */
function updateCheckpointVisibility() {
  document.querySelectorAll('.checkpoint-item').forEach(item => {
    if (parseInt(item.dataset.videoIndex) === state.currentVideoIndex) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

init();
