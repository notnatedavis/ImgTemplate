//   js/uiController.js
//   DOM manipulation, event wiring, Hue‑only colour picker, and
//   interactive crop repositioning via drag on the preview canvas

// ----- Imports -----
import { loadImage, cropImage, scaleToFit } from './imageUtils.js';
import { drawGrid } from './gridOverlay.js';
import { downloadCanvas } from './downloadHelper.js';

// ----- State -----
let originalImage = null;          // HTMLImageElement
let currentCropCanvas = null;      // HTMLCanvasElement from crop (or null)
let currentCropDim = { width: 0, height: 0 };

// crop offsets (0‑1) – default centred
let cropOffsetX = 0.5;
let cropOffsetY = 0.5;

// drag tracking
let isDragging = false;
let dragStart = { x: 0, y: 0 };       // mouse position at drag start
let dragStartOffset = { x: 0.5, y: 0.5 }; // offsets at drag start

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

// ----- Preview redraw -----
const redrawPreview = () => {
  if (!originalImage) return;

  const shouldCrop = cropCheckbox.checked;
  let sourceCanvas;
  let cropW, cropH;

  if (shouldCrop) {
    const ratio = cropRatioSelect.value;
    const { canvas, width, height } = cropImage(originalImage, ratio, cropOffsetX, cropOffsetY);
    sourceCanvas = canvas;
    cropW = width;
    cropH = height;
  } else {
    // use original image (no crop)
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

  currentCropCanvas = sourceCanvas;
  currentCropDim = { width: cropW, height: cropH };

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
  drawGrid(ctx, scaled.width, scaled.height, divX, divY, colorStr);

  downloadBtn.disabled = false;
};

// ----- Drag handlers -----
const getCanvasMousePos = (e) => {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
};

const handleMouseDown = (e) => {
  if (!cropCheckbox.checked || !originalImage) return;

  isDragging = true;
  const pos = getCanvasMousePos(e);
  dragStart.x = pos.x;
  dragStart.y = pos.y;
  dragStartOffset.x = cropOffsetX;
  dragStartOffset.y = cropOffsetY;

  previewCanvas.style.cursor = 'grabbing';
  e.preventDefault(); // prevent text selection
};

const handleMouseMove = (e) => {
  if (!isDragging) return;

  const pos = getCanvasMousePos(e);
  const dx = pos.x - dragStart.x;
  const dy = pos.y - dragStart.y;

  // Convert pixel movement to offset change in the original image space
  // The preview canvas displays the cropped image scaled; the relationship:
  //   pixelDelta * (originalCropSize / canvasDisplaySize) = offsetDelta * (maxOffsetRange)
  const ratio = cropRatioSelect.value;
  let targetRatio;
  if (ratio === '1:1') targetRatio = 1;
  else if (ratio === '4:3') targetRatio = 4 / 3;
  else targetRatio = 1;

  const origW = originalImage.naturalWidth;
  const origH = originalImage.naturalHeight;
  const currentRatio = origW / origH;
  let cropW, cropH;
  if (currentRatio > targetRatio) {
    cropH = origH;
    cropW = Math.round(origH * targetRatio);
  } else {
    cropW = origW;
    cropH = Math.round(origW / targetRatio);
  }

  const maxStartX = Math.max(0, origW - cropW);
  const maxStartY = Math.max(0, origH - cropH);

  // Scale factor: canvas pixel → offset fraction
  // pixelDx → change in startX (in original pixels)
  // deltaStartX = dx * (cropW / previewCanvas.width)
  // deltaOffsetX = deltaStartX / maxStartX
  if (maxStartX > 0 && cropW > 0) {
    const scaleX = (cropW / previewCanvas.width) / maxStartX;
    cropOffsetX = dragStartOffset.x - dx * scaleX;
  }
  if (maxStartY > 0 && cropH > 0) {
    const scaleY = (cropH / previewCanvas.height) / maxStartY;
    cropOffsetY = dragStartOffset.y - dy * scaleY;
  }

  // Clamp offsets to [0, 1]
  cropOffsetX = Math.max(0, Math.min(1, cropOffsetX));
  cropOffsetY = Math.max(0, Math.min(1, cropOffsetY));

  redrawPreview();
};

const handleMouseUp = () => {
  if (!isDragging) return;
  isDragging = false;
  previewCanvas.style.cursor = cropCheckbox.checked ? 'move' : 'default';
};

// attach / detach canvas events based on crop state
const updateCanvasCursor = () => {
  previewCanvas.style.cursor = cropCheckbox.checked ? 'move' : 'default';
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
  try {
    originalImage = await loadImage(file);
    controlsDiv.style.display = 'flex';
    // Initialize Hue picker if not yet created
    if (!hslContainer.hasChildNodes()) {
      createHuePicker(hslContainer);
    }
    // reset crop offsets to centre when a new image is loaded
    cropOffsetX = 0.5;
    cropOffsetY = 0.5;
    updateCanvasCursor();
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

// crop checkbox toggles visibility of crop ratio dropdown and canvas interactivity
cropCheckbox.addEventListener('change', () => {
  cropRatioSelect.style.display = cropCheckbox.checked ? 'inline-block' : 'none';
  // reset offsets to centre when crop is re‑enabled
  cropOffsetX = 0.5;
  cropOffsetY = 0.5;
  updateCanvasCursor();
  redrawPreview();
});

cropRatioSelect.addEventListener('change', () => {
  // reset offsets when ratio changes to avoid awkward crop positions
  cropOffsetX = 0.5;
  cropOffsetY = 0.5;
  redrawPreview();
});

divXInput.addEventListener('input', redrawPreview);
divYInput.addEventListener('input', redrawPreview);

// canvas drag events
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