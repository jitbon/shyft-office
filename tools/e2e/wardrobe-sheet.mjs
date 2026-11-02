// Draws a contact sheet of wardrobe options (4 directions x 4 walk frames, on a light and a dark floor) for review:
// `node tools/e2e/wardrobe-sheet.mjs out.png [kinds-or-ids,comma,separated] [http://localhost:3101/?arthash]`
// With no filter every option of every kind is drawn. A filter names kinds (hairStyle, face, top, bottom, shoes,
// accessory, outfit) and/or ids. Parts are shown on the default character; outfits once per color.
import fs from 'node:fs';
import { launch } from './cdp.mjs';

const out = process.argv[2] ?? 'wardrobe-sheet.png';
const only = (process.argv[3] ?? '').split(',').filter(Boolean);
const url = process.argv[4] ?? 'http://localhost:3101/?arthash';
const b = await launch({ port: Number(process.env.CHROME_PORT ?? 9362), width: 1400, height: 900 });
try {
  const page = await b.page(url);
  const data = await page.eval(`(() => {
    const { makeAvatar, CATALOG } = window.__shyftArt;
    const base = { shirt: '#3fa7d6', hair: '#2b1d14', skin: '#f1c27d' };
    const only = ${JSON.stringify(only)};
    const rows = [];
    for (const o of CATALOG) {
      if (only.length && !only.includes(o.kind) && !only.includes(o.id)) continue;
      const looks = o.kind === 'outfit' ? (o.colors ?? [undefined]).map((c) => ({ ...base, outfit: o.id, ...(c ? { outfitColor: c } : {}) }))
        : [{ ...base, [o.kind]: o.id, ...(o.kind === 'accessory' && o.colored ? { accessoryColor: '#e04f5f' } : {}) }];
      for (const look of looks) rows.push({ label: o.kind + ':' + o.id + (look.outfitColor ? ' ' + look.outfitColor : ''), look });
    }
    const S = 2, T = 32 * S, LAB = 170, N = 16;
    const c = document.createElement('canvas');
    c.width = LAB + N * T; c.height = rows.length * T * 2 + 4;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.font = '12px sans-serif';
    rows.forEach((r, i) => {
      const a = makeAvatar(r.look);
      [['#dcd6c8', '#222'], ['#2c2a33', '#eee']].forEach(([bg, fg], k) => {
        const y = (i * 2 + k) * T;
        g.fillStyle = bg; g.fillRect(0, y, c.width, T);
        g.fillStyle = fg; g.fillText(k === 0 ? r.label : '', 6, y + 20);
        ['down', 'up', 'right', 'left'].forEach((d, di) => a.frames[d].forEach((f, fi) => g.drawImage(f, LAB + (di * 4 + fi) * T, y, T, T)));
      });
    });
    return c.toDataURL('image/png');
  })()`);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`wrote ${out}`);
} finally {
  b.close();
}
