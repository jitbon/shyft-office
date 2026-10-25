// A tiny Chrome DevTools driver for checking the office in a real browser (needs Google Chrome and the `ws` package).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch({ port = 9341, dpr = 1, width = 1280, height = 800 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shyft-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://localhost:${port}/json/version`); break; } catch { await sleep(200); }
  }
  const pages = [];
  async function page(url) {
    const t = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    let id = 0;
    const waiting = new Map();
    const frames = [];
    const consoleLines = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && waiting.has(m.id)) { const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
      else if (m.method === 'Network.webSocketFrameReceived') { try { frames.push(JSON.parse(m.params.response.payloadData)); } catch {} }
      else if (m.method === 'Runtime.consoleAPICalled') consoleLines.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
      else if (m.method === 'Runtime.exceptionThrown') consoleLines.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
    const p = {
      send, frames, consoleLines, width, height, dpr,
      async eval(expr) {
        const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async goto(u) { await send('Page.navigate', { url: u }); await sleep(900); },
      async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
      async key(code, key, mods = 0) {
        const down = { type: 'keyDown', code, key, modifiers: mods, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
        await send('Input.dispatchKeyEvent', down); await send('Input.dispatchKeyEvent', { ...down, type: 'keyUp' });
      },
      async mouse(type, x, y) { await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }); },
      async drag(a, b, steps = 6) {
        await p.mouse('mouseMoved', a[0], a[1]); await p.mouse('mousePressed', a[0], a[1]);
        for (let i = 1; i <= steps; i++) { await p.mouse('mouseMoved', a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps); await sleep(15); }
        await p.mouse('mouseReleased', b[0], b[1]); await sleep(80);
      },
      async click(x, y) { await p.mouse('mouseMoved', x, y); await p.mouse('mousePressed', x, y); await p.mouse('mouseReleased', x, y); await sleep(80); },
      /** The last welcome's session token, read from the WebSocket frames. */
      session() { return frames.filter((f) => f.t === 'welcome').at(-1)?.session; },
      async join(name) {
        await p.eval(`document.getElementById('name').value=${JSON.stringify(name)}; document.getElementById('joinForm').requestSubmit();`);
        for (let i = 0; i < 40 && !(await p.eval(`!document.getElementById('hud').hidden`)); i++) await sleep(150);
        await sleep(600);
      },
      /** Where a map tile is on screen, for a map at zoom k and a camera following (cx, cy) tiles. */
      tileXY(tx, ty, cx, cy, mapW, mapH, k = 2) {
        const s = 32 * k * 1, W = width * dpr, H = height * dpr;
        const camX = mapW * s <= W ? (mapW * s - W) / 2 : Math.min(Math.max(cx * s - W / 2, 0), mapW * s - W);
        const camY = mapH * s <= H ? (mapH * s - H) / 2 : Math.min(Math.max(cy * s - H / 2, 0), mapH * s - H);
        return [(Math.round(-camX) + (tx + 0.5) * s) / dpr, (Math.round(-camY) + (ty + 0.5) * s) / dpr];
      },
      close() { ws.close(); },
    };
    pages.push(p);
    if (url) await p.goto(url);
    return p;
  }
  return { page, close() { pages.forEach((p) => p.close()); try { process.kill(-proc.pid); } catch { proc.kill(); } } };
}

export async function api(base, token, method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'x-shyft-session': token, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
