import { build } from 'vite';
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const output = new URL('../.portable-build/', import.meta.url);
await build({
  mode: 'portable',
  base: './',
  build: {
    outDir: fileURLToPath(output),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: { output: { format: 'iife', codeSplitting: false } },
  },
});
const assetDir = new URL('assets/', output);
const assets = await readdir(assetDir);
const scripts = assets.filter(name => name.endsWith('.js'));
const styles = assets.filter(name => name.endsWith('.css'));
if (scripts.length !== 1 || styles.length !== 1) throw new Error('La compilación portátil debe producir un único script y estilo.');

const read = path => readFile(new URL(path, root), 'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(await read('public/icon.svg')).toString('base64');
const worker = await read('public/ocr/worker.min.js');
const core = await read('public/ocr/core/tesseract-core-lstm.wasm.js');
const model = (await readFile(new URL('public/ocr/spa.traineddata.gz', root))).toString('base64');
const notices = [];
for (const path of [
  'node_modules/tesseract.js/LICENSE',
  'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt',
  'node_modules/tesseract.js-core/LICENSE',
  'node_modules/@tesseract.js-data/spa/LICENSE',
]) {
  try { notices.push(`${path}\n${await read(path)}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const resources = JSON.stringify({ worker, core, model, notices }).replaceAll('<', '\\u003c');
const javascript = (await readFile(join(fileURLToPath(assetDir), scripts[0]), 'utf8'))
  .replaceAll('/icon.svg', icon).replace(/<\/script/gi, '<\\/script');
const css = await readFile(join(fileURLToPath(assetDir), styles[0]), 'utf8');
const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#143b36">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: data:; style-src 'unsafe-inline'; img-src blob: data:; worker-src blob:; connect-src blob: data:; base-uri 'none'; form-action 'none'">
<link rel="icon" href="${icon}"><title>Lorax ticket tracker</title>
<style>${css}</style></head><body>
<noscript>Para usar Lorax ticket tracker, ábrelo en Chrome con JavaScript habilitado.</noscript>
<div id="app"></div>
<script id="portable-ocr" type="application/json">${resources}</script>
<script>${javascript}</script></body></html>`;
const destination = new URL('lorax-ticket-tracker.html', root);
await writeFile(destination, html);
await rm(output, { recursive: true, force: true });
console.log(`Archivo autónomo: ${fileURLToPath(destination)} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB).`);
