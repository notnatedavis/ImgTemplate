//   js/uiController.js
//   DOM manipulation, event wiring, Hue‑only colour picker,
//   interactive free‑form crop rectangle with handles, and
//   adjustable grid line thickness

// ----- Imports -----
import { loadImage, cropImage, scaleToFit } from './imageUtils.js';
import { drawGrid } from './gridOverlay.js';
import { downloadCanvas } from './downloadHelper.js';

// ----- Constants -----
const HANDLE_SIZE = 10;               // size of crop handle squares
const MIN_CROP_SIZE = 20;             // minimum crop rectangle dimension (px)

// ----- State -----
let originalImage = null;             // HTMLImageElement
let cropEnabled = false;              // whether crop checkbox is checked
let aspectLock = false;               // true when 1:1 ratio is selected

// crop rectangle in original image pixel coordinates
let cropRect = { x: 0, y: 0, w: 0, h: 0 };

// grid settings
let gridThickness = 1;                // line width

// drag interaction state
let dragState = {
  active: false,
  type: null,                        // 'move' | 'resize'
  direction: null,                   // 'nw','n','ne','e','se','s','sw','w'
  startMouse: { x: 0, y: 0 },
  startRect: { x: 0, y: 0, w: 0, h: 0 }
};

// ----- DOM references -----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlsDiv = document.getElementById('controls');
const previewCanvas = document.getElementById('preview-canvas');
const errorMsg = document.getElementById('error-message');
const downloadBtn = document.getElementById('download-btn');
const cropCheckbox = document.getElementById('crop-checkbox');
const cropRatioSelect = document.getElementById('crop-ratio');
const divXInput = document.getElementById('divisions-x');
const divYInput = document.getElementById('divisions-y');
const thicknessSlider = document.getElementById('thickness');
const hslContainer = document.getElementById('hsl-picker-container');

// ----- Hue‑only colour picker -----
let gridHue = 0;   // default hue (red)

const createHuePicker = (container) => {
  container.innerHTML = '';

  const pickerDiv = document.createElement('div');
  pickerDiv.className = 'hsl-picker';

  // Hue slider
  const hueRow = document.createElement('div');
  hueRow.className = 'hsl-slider-row';

  const badge = document.createElement('span');
  badge.className = 'hsl-slider-badge';
  badge.textContent = 'H';
  hueRow.appendChild(badge);

  const hueSlider = document.createElement('input');
  hueSlider.type = 'range';
  hueSlider.min = '0';
  hueSlider.max = '360';
  hueSlider.value = gridHue;
  hueSlider.className = 'hsl-slider';
  hueSlider.setAttribute('aria-label', 'Grid colour hue');

  // full‑spectrum gradient from 0° to 360°
  const gradient = `linear-gradient(
    to right,
    hsl(0,100%,50%),
    hsl(60,100%,50%),
    hsl(120,100%,50%),
    hsl(180,100%,50%),
    hsl(240,100%,50%),
    hsl(300,100%,50%),
    hsl(360,100%,50%)
  )`;

  const updateSliderStyle = () => {
    hueSlider.style.background = gradient;
    hueSlider.style.setProperty('--thumb-color', `hsl(${gridHue}, 100%, 50%)`);
  };

  hueSlider.addEventListener('input', (e) => {
    gridHue = Number(e.target.value);
    updateSliderStyle();
    redrawPreview();
  });

  updateSliderStyle();
  hueRow.appendChild(hueSlider);
  pickerDiv.appendChild(hueRow);

  container.appendChild(pickerDiv);
};

// ----- Utility: clamp a value between min and max -----
const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// ----- Enforce aspect ratio on a rectangle (centered) -----
const enforceAspectRatio = (rect, ratio = 1) => {
  const imgW = originalImage.naturalWidth;
  const imgH = originalImage.naturalHeight;
  const { x, y, w, h } = rect;

  if (w === 0 || h === 0) return rect;

  const currentRatio = w / h;
  if (Math.abs(currentRatio - ratio) < 0.001) return rect; // already matches

  let newW, newH;
  if (currentRatio > ratio) {
    // too wide → reduce width to match ratio based on height
    newW = h * ratio;
    newH = h;
  } else {
    // too tall → reduce height to match ratio based on width
    newW = w;
    newH = w / ratio;
  }

  // center the new rectangle within the old one, then clamp to image bounds
  let newX = x + (w - newW) / 2;
  let newY = y + (h - newH) / 2;

  // clamp to image boundaries
  newX = clamp(newX, 0, imgW - newW);
  newY = clamp(newY, 0, imgH - newH);
  newW = clamp(newW, MIN_CROP_SIZE, imgW - newX);
  newH = clamp(newH, MIN_CROP_SIZE, imgH - newY);

  return { x: newX, y: newY, w: newW, h: newH };
};

// ----- Initialize / reset crop rectangle to full image -----
const resetCropRect = () => {
  if (!originalImage) return;
  const w = originalImage.naturalWidth;
  const h = originalImage.naturalHeight;
  cropRect = { x: 0, y: 0, w, h };
  if (aspectLock) {
    cropRect = enforceAspectRatio(cropRect, 1);
  }
};

