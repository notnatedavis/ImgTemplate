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
 * Crop an image to the given aspect ratio (centred crop)
 * 
 * @param {HTMLImageElement} img
 * @param {string} ratio - 'original', '1:1', '4:3'
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number }}
 */
export const cropImage = (img, ratio = 'original') => {
  const { naturalWidth: w, naturalHeight: h } = img;

  if (ratio === 'original') {
    return { canvas: null, width: w, height: h };
  }

  let targetRatio;
  if (ratio === '1:1') targetRatio = 1;
  else if (ratio === '4:3') targetRatio = 4 / 3;
  else targetRatio = 1; // fallback

  const currentRatio = w / h;
  let cropW, cropH, startX, startY;

  if (currentRatio > targetRatio) {
    // image wider than target -> crop sides
    cropH = h;
    cropW = h * targetRatio;
    startX = (w - cropW) / 2;
    startY = 0;
  } else {
    // image taller than target -> crop top/bottom
    cropW = w;
    cropH = w / targetRatio;
    startX = 0;
    startY = (h - cropH) / 2;
  }

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