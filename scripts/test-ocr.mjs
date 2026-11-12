import { readFile, writeFile } from 'node:fs/promises';
import { createWorker } from 'tesseract.js';

const fixtures = JSON.parse(await readFile(new URL('../src/fixtures.json', import.meta.url), 'utf8'));
const langPath = new URL('../node_modules/@tesseract.js-data/eng/4.0.0_best_int', import.meta.url);
const worker = await createWorker('eng', 1, { langPath: langPath.pathname, cacheMethod: 'none' });
const results = {};

try {
  for (const { id, ...fixture } of fixtures) {
    const image = await readFile(new URL(`../public/notices/${id}.png`, import.meta.url));
    const { data } = await worker.recognize(image);
    const raw = data.text.trim();
    const fields = Object.fromEntries(['date', 'time', 'room'].map((field) => {
      const line = raw.split('\n').find((text) => text.toLowerCase().startsWith(`${field}:`));
      const actual = line?.slice(field.length + 1).trim() || null;
      const correct = actual?.replace(/\s+/g, ' ').toLowerCase() === fixture[field].toLowerCase();
      return [field, { actual, correct }];
    }));
    results[id] = { raw, fields };
  }
} finally {
  await worker.terminate();
}

console.log(JSON.stringify(results, null, 2));
if (process.argv.includes('--write')) {
  await writeFile(new URL('../src/ocr-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
}
