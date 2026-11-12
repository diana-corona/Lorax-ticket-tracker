import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'public/ocr');
const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const data = dirname(require.resolve('@tesseract.js-data/spa/package.json'));

await mkdir(join(target, 'core'), { recursive: true });
await copyFile(join(tesseract, 'dist/worker.min.js'), join(target, 'worker.min.js'));
for (const name of await readdir(core)) {
  if (/^tesseract-core(?:-simd)?-lstm\.wasm(?:\.js)?$/.test(name)) {
    await copyFile(join(core, name), join(target, 'core', name));
  }
}
await copyFile(join(data, '4.0.0_best_int/spa.traineddata.gz'), join(target, 'spa.traineddata.gz'));
console.log('OCR local preparado: worker, WebAssembly y modelo en español.');
