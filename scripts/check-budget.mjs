/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distAssetsDir = path.resolve(__dirname, '../dist/assets');

if (!fs.existsSync(distAssetsDir)) {
  console.error('Error: dist/assets not found. Please run "npm run build" first.');
  process.exit(1);
}

const files = fs.readdirSync(distAssetsDir);
const jsFiles = files.filter((f) => f.endsWith('.js'));

console.log('------------------------------------------------------------');
console.log('Arkvoid Performance Budget Check (gzipped chunk sizes)');
console.log('------------------------------------------------------------');

const INITIAL_JS_BUDGET_KB = 200.0;
const WORLD_CHUNK_BUDGET_KB = 850.0;

let failed = false;

for (const file of jsFiles) {
  const fullPath = path.join(distAssetsDir, file);
  const rawContent = fs.readFileSync(fullPath);
  const rawBytes = rawContent.length;
  const gzippedBytes = zlib.gzipSync(rawContent).length;
  const gzippedKb = Math.round((gzippedBytes / 1024) * 100) / 100;
  const rawKb = Math.round((rawBytes / 1024) * 100) / 100;

  let limitKb = null;
  let label = 'Chunk';

  if (file.startsWith('index-')) {
    limitKb = INITIAL_JS_BUDGET_KB;
    label = 'Initial JS (Entry)';
  } else if (file.startsWith('world-')) {
    limitKb = WORLD_CHUNK_BUDGET_KB;
    label = 'World Chunk (3D Engine)';
  }

  const status = limitKb ? (gzippedKb <= limitKb ? 'PASS' : 'FAIL') : 'OK';
  if (limitKb && gzippedKb > limitKb) {
    failed = true;
  }

  const budgetStr = limitKb ? `[Budget: ≤ ${limitKb} KB]` : '';
  console.log(
    ` ${status.padEnd(5)} | ${label.padEnd(24)} | ${file.padEnd(30)} | ` +
      `Raw: ${rawKb.toFixed(1).padStart(7)} KB | Gzip: ${gzippedKb.toFixed(1).padStart(6)} KB ${budgetStr}`,
  );
}

console.log('------------------------------------------------------------');

if (failed) {
  console.error('FAIL: One or more chunks exceeded their performance budget.');
  process.exit(1);
} else {
  console.log('PASS: All chunks are well within performance budgets.');
  process.exit(0);
}
