// Validates avatar sheets: `npm run sprites:check <file.png>…`
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { validateSheet, validateSidecar } from '../shared/sprites';

/** Returns the error codes for one sheet and its optional sidecar; empty when it is valid. */
export function checkFile(file: string): string[] {
  const id = path.basename(file, path.extname(file));
  const bytes = fs.readFileSync(file);

  const errors: string[] = [];
  let png: PNG | null = null;
  try {
    png = PNG.sync.read(bytes);
  } catch {
    errors.push('not-png');
  }
  if (png) {
    const sheet = validateSheet(png.data, png.width, png.height, bytes.length);
    if (!sheet.ok) errors.push(...sheet.errors);
  }

  const sidecarPath = path.join(path.dirname(file), `${id}.json`);
  let sidecar: unknown;
  if (fs.existsSync(sidecarPath)) {
    try {
      sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    } catch {
      errors.push('bad-sidecar');
    }
  }
  if (!errors.includes('bad-sidecar')) {
    const meta = validateSidecar(sidecar, id);
    if (!meta.ok) errors.push(...meta.errors);
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: npm run sprites:check <file.png> [more.png…]');
    process.exit(1);
  }
  let failed = false;
  for (const file of files) {
    const errors = fs.existsSync(file) ? checkFile(file) : ['not-found'];
    if (errors.length) failed = true;
    console.log(errors.length ? `${file}: ${errors.join(', ')}` : `OK ${file}`);
  }
  process.exit(failed ? 1 : 0);
}
