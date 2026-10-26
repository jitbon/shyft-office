// Validates item designs: `npm run items:check <file.json>…` prints OK or the error codes per file.
import fs from 'node:fs';
import { validateItem } from '../shared/items';

/** Returns the error codes for one design file; empty when it is valid. */
export function checkFile(file: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return ['bad-item'];
  }
  const r = validateItem(json);
  return r.ok ? [] : r.errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: npm run items:check <file.json> [more.json…]');
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
