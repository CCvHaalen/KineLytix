// Get references to the DOM elements
const videoFileInput = document.getElementById('videoFile');
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const activateButton = document.getElementById('activateAnnotation');
const resultP = document.getElementById('result');
const ctx = canvas.getContext('2d');

let annotationActive = false;
// Store points as relative coordinates: { xRel, yRel }
let points = [];

// When a video file is selected, load it into the video element and play it
videoFileInput.addEventListener('change', function () {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    video.play();
  }
});

// Once the video metadata is loaded, set the canvas dimensions to match
video.addEventListener('loadedmetadata', function () {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  // Adjust canvas display size to match video element's size
  canvas.style.width = video.clientWidth + "px";
  canvas.style.height = video.clientHeight + "px";
});

// Activate annotation mode when the button is clicked
activateButton.addEventListener('click', function () {
  annotationActive = true;
  // Clear any previously stored points and messages
  points = [];
  resultP.textContent = "Annotation mode active. Click on the video to select 3 points.";
});

// Listen for clicks on the canvas to record points
canvas.addEventListener('click', function (event) {
  if (!annotationActive) return;
  
  // Use the canvas's bounding rectangle (the displayed size)
  const rect = canvas.getBoundingClientRect();
  const xRel = (event.clientX - rect.left) / rect.width;
  const yRel = (event.clientY - rect.top) / rect.height;
  
  points.push({ xRel, yRel });
  
  // When three points have been selected, calculate the angle and update message.
  if (points.length === 3) {
    // Convert relative points to absolute coordinates for calculation.
    const absPoints = points.map(p => ({
      x: p.xRel * canvas.width,
      y: p.yRel * canvas.height
    }));
    const angleDeg = calculateAngle(absPoints[0], absPoints[1], absPoints[2]);
    resultP.textContent = "Measured angle: " + angleDeg.toFixed(2) + "°";
    // Optionally, you can set annotationActive = false if you want to freeze annotations.
    annotationActive = false;
  }
});

// Animation loop to continuously re-draw annotations
function animateAnnotations() {
  // Clear the canvas each frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (points.length > 0) {
    // Convert stored relative coordinates to absolute positions
    const absPoints = points.map(p => ({
      x: p.xRel * canvas.width,
      y: p.yRel * canvas.height
    }));
    
    // Draw the points
    absPoints.forEach(pt => drawPoint(pt.x, pt.y));
    
    // Draw line between first and second point if available
    if (absPoints.length >= 2) {
      drawLine(absPoints[0], absPoints[1]);
    }
    // Draw line between second and third point and arc if all 3 points exist
    if (absPoints.length === 3) {
      drawLine(absPoints[1], absPoints[2]);
      const angleDeg = calculateAngle(absPoints[0], absPoints[1], absPoints[2]);
      
      // --- Draw the arc representing the angle ---
      const arcRadius = 40;
      const angleBA = Math.atan2(absPoints[0].y - absPoints[1].y, absPoints[0].x - absPoints[1].x);
      const angleBC = Math.atan2(absPoints[2].y - absPoints[1].y, absPoints[2].x - absPoints[1].x);
      
      // Determine direction using cross product
      const cross = (absPoints[0].x - absPoints[1].x) * (absPoints[2].y - absPoints[1].y) -
                    (absPoints[0].y - absPoints[1].y) * (absPoints[2].x - absPoints[1].x);
      const angleRad = angleDeg * Math.PI / 180;
      let startAngle, endAngle;
      
      if (cross >= 0) {
        startAngle = angleBA;
        endAngle = angleBA + angleRad;
      } else {
        startAngle = angleBA;
        endAngle = angleBA - angleRad;
      }
      
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(absPoints[1].x, absPoints[1].y, arcRadius, startAngle, endAngle, false);
      ctx.stroke();
      
      // Place the angle text near the midpoint of the arc
      const midAngle = (startAngle + endAngle) / 2;
      const textX = absPoints[1].x + (arcRadius + 15) * Math.cos(midAngle);
      const textY = absPoints[1].y + (arcRadius + 15) * Math.sin(midAngle);
      ctx.fillStyle = 'black';
      ctx.font = '16px Arial';
      ctx.fillText(angleDeg.toFixed(2) + "°", textX, textY);
    }
  }
  
  requestAnimationFrame(animateAnnotations);
}

// Start the annotation animation loop
animateAnnotations();

//
// Utility drawing functions
//
function drawPoint(x, y) {
  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fill();
}

function drawLine(p1, p2) {
  ctx.strokeStyle = 'blue';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

// Function to calculate the angle at point B (the second point)
// given three points A, B, and C.
function calculateAngle(p1, p2, p3) {
  // Create vectors from point B to A and from point B to C.
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return 0;
  const angleRad = Math.acos(dot / (mag1 * mag2));
  return angleRad * (180 / Math.PI);
}
