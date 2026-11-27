#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BUCKET = 'scrobbl-photos';
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const IMAGE_EXTENSIONS = new Map([
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
]);

const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const dirArg = args.find((arg) => !arg.startsWith('--'));
if (!dirArg) {
  console.error('Usage: npm run upload-photos -- <photos-dir> [--local]');
  process.exit(1);
}
const rootDir = path.resolve(process.cwd(), dirArg);

if (!fs.existsSync(rootDir)) {
  console.error(`Directory not found: ${rootDir}`);
  process.exit(1);
}

const files = [];
for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !MONTH_KEY_RE.test(entry.name)) continue;
  const monthDir = path.join(rootDir, entry.name);
  for (const file of fs.readdirSync(monthDir, { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const ext = path.extname(file.name).toLowerCase();
    const contentType = IMAGE_EXTENSIONS.get(ext);
    if (!contentType) continue;
    files.push({
      key: `${entry.name}/${file.name}`,
      filePath: path.join(monthDir, file.name),
      contentType,
    });
  }
}

files.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

if (files.length === 0) {
  console.log(`No images found under ${rootDir}/YYYY-MM/.`);
  process.exit(0);
}

const targetFlag = isLocal ? '--local' : '--remote';
console.log(`Uploading ${files.length} photo(s) to R2 bucket "${BUCKET}" (${targetFlag})...`);

for (const { key, filePath, contentType } of files) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${key}`,
      `--file=${filePath}`,
      `--content-type=${contentType}`,
      targetFlag,
    ],
    { stdio: 'inherit' }
  );
}

console.log(`Done! Uploaded ${files.length} photo(s).`);
