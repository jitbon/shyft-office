// Validates custom object sheets: `npm run objects:check <file.png>…` (each next to its <name>.json)
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { OBJECT_ID_RE, validateObjectMeta, validateObjectSheet } from '../shared/objects';

/** Returns the error codes for one sheet and the description next to it; empty when it is valid. */
export function checkFile(file: string): string[] {
  const id = path.basename(file, path.extname(file));
  const errors: string[] = [];
  if (!OBJECT_ID_RE.test(id)) errors.push('bad-id');
  const bytes = fs.readFileSync(file);

  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(path.join(path.dirname(file), `${id}.json`), 'utf8'));
  } catch {
    return [...errors, 'bad-meta'];
  }
  const meta = validateObjectMeta(json);
  if (!meta.ok) return [...errors, ...meta.errors];

  let png: PNG;
  try {
    png = PNG.sync.read(bytes);
  } catch {
    return [...errors, 'not-png'];
  }
  const sheet = validateObjectSheet(png.data, png.width, png.height, bytes.length, meta.meta);
  if (!sheet.ok) errors.push(...sheet.errors);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: npm run objects:check <file.png> [more.png…]');
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
