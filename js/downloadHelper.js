//   js/downloadHelper.js
//   Triggers download of a canvas as PNG

/**
 * Download the current canvas content as a PNG file.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename
 */
export const downloadCanvas = (canvas, filename = 'imgTemplate_output.png') => {
  try {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Download failed:', err);
    throw new Error('Unable to download image. Your browser may not support this feature.');
  }
};