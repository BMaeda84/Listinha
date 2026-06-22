/**
 * Detecta movimento entre dois frames usando diferença de pixels.
 * Retorna true se o movimento detectado superar o threshold.
 */
export function detectMotion(prevCanvas, currCanvas, threshold = 20, sampleRate = 8) {
  const ctx1 = prevCanvas.getContext('2d');
  const ctx2 = currCanvas.getContext('2d');
  const w = prevCanvas.width;
  const h = prevCanvas.height;

  const data1 = ctx1.getImageData(0, 0, w, h).data;
  const data2 = ctx2.getImageData(0, 0, w, h).data;

  let diff = 0;
  let samples = 0;

  // Amostragem esparsa para performance (a cada sampleRate pixels)
  for (let i = 0; i < data1.length; i += 4 * sampleRate) {
    const dr = Math.abs(data1[i] - data2[i]);
    const dg = Math.abs(data1[i + 1] - data2[i + 1]);
    const db = Math.abs(data1[i + 2] - data2[i + 2]);
    diff += (dr + dg + db) / 3;
    samples++;
  }

  return samples > 0 ? (diff / samples) > threshold : false;
}

/**
 * Calcula nitidez da imagem via variância Laplaciana simplificada.
 * Retorna false se a imagem estiver desfocada (abaixo do threshold).
 */
export function isSharp(canvas, threshold = 8) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // Kernel Laplaciano 3x3: detecta bordas (regiões nítidas têm mais bordas)
  let sum = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y += 4) {
    for (let x = 1; x < w - 1; x += 4) {
      const idx = (y * w + x) * 4;
      // Usa canal verde como proxy de luminância
      const center = data[idx + 1];
      const up = data[((y - 1) * w + x) * 4 + 1];
      const down = data[((y + 1) * w + x) * 4 + 1];
      const left = data[(y * w + (x - 1)) * 4 + 1];
      const right = data[(y * w + (x + 1)) * 4 + 1];
      const lap = Math.abs(4 * center - up - down - left - right);
      sum += lap;
      count++;
    }
  }

  return count > 0 ? (sum / count) > threshold : false;
}

/**
 * Captura frame atual do <video> em um <canvas> e retorna base64 JPEG.
 */
export function captureFrame(videoEl, quality = 0.8) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0);
  // Remove o prefixo "data:image/jpeg;base64,"
  return {
    canvas,
    base64: canvas.toDataURL('image/jpeg', quality).split(',')[1],
  };
}