// ----- Draw crop handles on the preview canvas -----
const drawCropHandles = (ctx, canvasW, canvasH) => {
  if (!cropEnabled) return;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a73e8';
  ctx.lineWidth = 1.5;

  const s = HANDLE_SIZE;

  // corners
  const corners = [
    { x: 0, y: 0 },
    { x: canvasW - s, y: 0 },
    { x: 0, y: canvasH - s },
    { x: canvasW - s, y: canvasH - s }
  ];

  // midpoints of edges
  const edges = [
    { x: canvasW / 2 - s / 2, y: 0 },
    { x: canvasW / 2 - s / 2, y: canvasH - s },
    { x: 0, y: canvasH / 2 - s / 2 },
    { x: canvasW - s, y: canvasH / 2 - s / 2 }
  ];

  const all = [...corners, ...edges];
  all.forEach(p => {
    ctx.fillRect(p.x, p.y, s, s);
    ctx.strokeRect(p.x, p.y, s, s);
  });

  ctx.restore();
};

// ----- Determine which handle (if any) is under the mouse -----
const getHandleUnderMouse = (canvasX, canvasY, canvasW, canvasH) => {
  const threshold = HANDLE_SIZE * 1.2;
  const s = HANDLE_SIZE;

  // Helper to check proximity to a handle rectangle
  const near = (hx, hy) => {
    const centerX = hx + s / 2;
    const centerY = hy + s / 2;
    return (Math.abs(canvasX - centerX) <= threshold &&
            Math.abs(canvasY - centerY) <= threshold);
  };

  // Corners
  if (near(0, 0))                         return 'nw';
  if (near(canvasW - s, 0))               return 'ne';
  if (near(0, canvasH - s))               return 'sw';
  if (near(canvasW - s, canvasH - s))     return 'se';

  // Edges
  if (near(canvasW / 2 - s / 2, 0))                    return 'n';
  if (near(canvasW / 2 - s / 2, canvasH - s))          return 's';
  if (near(0, canvasH / 2 - s / 2))                    return 'w';
  if (near(canvasW - s, canvasH / 2 - s / 2))          return 'e';

  // Check if mouse is inside the canvas (but not near a handle) -> move
  if (canvasX > 0 && canvasX < canvasW && canvasY > 0 && canvasY < canvasH) {
    return 'move';
  }

  return null;
};

// ----- Update cursor based on handle hover -----
const updateCanvasCursor = (canvasX, canvasY) => {
  if (!cropEnabled || !originalImage) {
    previewCanvas.style.cursor = 'default';
    return;
  }
  const canvasW = previewCanvas.width;
  const canvasH = previewCanvas.height;
  const handle = getHandleUnderMouse(canvasX, canvasY, canvasW, canvasH);
  const cursorMap = {
    'nw': 'nw-resize',
    'n': 'n-resize',
    'ne': 'ne-resize',
    'e': 'e-resize',
    'se': 'se-resize',
    's': 's-resize',
    'sw': 'sw-resize',
    'w': 'w-resize',
    'move': 'move'
  };
  previewCanvas.style.cursor = cursorMap[handle] || 'default';
};

// ----- Preview redraw -----
const redrawPreview = () => {
  if (!originalImage) return;

  let sourceCanvas;
  let cropW, cropH;

  if (cropEnabled) {
    // crop to the current crop rectangle
    const { x, y, w, h } = cropRect;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(originalImage, x, y, w, h, 0, 0, w, h);
    cropW = w;
    cropH = h;
  } else {
    // full image
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(originalImage, 0, 0);
    cropW = w;
    cropH = h;
  }

  // scale to fit preview
  const scaled = scaleToFit(cropW, cropH, 800);
  previewCanvas.width = scaled.width;
  previewCanvas.height = scaled.height;

  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);

  // draw grid
  const divX = parseInt(divXInput.value, 10) || 0;
  const divY = parseInt(divYInput.value, 10) || 0;
  const colorStr = `hsl(${gridHue}, 100%, 50%)`;
  drawGrid(ctx, scaled.width, scaled.height, divX, divY, colorStr, gridThickness);

  // draw crop handles on top
  drawCropHandles(ctx, scaled.width, scaled.height);

  downloadBtn.disabled = false;
};

// ----- Mouse / drag event handlers -----
const getCanvasMousePos = (e) => {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
};

const handleMouseDown = (e) => {
  if (!cropEnabled || !originalImage) return;

  const pos = getCanvasMousePos(e);
  const canvasW = previewCanvas.width;
  const canvasH = previewCanvas.height;
  const handle = getHandleUnderMouse(pos.x, pos.y, canvasW, canvasH);

  if (!handle) return;

  dragState.active = true;
  dragState.type = (handle === 'move') ? 'move' : 'resize';
  dragState.direction = handle;
  dragState.startMouse = { x: pos.x, y: pos.y };
  dragState.startRect = { ...cropRect };

  e.preventDefault();
};

