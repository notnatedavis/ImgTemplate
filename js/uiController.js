//   js/uiController.js

//   DOM manipulation, event wiring, Hue‑only colour picker,
//   interactive free‑form crop rectangle with handles,
//   adjustable grid line thickness, and expandable crop
//   (canvas can extend up to 150% of the original image size)

// ----- Imports -----
import { loadImage, cropImage, scaleToFit } from './imageUtils.js';
import { drawGrid } from './gridOverlay.js';
import { downloadCanvas } from './downloadHelper.js';

// ----- Constants -----
const HANDLE_SIZE = 10; // size of crop handle squares
const MIN_CROP_SIZE = 20; // minimum crop rectangle dimension (px)
const EXPAND_FACTOR = 1.5; // max crop rectangle size multiplier

// ----- State -----
let originalImage = null; // HTMLImageElement
let cropEnabled = false; // whether crop checkbox is checked
let aspectLock = false; // true when 1:1 ratio is selected

// crop rectangle in original image pixel coordinates
let cropRect = { x: 0, y: 0, w: 0, h: 0 };

// maximum dimensions for the expandable crop rectangle
let maxCropW = 0;
let maxCropH = 0;

// grid settings
let gridThickness = 1; // line width

// drag interaction state
let dragState = {
  active: false,
  type: null, // 'move' | 'resize'
  direction: null, // 'nw','n','ne','e','se','s','sw','w'
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

  // full‑spectrum gradient from 0 - 360
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

// ----- Utility: clamp val between min & max -----
const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// ----- Clamp the crop rectangle to allowed size and ensure it overlaps the image -----
const clampCropRect = (rect) => {
  if (!originalImage) return rect;
  const imgW = originalImage.naturalWidth;
  const imgH = originalImage.naturalHeight;

  // clamp size
  rect.w = clamp(rect.w, MIN_CROP_SIZE, maxCropW);
  rect.h = clamp(rect.h, MIN_CROP_SIZE, maxCropH);

  // ensure at least 1 px of the image is visible (overlap)
  if (rect.x + rect.w <= 0) rect.x = -rect.w + 1;
  if (rect.x >= imgW) rect.x = imgW - 1;
  if (rect.y + rect.h <= 0) rect.y = -rect.h + 1;
  if (rect.y >= imgH) rect.y = imgH - 1;

  return rect;
};

// ----- Enforce aspect ratio on a rectangle (centered) -----
const enforceAspectRatio = (rect, ratio = 1) => {
  if (!originalImage) return rect;
  const imgW = originalImage.naturalWidth;
  const imgH = originalImage.naturalHeight;
  const { x, y, w, h } = rect;

  if (w === 0 || h === 0) return rect;

  const currentRatio = w / h;
  if (Math.abs(currentRatio - ratio) < 0.001) return rect; // already matches

  let newW, newH;
  if (currentRatio > ratio) {
    // too wide ; reduce width to match ratio based on height
    newW = h * ratio;
    newH = h;
  } else {
    // too tall ; reduce height to match ratio based on width
    newW = w;
    newH = w / ratio;
  }

  // center the new rectangle within the old one
  let newX = x + (w - newW) / 2;
  let newY = y + (h - newH) / 2;

  // apply to the rect and clamp using the new expanded bounds
  return clampCropRect({ x: newX, y: newY, w: newW, h: newH });
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

  // corners
  if (near(0, 0))                         return 'nw';
  if (near(canvasW - s, 0))               return 'ne';
  if (near(0, canvasH - s))               return 'sw';
  if (near(canvasW - s, canvasH - s))     return 'se';

  // edges
  if (near(canvasW / 2 - s / 2, 0))                    return 'n';
  if (near(canvasW / 2 - s / 2, canvasH - s))          return 's';
  if (near(0, canvasH / 2 - s / 2))                    return 'w';
  if (near(canvasW - s, canvasH / 2 - s / 2))          return 'e';

  // check if mouse is inside canvas (but not near handle) -> move
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

// ----- Render the final full‑resolution output (image + grid) onto a canvas -----
const renderOutputCanvas = (canvas) => {
  if (!originalImage) return;
  const imgW = originalImage.naturalWidth;
  const imgH = originalImage.naturalHeight;

  if (cropEnabled) {
    // use the crop rectangle as the output canvas dimensions
    canvas.width = cropRect.w;
    canvas.height = cropRect.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // draw the original image at an offset based on the crop rectangle position
    ctx.drawImage(originalImage, -cropRect.x, -cropRect.y);
  } else {
    canvas.width = imgW;
    canvas.height = imgH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0);
  }

  // draw grid on the full‑resolution canvas
  const divX = parseInt(divXInput.value, 10) || 0;
  const divY = parseInt(divYInput.value, 10) || 0;
  const colorStr = `hsl(${gridHue}, 100%, 50%)`;
  drawGrid(canvas.getContext('2d'), canvas.width, canvas.height, divX, divY, colorStr, gridThickness);
};

// ----- Preview redraw (scaled view with interactive handles) -----
const redrawPreview = () => {
  if (!originalImage) return;

  // 1. generate full-resolution output on an off‑screen canvas
  const offscreen = document.createElement('canvas');
  renderOutputCanvas(offscreen);

  // 2. scale to fit the preview area
  const scaled = scaleToFit(offscreen.width, offscreen.height, 800);
  previewCanvas.width = scaled.width;
  previewCanvas.height = scaled.height;

  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(offscreen, 0, 0, scaled.width, scaled.height);

  // 3. draw crop handles on top of the scaled preview
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

  const canvasW = previewCanvas.width;
  const canvasH = previewCanvas.height;

  // scale factors: canvas pixels to cropRect coordinate space
  const scaleX = cropRect.w / canvasW;
  const scaleY = cropRect.h / canvasH;

  const dx = (pos.x - dragState.startMouse.x) * scaleX;
  const dy = (pos.y - dragState.startMouse.y) * scaleY;

  let newRect = { ...dragState.startRect };

  if (dragState.type === 'move') {
    // move the entire rectangle
    newRect.x = dragState.startRect.x - dx;
    newRect.y = dragState.startRect.y - dy;
    // clamp to allowed expanded bounds (intersection + size limits)
    newRect = clampCropRect(newRect);
  } else if (dragState.type === 'resize') {
    const dir = dragState.direction;
    let { x, y, w, h } = newRect;

    if (dir.includes('e')) {
      w = clamp(dragState.startRect.w + dx, MIN_CROP_SIZE, maxCropW - x);
    }
    if (dir.includes('w')) {
      const newW = clamp(dragState.startRect.w - dx, MIN_CROP_SIZE, maxCropW);
      x = dragState.startRect.x + dragState.startRect.w - newW;
      w = newW;
    }
    if (dir.includes('s')) {
      h = clamp(dragState.startRect.h + dy, MIN_CROP_SIZE, maxCropH - y);
    }
    if (dir.includes('n')) {
      const newH = clamp(dragState.startRect.h - dy, MIN_CROP_SIZE, maxCropH);
      y = dragState.startRect.y + dragState.startRect.h - newH;
      h = newH;
    }

    newRect.x = x;
    newRect.y = y;
    newRect.w = w;
    newRect.h = h;

    // enforce aspect ratio if locked
    if (aspectLock) {
      newRect = enforceAspectRatio(newRect, 1);
    } else {
      newRect = clampCropRect(newRect);
    }
  }

  cropRect = newRect;
  redrawPreview();
};

const handleMouseUp = () => {
  dragState.active = false;
};

// ----- Event wiring -----

// canvas drag events
previewCanvas.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mouseup', handleMouseUp);

// prevent browser drag behavior on canvas
previewCanvas.addEventListener('dragstart', e => e.preventDefault());

// thickness slider
thicknessSlider.addEventListener('input', (e) => {
  gridThickness = parseFloat(e.target.value);
  redrawPreview();
});

// crop checkbox
cropCheckbox.addEventListener('change', () => {
  cropEnabled = cropCheckbox.checked;
  cropRatioSelect.style.display = cropEnabled ? 'inline-block' : 'none';
  if (cropEnabled) {
    resetCropRect();
  }
  redrawPreview();
});

// crop ratio select
cropRatioSelect.addEventListener('change', () => {
  if (cropRatioSelect.value === '1:1') {
    aspectLock = true;
    // adjust current rectangle to be square (respects expand bounds)
    cropRect = enforceAspectRatio(cropRect, 1);
  } else {
    aspectLock = false;
  }
  redrawPreview();
});

// Divisions inputs
divXInput.addEventListener('input', redrawPreview);
divYInput.addEventListener('input', redrawPreview);

// ----- Drop / file handling -----

const handleFileSelect = async (file) => {
  try {
    originalImage = await loadImage(file);
    controlsDiv.style.display = 'flex';
    if (!hslContainer.hasChildNodes()) {
      createHuePicker(hslContainer);
    }

    // Compute max expandable dimensions (150 % of original)
    maxCropW = originalImage.naturalWidth * EXPAND_FACTOR;
    maxCropH = originalImage.naturalHeight * EXPAND_FACTOR;

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
  if (!originalImage) {
    showError('Nothing to download.');
    return;
  }
  try {
    // generate full‑resolution output on a fresh canvas and download it
    const outputCanvas = document.createElement('canvas');
    renderOutputCanvas(outputCanvas);
    downloadCanvas(outputCanvas);
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