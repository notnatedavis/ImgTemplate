//   js/uiController.js
//   DOM manipulation, event wiring, Hue‑only colour picker, and
//   interactive image positioning (pan, zoom, canvas padding) via drag

// ----- Imports -----
import { loadImage, cropImage, scaleToFit } from './imageUtils.js';
import { drawGrid } from './gridOverlay.js';
import { downloadCanvas } from './downloadHelper.js';
import { setupDragAndDrop, validateImageFile } from './dragDrop.js';

// ----- State -----
let originalImage = null;          // HTMLImageElement
let baseCanvas = null;             // cropped or original image, pre‑rendered
let baseWidth = 0;                 // base canvas dimensions
let baseHeight = 0;

// Viewport parameters (canvas beyond the base image)
let canvasPadding = 1.0;           // 1.0 – 1.5 (extends canvas beyond base)
let imageScale = 1.0;              // 0.25 – 3.0 (resize the base image)
let imageOffsetX = 0;              // pan offset in canvas pixels
let imageOffsetY = 0;

// crop offsets (0‑1) within the source image (always centred for now)
let cropOffsetX = 0.5;
let cropOffsetY = 0.5;

// drag tracking (pan)
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragStartOffset = { x: 0, y: 0 };

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
const thicknessInput = document.getElementById('grid-thickness');
const hslContainer = document.getElementById('hsl-picker-container');
const paddingSlider = document.getElementById('canvas-padding');
const paddingValue = document.getElementById('canvas-padding-value');
const zoomSlider = document.getElementById('image-zoom');
const zoomValue = document.getElementById('image-zoom-value');
const resetBtn = document.getElementById('reset-btn');

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

// ----- Layout helpers -----

/**
 * Compute the current canvas size (base image × padding factor).
 * @returns {{ width: number, height: number }}
 */
const getCanvasSize = () => ({
  width: Math.round(baseWidth * canvasPadding),
  height: Math.round(baseHeight * canvasPadding),
});

/**
 * Clamp the pan offset so the image center stays within the canvas.
 * This keeps the image at least partially visible regardless of drag or zoom.
 */
const clampPan = () => {
  const { width, height } = getCanvasSize();
  const maxX = width / 2;
  const maxY = height / 2;
  imageOffsetX = Math.max(-maxX, Math.min(maxX, imageOffsetX));
  imageOffsetY = Math.max(-maxY, Math.min(maxY, imageOffsetY));
};

// ----- Preview redraw -----
const redrawPreview = () => {
  if (!originalImage) return;

  // 1) Build the base canvas (cropped or original)
  if (cropCheckbox.checked) {
    const ratio = cropRatioSelect.value;
    const { canvas, width, height } = cropImage(originalImage, ratio, cropOffsetX, cropOffsetY);
    baseCanvas = canvas;
    baseWidth = width;
    baseHeight = height;
  } else {
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    baseCanvas = document.createElement('canvas');
    baseCanvas.width = w;
    baseCanvas.height = h;
    baseCanvas.getContext('2d').drawImage(originalImage, 0, 0);
    baseWidth = w;
    baseHeight = h;
  }

  // 2) Canvas dimensions from padding
  const { width: canvasW, height: canvasH } = getCanvasSize();

  // 3) Image placement (center + pan, scaled)
  const drawnW = Math.round(baseWidth * imageScale);
  const drawnH = Math.round(baseHeight * imageScale);
  const drawX = Math.round((canvasW - drawnW) / 2 + imageOffsetX);
  const drawY = Math.round((canvasH - drawnH) / 2 + imageOffsetY);

  // 4) Scale canvas down to fit the preview viewport
  const scaled = scaleToFit(canvasW, canvasH, 800);
  previewCanvas.width = scaled.width;
  previewCanvas.height = scaled.height;

  const ctx = previewCanvas.getContext('2d');
  const pxScaleX = scaled.width / canvasW;
  const pxScaleY = scaled.height / canvasH;

  // 5) White background (shows through wherever the image doesn't reach)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, scaled.width, scaled.height);

  // 6) Draw the base image with pan + zoom
  ctx.drawImage(
    baseCanvas,
    0, 0, baseWidth, baseHeight,
    drawX * pxScaleX, drawY * pxScaleY,
    drawnW * pxScaleX, drawnH * pxScaleY
  );

  // 7) Grid overlay
  const divX = parseInt(divXInput.value, 10) || 0;
  const divY = parseInt(divYInput.value, 10) || 0;
  const thickness = parseFloat(thicknessInput.value) || 1;
  const colorStr = `hsl(${gridHue}, 100%, 50%)`;
  drawGrid(ctx, scaled.width, scaled.height, divX, divY, colorStr, thickness);

  downloadBtn.disabled = false;
};

// ----- Drag handlers (pan) -----
const getCanvasMousePos = (e) => {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
};

