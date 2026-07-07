//   js/imageUtils.js
//   Image loading and cropping utilities

/**
 * Load an image from a File object
 * 
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export const loadImage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (JPEG or PNG).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
};

/**
 * Crop an image to the given aspect ratio
 * By default the crop is centred; offsetX and offsetY (0‑1) control the
 * position of the crop rectangle (0 = left/top, 1 = right/bottom)
 * Boundaries are automatically clamped so the crop rectangle stays inside the image
 *
 * @param {HTMLImageElement} img
 * @param {string} ratio - '1:1', '4:3', etc.
 * @param {number} [offsetX=0.5] - Horizontal offset fraction (0‑1)
 * @param {number} [offsetY=0.5] - Vertical offset fraction (0‑1)
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number }}
 */
export const cropImage = (img, ratio = '1:1', offsetX = 0.5, offsetY = 0.5) => {
  const { naturalWidth: w, naturalHeight: h } = img;

  let targetRatio;
  if (ratio === '1:1') targetRatio = 1;
  else if (ratio === '4:3') targetRatio = 4 / 3;
  else targetRatio = 1; // fallback

  const currentRatio = w / h;
  let cropW, cropH, maxStartX, maxStartY;

  if (currentRatio > targetRatio) {
    // image wider than target → crop sides
    cropH = h;
    cropW = Math.round(h * targetRatio);
  } else {
    // image taller or equal → crop top/bottom
    cropW = w;
    cropH = Math.round(w / targetRatio);
  }

  maxStartX = Math.max(0, w - cropW);
  maxStartY = Math.max(0, h - cropH);

  // compute starting positions from offsets (clamped to valid range)
  const startX = Math.min(Math.max(0, Math.round(offsetX * maxStartX)), maxStartX);
  const startY = Math.min(Math.max(0, Math.round(offsetY * maxStartY)), maxStartY);

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

  return { canvas, width: cropW, height: cropH };
};

/**
 * Scale image dimensions to fit within a maximum width while maintaining aspect ratio
 * 
 * @param {number} width
 * @param {number} height
 * @param {number} maxWidth
 * @returns {{ width: number, height: number }}
 */
export const scaleToFit = (width, height, maxWidth = 900) => {
  if (width <= maxWidth) return { width, height };
  const ratio = maxWidth / width;
  return { width: maxWidth, height: Math.round(height * ratio) };
};