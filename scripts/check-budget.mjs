/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const manifestPath = path.join(dist, '.vite', 'manifest.json');
const initialBudgetKb = 170;
const engineBudgetKb = 260;
const chunkBudgetKb = 350;

if (!fs.existsSync(assets) || !fs.existsSync(manifestPath)) {
  console.error('FAIL: build output or Vite manifest is missing. Run the production build first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest).filter(([, value]) => value.isEntry);
if (entries.length !== 1) {
  console.error('FAIL: expected exactly one application entry; found ' + entries.length + '.');
  process.exit(1);
}

const byteCache = new Map();
function gzipBytes(file) {
  if (!byteCache.has(file)) {
    const absolute = path.join(dist, file);
    if (!fs.existsSync(absolute)) throw new Error('Manifest asset is missing: ' + file);
    byteCache.set(file, zlib.gzipSync(fs.readFileSync(absolute)).length);
  }
  return byteCache.get(file);
}

const initialFiles = new Set();
function collectStaticImports(key) {
  if (initialFiles.has(key)) return;
  initialFiles.add(key);
  const item = manifest[key];
  if (!item) throw new Error('Missing static import in Vite manifest: ' + key);
  for (const imported of item.imports ?? []) collectStaticImports(imported);
}
collectStaticImports(entries[0][0]);

const initialJs = [...initialFiles]
  .map((key) => manifest[key]?.file)
  .filter((file) => typeof file === 'string' && file.endsWith('.js'));
const initialGzipBytes = [...new Set(initialJs)].reduce((sum, file) => sum + gzipBytes(file), 0);
const initialKb = initialGzipBytes / 1024;

console.log('Arkvoid World · gzipped production bundle budgets');
console.log('Initial static JS: ' + initialKb.toFixed(2) + ' KB / ' + initialBudgetKb + ' KB ' + (initialKb <= initialBudgetKb ? 'PASS' : 'FAIL'));

let failed = initialKb > initialBudgetKb;
const jsFiles = fs.readdirSync(assets).filter((file) => file.endsWith('.js'));
for (const file of jsFiles) {
  const relative = path.posix.join('assets', file);
  if (initialJs.includes(relative)) continue;

  const sizeKb = gzipBytes(relative) / 1024;
  const engineChunk = /^(?:three|engine-core)-/.test(file);
  const limitKb = engineChunk ? engineBudgetKb : chunkBudgetKb;
  const label = engineChunk ? 'engine-core' : 'feature';
  const status = sizeKb <= limitKb ? 'PASS' : 'FAIL';
  console.log(status + ' ' + label.padEnd(12) + ' ' + file.padEnd(40) + ' ' + sizeKb.toFixed(2) + ' KB / ' + limitKb + ' KB');
  if (sizeKb > limitKb) failed = true;
}

if (failed) {
  console.error('FAIL: one or more production JavaScript budgets were exceeded.');
  process.exit(1);
}
console.log('PASS: production JavaScript bundle budgets satisfied.');
