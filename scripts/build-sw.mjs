import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../dist/', import.meta.url);
const paths = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => join(entry.parentPath, entry.name));
const assetPath = path => '/' + relative(fileURLToPath(root), path).split(sep).join('/');
const hash = createHash('sha256');
for (const path of paths.sort()) {
  hash.update(assetPath(path));
  hash.update(await readFile(path));
}
const assets = paths.map(assetPath);
const template = await readFile(new URL('../src/sw.js', import.meta.url), 'utf8');
await writeFile(new URL('sw.js', root), template
  .replace('__CACHE_VERSION__', hash.digest('hex').slice(0, 16))
  .replace('__ASSET_LIST__', JSON.stringify(assets)));
console.log(`Offline: ${assets.length} recursos, incluidos OCR y modelo local.`);