const handleMouseMove = (e) => {
  if (!originalImage) return;

  const pos = getCanvasMousePos(e);

  // update cursor even if not dragging
  updateCanvasCursor(pos.x, pos.y);

  if (!dragState.active) return;

  const imgW = originalImage.naturalWidth;
  const imgH = originalImage.naturalHeight;
  const canvasW = previewCanvas.width;
  const canvasH = previewCanvas.height;

  // scale factors: canvas pixels to original image pixels
  const scaleX = cropRect.w / canvasW;
  const scaleY = cropRect.h / canvasH;

  const dx = (pos.x - dragState.startMouse.x) * scaleX;
  const dy = (pos.y - dragState.startMouse.y) * scaleY;

  let newRect = { ...dragState.startRect };

  if (dragState.type === 'move') {
    // move the entire rectangle
    newRect.x = dragState.startRect.x - dx;
    newRect.y = dragState.startRect.y - dy;
    // clamp to image boundaries
    newRect.x = clamp(newRect.x, 0, imgW - newRect.w);
    newRect.y = clamp(newRect.y, 0, imgH - newRect.h);
  } else if (dragState.type === 'resize') {
    const dir = dragState.direction;
    // adjust rectangle edges based on direction
    let { x, y, w, h } = newRect;

    if (dir.includes('e')) {
      w = clamp(dragState.startRect.w + dx, MIN_CROP_SIZE, imgW - x);
    }
    if (dir.includes('w')) {
      const newW = clamp(dragState.startRect.w - dx, MIN_CROP_SIZE, imgW);
      x = dragState.startRect.x + dragState.startRect.w - newW;
      w = newW;
      x = clamp(x, 0, imgW - w);
    }
    if (dir.includes('s')) {
      h = clamp(dragState.startRect.h + dy, MIN_CROP_SIZE, imgH - y);
    }
    if (dir.includes('n')) {
      const newH = clamp(dragState.startRect.h - dy, MIN_CROP_SIZE, imgH);
      y = dragState.startRect.y + dragState.startRect.h - newH;
      h = newH;
      y = clamp(y, 0, imgH - h);
    }

    // if only one direction specified (edge resize), ensure the opposite doesn't change
    newRect.x = x;
    newRect.y = y;
    newRect.w = w;
    newRect.h = h;

    // enforce aspect ratio if locked
    if (aspectLock) {
      newRect = enforceAspectRatio(newRect, 1);
    }
  }

  cropRect = newRect;
  redrawPreview();
};

const handleMouseUp = () => {
  dragState.active = false;
};

// ----- Event wiring -----

// Canvas drag events
previewCanvas.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mouseup', handleMouseUp);

// Prevent browser drag behavior on canvas
previewCanvas.addEventListener('dragstart', e => e.preventDefault());

// Thickness slider
thicknessSlider.addEventListener('input', (e) => {
  gridThickness = parseFloat(e.target.value);
  redrawPreview();
});

// Crop checkbox
cropCheckbox.addEventListener('change', () => {
  cropEnabled = cropCheckbox.checked;
  cropRatioSelect.style.display = cropEnabled ? 'inline-block' : 'none';
  if (cropEnabled) {
    resetCropRect();
  }
  redrawPreview();
});

// Crop ratio select
cropRatioSelect.addEventListener('change', () => {
  if (cropRatioSelect.value === '1:1') {
    aspectLock = true;
    // adjust current rectangle to be square
    cropRect = enforceAspectRatio(cropRect, 1);
  } else {
    aspectLock = false;
  }
  redrawPreview();
});

// Divisions inputs
divXInput.addEventListener('input', redrawPreview);
divYInput.addEventListener('input', redrawPreview);

// ----- Drop / file handling (unchanged) -----

const handleFileSelect = async (file) => {
  try {
    originalImage = await loadImage(file);
    controlsDiv.style.display = 'flex';
    if (!hslContainer.hasChildNodes()) {
      createHuePicker(hslContainer);
    }
    // Initial crop rectangle is full image; set crop to disabled initially
    cropEnabled = false;
    cropCheckbox.checked = false;
    cropRatioSelect.style.display = 'none';
    aspectLock = false;
    cropRatioSelect.value = 'freeform';
    gridThickness = 1;
    thicknessSlider.value = '1';
    resetCropRect();
    redrawPreview();
  } catch (err) {
    showError(err.message);
  }
};

// drop zone events
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFileSelect(file);
});

// ----- Download -----
downloadBtn.addEventListener('click', () => {
  if (!previewCanvas.width || !previewCanvas.height) {
    showError('Nothing to download.');
    return;
  }
  try {
    downloadCanvas(previewCanvas);
  } catch (err) {
    showError(err.message);
  }
});

// ----- Error display -----
const showError = (msg) => {
  errorMsg.textContent = msg;
  setTimeout(() => {
    errorMsg.textContent = '';
  }, 5000);
};