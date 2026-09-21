import { divergingColor } from './locationModel.js';

// Cesium's imagery loader decodes ImageBitmaps with flipY=true. A canvas,
// unlike an ImageBitmap, will be flipped again during WebGL texture upload.
// Restore top-down pixel order before returning a recolored canvas.
export function recolorMotionTile(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const color = divergingColor((pixels.data[i] / 255) * 60 - 30, 30);
    pixels.data[i] = color[0];
    pixels.data[i + 1] = color[1];
    pixels.data[i + 2] = color[2];
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
