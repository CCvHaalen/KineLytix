const elements = {
  sidebar: document.getElementById('sidebar'),
  dropArea: document.getElementById('dropArea'),
  videoFileInput: document.getElementById('videoFile'),
  videoList: document.getElementById('videoList'),
  video: document.getElementById('video'),
  canvas: document.getElementById('overlay'),
  activateBtn: document.getElementById('activateAnnotation'),
  clearBtn: document.getElementById('clearAnnotation'),
  result: document.getElementById('result'),
  placeholder: document.getElementById('placeholder-message'),
  saveFrameBtn: document.getElementById('saveFrame'),
  saveAngleBtn: document.getElementById('saveAngle'),
  frameBar: document.getElementById('frameBar'),
  hoveredAngle: null,
};


const ctx = elements.canvas.getContext('2d');

const state = {
  annotationActive: false,
  points: [],
  videoFiles: [],
  currentVideoIndex: -1,
  angles: [],
  selectedAngle: null,
  hoveredAngle: null,
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

  element.setAttribute("href",`data:text/csv;charset=utf-8,${csvData}`);
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
  elements.speedSlider = document.getElementById('speedSlider');
  elements.speedValue = document.getElementById('speedValue');

  elements.speedSlider.addEventListener('input', () => {
  const speed = parseFloat(elements.speedSlider.value);
  elements.video.playbackRate = speed;
  elements.speedValue.textContent = speed.toFixed(2) + 'x';
  });
}

/**
 * Wires up all the necessary event listeners for UI interaction, including file import, video loading,
 * annotation mode toggling, canvas interaction, saving frames/angles, window resizing, and deleting angles.
 */
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

  elements.canvas.addEventListener('mousemove', handleCanvasMouseMove);
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
  elements.placeholder.style.display = 'none';
  clearAnnotations();

  document.querySelectorAll('.frame-item').forEach(item => {
    if (parseInt(item.dataset.videoIndex) === state.currentVideoIndex) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function handleVideoLoaded() {
  elements.canvas.width = this.videoWidth;
  elements.canvas.height = this.videoHeight;
  elements.canvas.style.display = 'block';
  resizeCanvasToVideo();
}

function resizeCanvasToVideo() {
  if (elements.video.videoWidth > 0 && elements.video.style.display !== 'none') {
    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    elements.canvas.style.width = elements.video.clientWidth + "px";
    elements.canvas.style.height = elements.video.clientHeight + "px";
  }
}

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

function drawLine(p1, p2) {
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

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

function calculateAngle(p1, p2, p3) {
  const a = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const b = Math.hypot(p1.x - p3.x, p1.y - p3.y);
  const c = Math.hypot(p1.x - p2.x, p1.y - p2.y);

  if (a === 0 || b === 0) return NaN;

  return Math.acos((a*a + b*b - c*c) / (2*a*b)) * (180/Math.PI);
}

let addTile;
function createAddFrameTile() {
  addTile = document.createElement('div');
  addTile.className = 'add-frame-btn';
  addTile.textContent = 'Add Frame';
  addTile.addEventListener('click', activateAnnotationMode);
  elements.frameBar.appendChild(addTile);
}

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
  item.dataset.videoIndex = state.currentVideoIndex;  // 👈 Save video index

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
  clearAnnotations();
}

function saveAngle() {
  if (state.points.length !== 3) {
    elements.result.textContent = "Please mark exactly 3 points before saving!";
    return;
  }

  const [p1, p2, p3] = state.points;
  const angle = calculateAngle(p1, p2, p3);

  if (isNaN(angle)) {
    elements.result.textContent = "Failed to calculate angle!";
    return;
  }

  const time = elements.video.currentTime;

  state.angles.push({ id: Date.now() + Math.random(), time, points: [...state.points], angle });

  elements.result.textContent = `Saved angle: ${angle.toFixed(2)}° at ${time.toFixed(2)}s`;

  state.points = [];
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  checkAndRenderAngles();
}

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

function selectAngleAtPosition(clickPoint) {
  const currentTime = elements.video.currentTime;
  const matchingAngles = state.angles.filter(a => Math.abs(a.time - currentTime) < 0.2);

  for (let angleObj of matchingAngles) {
    if (isPointNearAngle(clickPoint, angleObj.points)) {
      state.selectedAngle = angleObj.id;
      elements.result.textContent = `Angle: ${angleObj.angle.toFixed(2)}° (Click "Delete Selected" to remove)`;

      document.getElementById('deleteSelectedAngle').style.display = 'inline-block'; // 🔥 Add this

      checkAndRenderAngles();
      return;
    }
  }

  state.selectedAngle = null;
  elements.result.textContent = '';

  document.getElementById('deleteSelectedAngle').style.display = 'none'; // 🔥 Add this

  checkAndRenderAngles();
}

function isPointNearAngle(click, points) {
  const threshold = 10;

  return points.some(p => {
    const dx = p.x - click.x;
    const dy = p.y - click.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  });
}

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

function handleCanvasMouseMove(event) {
  if (state.annotationActive) return; // Skip if measuring

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
}

init();
