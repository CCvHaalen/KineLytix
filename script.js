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
  placeholder: document.getElementById('placeholder-message')
};


const ctx = elements.canvas.getContext('2d');

const state = {
  annotationActive: false,
  points: [],
  videoFiles: [],
  currentVideoIndex: -1
}

const data = [
  {
    ID:"",
    Name:"",
    Test:"",
    Angle:"",
    Date: ""

 },];

 const btnDownloadCsv = document.getElementById('btnDownloadCsv');
       
       btnDownloadCsv.addEventListener("click",()=>{
         downloadCsv("results.csv", json2csv.parse(data));
       });
       
       function downloadCsv(filename, csvData) {
          const element= document.createElement("a");

          element.setAttribute("href",`data:text/csv;charset=utf-8,${csvData}`);
          element.setAttribute("download", filename);
          element.style.display = "none";

          document.body.appendChild(element);
          element.click();
          document.body.removeChild(element);
       };

function init() {
  setupEventListeners();
  setupDragAndDrop();
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
  
  window.addEventListener('resize', resizeCanvasToVideo);
}

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

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleFileImport() {
  const files = Array.from(this.files);
  if (files.length > 0) {
    importVideos(files);
  }
  this.value = '';
}

function importVideos(files) {
  state.videoFiles = [...state.videoFiles, ...files];
  updateVideoList();
  
  if (state.currentVideoIndex === -1 && state.videoFiles.length > 0) {
    selectVideo(0);
  }
}

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

function activateAnnotationMode() {
  if (state.currentVideoIndex === -1) {
    elements.result.textContent = "Please select a video first";
    return;
  }
  elements.video.style.pointerEvents = 'none';
  
  state.annotationActive = true;
  state.points = [];

  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  elements.result.textContent = "Click on the video to place 3 points and measure an angle";
}

function clearAnnotations() {
  state.points = [];
  state.annotationActive = false;
  elements.result.textContent = "";
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  elements.video.style.pointerEvents = "auto";
}

function handleCanvasClick(event) {
  if (!state.annotationActive) return;
  
  const rect = elements.canvas.getBoundingClientRect();
 
  const xRel = (event.clientX - rect.left) / rect.width;
  const yRel = (event.clientY - rect.top) / rect.height;
  
  state.points.push({ xRel, yRel });
  
  if (state.points.length === 3) {
    const absPoints = state.points.map(p => ({
      x: p.xRel * elements.canvas.width,
      y: p.yRel * elements.canvas.height
    }));
    
    const angleDeg = calculateAngle(absPoints[0], absPoints[1], absPoints[2]);
    elements.result.textContent = `Measured angle: ${angleDeg.toFixed(1)}°`;
    state.annotationActive = false;
  } else {
    elements.result.textContent = `Point ${state.points.length} placed. Add ${3 - state.points.length} more point${state.points.length === 2 ? '' : 's'}.`;
  }

  drawAnnotations();
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
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}

init();