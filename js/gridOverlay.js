//   js/gridOverlay.js
//   Draws equally spaced grid lines on a canvas context

/**
 * Draw horizontal and vertical grid lines
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} divX - number of horizontal divisions (0 = no lines)
 * @param {number} divY - number of vertical divisions (0 = no lines)
 * @param {string} color - CSS colour string
 * @param {number} thickness - line width in pixels (default 1)
 */
export const drawGrid = (ctx, width, height, divX = 7, divY = 7, color = '#ff0000', thickness = 1) => {
  if (divX < 0 || divY < 0 || thickness <= 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;

  // Horizontal lines (rows)
  if (divY > 0) {
    const rowStep = height / (divY + 1);
    for (let i = 1; i <= divY; i++) {
      const y = Math.round(i * rowStep);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // Vertical lines (columns)
  if (divX > 0) {
    const colStep = width / (divX + 1);
    for (let i = 1; i <= divX; i++) {
      const x = Math.round(i * colStep);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  ctx.restore();
};