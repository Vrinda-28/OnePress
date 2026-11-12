import { createWorker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import corePath from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import englishModel from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url';

export const defaultAdjustments = { rotation: 0, contrast: 1, crop: 0 };

export async function prepareImage(source, adjustments = defaultAdjustments) {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const margin = adjustments.crop / 100;
    const width = image.naturalWidth * (1 - 2 * margin);
    const height = image.naturalHeight * (1 - 2 * margin);
    const scale = Math.min(1, 2400 / Math.max(width, height));
    const sideways = adjustments.rotation % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((sideways ? height : width) * scale);
    canvas.height = Math.round((sideways ? width : height) * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(adjustments.rotation * Math.PI / 180);
    ctx.filter = 'contrast(' + adjustments.contrast + ')';
    ctx.drawImage(image, image.naturalWidth * margin, image.naturalHeight * margin,
      width, height, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not prepare this image.')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function scanImage(image, onProgress, signal) {
  let worker;
  let timer;
  let abort;
  let finished = false;
  const started = performance.now();
  try {
    const result = await Promise.race([
      (async () => {
        worker = await createWorker('eng', 1, {
          workerPath: new URL(workerPath, document.baseURI).href,
          corePath: new URL(corePath, document.baseURI).href,
          langPath: new URL('.', new URL(englishModel, document.baseURI)).href.replace(/\/$/, ''),
          workerBlobURL: false,
          logger: ({ status, progress }) => onProgress(status, progress),
          errorHandler: () => {},
        });
        if (signal.aborted || finished) {
          await worker.terminate();
          throw new DOMException('Scan cancelled.', 'AbortError');
        }
        const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
        return {
          raw: data.text.trim(),
          confidence: data.confidence,
          seconds: (performance.now() - started) / 1000,
          words: (data.blocks ?? []).flatMap((block) => block.paragraphs ?? [])
            .flatMap((paragraph) => paragraph.lines ?? []).flatMap((line) => line.words ?? [])
            .map(({ text, confidence, bbox }) => ({ text, confidence, bbox })),
        };
      })(),
      new Promise((_, reject) => {
        abort = () => reject(new DOMException('Scan cancelled.', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        timer = setTimeout(() => reject(new Error('The scan took too long. Try again with a smaller, clearer photo.')), 120000);
      }),
    ]);
    return result;
  } finally {
    finished = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    await worker?.terminate();
  }
}