const handleMouseDown = (e) => {
  if (!originalImage) return;

  isDragging = true;
  const pos = getCanvasMousePos(e);
  dragStart.x = pos.x;
  dragStart.y = pos.y;
  dragStartOffset.x = imageOffsetX;
  dragStartOffset.y = imageOffsetY;

  previewCanvas.style.cursor = 'grabbing';
  e.preventDefault(); // prevent text selection
};

const handleMouseMove = (e) => {
  if (!isDragging) return;

  const pos = getCanvasMousePos(e);
  const dx = pos.x - dragStart.x;
  const dy = pos.y - dragStart.y;

  // Convert preview pixels back to canvas pixels
  const { width: canvasW, height: canvasH } = getCanvasSize();
  const pxScaleX = previewCanvas.width / canvasW;
  const pxScaleY = previewCanvas.height / canvasH;

  imageOffsetX = dragStartOffset.x + dx / pxScaleX;
  imageOffsetY = dragStartOffset.y + dy / pxScaleY;

  clampPan();
  redrawPreview();
};

const handleMouseUp = () => {
  if (!isDragging) return;
  isDragging = false;
  previewCanvas.style.cursor = 'move';
};

// ----- Error display -----
const showError = (msg) => {
  errorMsg.textContent = msg;
  setTimeout(() => {
    errorMsg.textContent = '';
  }, 5000);
};

// ----- Event Handlers -----
const handleFileSelect = async (file) => {
  const { valid, error } = validateImageFile(file);
  if (!valid) {
    console.error(`[ImgTemplate] ${error}`);
    showError(error);
    return;
  }

  try {
    originalImage = await loadImage(file);
    controlsDiv.style.display = 'flex';
    // Initialize Hue picker if not yet created
    if (!hslContainer.hasChildNodes()) {
      createHuePicker(hslContainer);
    }

    // Reset all viewport parameters for a new image
    cropOffsetX = 0.5;
    cropOffsetY = 0.5;
    canvasPadding = 1.0;
    imageScale = 1.0;
    imageOffsetX = 0;
    imageOffsetY = 0;
    paddingSlider.value = '100';
    paddingValue.textContent = '100%';
    zoomSlider.value = '100';
    zoomValue.textContent = '100%';

    previewCanvas.style.cursor = 'move';
    redrawPreview();
  } catch (err) {
    console.error('[ImgTemplate] Failed to load image:', err);
    showError(err.message);
  }
};

// drop zone click still opens the native file picker
dropZone.addEventListener('click', () => fileInput.click());

// window‑level drag & drop (accepts drops anywhere on the page)
setupDragAndDrop({
  dropZone,
  onFile: handleFileSelect,
  onError: showError,
});

// file input selection — reset so the same file can be re‑selected
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) handleFileSelect(file);
});

// crop checkbox toggles visibility of crop ratio dropdown; base dims change,
// so pan resets (crop offsets stay centred)
cropCheckbox.addEventListener('change', () => {
  cropRatioSelect.style.display = cropCheckbox.checked ? 'inline-block' : 'none';
  cropOffsetX = 0.5;
  cropOffsetY = 0.5;
  imageOffsetX = 0;
  imageOffsetY = 0;
  redrawPreview();
});

cropRatioSelect.addEventListener('change', () => {
  // base dimensions change with ratio — recentre pan
  cropOffsetX = 0.5;
  cropOffsetY = 0.5;
  imageOffsetX = 0;
  imageOffsetY = 0;
  redrawPreview();
});

divXInput.addEventListener('input', redrawPreview);
divYInput.addEventListener('input', redrawPreview);
thicknessInput.addEventListener('input', redrawPreview);

// canvas padding slider — 100% to 150% of base image size
paddingSlider.addEventListener('input', (e) => {
  canvasPadding = Number(e.target.value) / 100;
  paddingValue.textContent = `${e.target.value}%`;
  clampPan();
  redrawPreview();
});

// image zoom slider — 25% to 300% of base image size
zoomSlider.addEventListener('input', (e) => {
  imageScale = Number(e.target.value) / 100;
  zoomValue.textContent = `${e.target.value}%`;
  clampPan();
  redrawPreview();
});

// reset button — recenter the image at 100% scale with no padding
resetBtn.addEventListener('click', () => {
  if (!originalImage) return;
  imageOffsetX = 0;
  imageOffsetY = 0;
  imageScale = 1.0;
  canvasPadding = 1.0;
  cropOffsetX = 0.5;
  cropOffsetY = 0.5;
  paddingSlider.value = '100';
  paddingValue.textContent = '100%';
  zoomSlider.value = '100';
  zoomValue.textContent = '100%';
  redrawPreview();
});

// canvas drag events (pan the image)
previewCanvas.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mouseup', handleMouseUp);

// download
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