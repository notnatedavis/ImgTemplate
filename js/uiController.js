//   js/uiController.js
//   DOM manipulation, event wiring, and the HSL colour picker

// ----- Imports -----
import { loadImage, cropImage, scaleToFit } from './imageUtils.js';
import { drawGrid } from './gridOverlay.js';
import { downloadCanvas } from './downloadHelper.js';

// ----- State -----
let originalImage = null;          // HTMLImageElement
let currentCropCanvas = null;      // HTMLCanvasElement from crop (or null)
let currentCropDim = { width: 0, height: 0 };

// ----- DOM references -----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlsDiv = document.getElementById('controls');
const previewCanvas = document.getElementById('preview-canvas');
const errorMsg = document.getElementById('error-message');
const downloadBtn = document.getElementById('download-btn');
const cropRatioSelect = document.getElementById('crop-ratio');
const divXInput = document.getElementById('divisions-x');
const divYInput = document.getElementById('divisions-y');
const hslContainer = document.getElementById('hsl-picker-container');

// ----- HSL Colour Picker (custom) -----
let gridColor = { h: 0, s: 100, l: 50 };  // default red

const createHSLColorPicker = (container) => {
  container.innerHTML = '';

  const pickerDiv = document.createElement('div');
  pickerDiv.className = 'hsl-picker';

  const createSlider = (label, min, max, value, property, gradientFn) => {
    const row = document.createElement('div');
    row.className = 'hsl-slider-row';

    const badge = document.createElement('span');
    badge.className = 'hsl-slider-badge';
    badge.textContent = label;
    row.appendChild(badge);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.className = 'hsl-slider';
    slider.setAttribute('aria-label', `Grid colour ${property}`);

    const updateSliderStyle = () => {
      slider.style.background = gradientFn();
      slider.style.setProperty('--thumb-color', `hsl(${gridColor.h}, ${gridColor.s}%, ${gridColor.l}%)`);
    };

    slider.addEventListener('input', (e) => {
      gridColor[property] = Number(e.target.value);
      updateSliderStyle();
      swatch.style.backgroundColor = `hsl(${gridColor.h}, ${gridColor.s}%, ${gridColor.l}%)`;
      redrawPreview();
    });

    updateSliderStyle();
    row.appendChild(slider);
    return row;
  };

  // Hue gradient
  const hueGradient = () => `linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))`;
  const satGradient = () => `linear-gradient(to right, hsl(${gridColor.h},0%,${gridColor.l}%), hsl(${gridColor.h},100%,${gridColor.l}%))`;
  const lightGradient = () => `linear-gradient(to right, hsl(${gridColor.h},${gridColor.s}%,0%), hsl(${gridColor.h},${gridColor.s}%,50%), hsl(${gridColor.h},${gridColor.s}%,100%))`;

  pickerDiv.appendChild(createSlider('H', 0, 360, gridColor.h, 'h', hueGradient));
  pickerDiv.appendChild(createSlider('S', 0, 100, gridColor.s, 's', satGradient));
  pickerDiv.appendChild(createSlider('L', 0, 100, gridColor.l, 'l', lightGradient));

  // Colour swatch
  const swatchRow = document.createElement('div');
  swatchRow.style.display = 'flex';
  swatchRow.style.alignItems = 'center';
  swatchRow.style.gap = '0.5rem';

  const swatchLabel = document.createElement('span');
  swatchLabel.textContent = 'Preview:';
  swatchLabel.style.fontSize = '0.75rem';
  swatchRow.appendChild(swatchLabel);

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.backgroundColor = `hsl(${gridColor.h}, ${gridColor.s}%, ${gridColor.l}%)`;
  swatchRow.appendChild(swatch);

  pickerDiv.appendChild(swatchRow);
  container.appendChild(pickerDiv);

  // Store swatch reference for updates
  return swatch;
};

let swatchElement = null;

// ----- Preview redraw -----
const redrawPreview = () => {
  if (!originalImage) return;

  const ratio = cropRatioSelect.value;
  const { canvas: cropCanvas, width, height } = cropImage(
    originalImage,
    ratio === 'original' ? originalImage : ratio   // pass original image for 'original' case
  );

  // Fallback if crop returns null canvas (original ratio)
  const sourceCanvas = cropCanvas || (() => {
    const c = document.createElement('canvas');
    c.width = originalImage.naturalWidth;
    c.height = originalImage.naturalHeight;
    c.getContext('2d').drawImage(originalImage, 0, 0);
    return c;
  })();

  currentCropCanvas = sourceCanvas;
  currentCropDim = { width: sourceCanvas.width, height: sourceCanvas.height };

  // Scale to fit preview
  const scaled = scaleToFit(currentCropDim.width, currentCropDim.height, 800);
  previewCanvas.width = scaled.width;
  previewCanvas.height = scaled.height;

  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, scaled.width, scaled.height);
  ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);

  // Draw grid
  const divX = parseInt(divXInput.value, 10) || 0;
  const divY = parseInt(divYInput.value, 10) || 0;
  const colorStr = `hsl(${gridColor.h}, ${gridColor.s}%, ${gridColor.l}%)`;
  drawGrid(ctx, scaled.width, scaled.height, divX, divY, colorStr);

  downloadBtn.disabled = false;
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
    // Initialize HSL picker if not yet created
    if (!swatchElement) {
      swatchElement = createHSLColorPicker(hslContainer);
    }
    redrawPreview();
  } catch (err) {
    showError(err.message);
  }
};

// Drop zone events
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

// Control changes → redraw
cropRatioSelect.addEventListener('change', redrawPreview);
divXInput.addEventListener('input', redrawPreview);
divYInput.addEventListener('input', redrawPreview);

// Download
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