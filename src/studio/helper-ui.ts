// The studio's side of the item helper: what the server said about it, the request, and the plain messages when it
// does not work out. The service is the server's business; the browser only ever calls this server.
import { session } from '../session';
import type { Design } from './model';

export type HelperStatus = 'off' | 'unavailable' | 'on';

/** What the server last said; undefined for a guest, who never hears about the helper. */
let status: HelperStatus | undefined;
const listeners: (() => void)[] = [];

/** With `unavailable`: a service is set up but just failed. */
let cooling = false;

export const helperStatus = () => status;
export const helperCooling = () => cooling;
export function setHelperStatus(s: HelperStatus | undefined, isCooling = false) {
  if (s === status && isCooling === cooling) return;
  status = s;
  cooling = isCooling;
  listeners.forEach((fn) => fn());
}
export const onHelperStatus = (fn: () => void) => void listeners.push(fn);

export const MAX_TEXT = 500;
export const MAX_IMAGE = 2 * 1024 * 1024;
const NOTE_KEY = 'shyft.helperNote';

/** Whether this member has read the note about where their words go. Kept in this browser only. */
export function noteRead(): boolean {
  try {
    return localStorage.getItem(NOTE_KEY) === '1';
  } catch {
    return false;
  }
}
export function markNoteRead() {
  try {
    localStorage.setItem(NOTE_KEY, '1');
  } catch {
    /* private window: the note shows again next time */
  }
}

export type DraftOutcome = { design: Design } | { message: string; cancelled?: boolean };

const toBase64 = (buf: ArrayBuffer) => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Asks the server for a draft from words and/or a picture. `signal` cancels it; nothing is kept anywhere when it does. */
export async function requestDraft(text: string, image: File | null, signal: AbortSignal): Promise<DraftOutcome> {
  if (!text.trim() && !image) return { message: 'Describe what you want, or choose a picture.' };
  if (text.length > MAX_TEXT) return { message: `Use at most ${MAX_TEXT} characters.` };
  if (image && image.type !== 'image/png' && image.type !== 'image/jpeg') return { message: 'The picture must be a PNG or a JPEG.' };
  if (image && image.size > MAX_IMAGE) return { message: 'The picture is over 2 MB.' };
  let res: Response;
  try {
    const body = JSON.stringify({
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(image ? { image: { type: image.type, data: toBase64(await image.arrayBuffer()) } } : {}),
    });
    res = await fetch('/api/studio/helper', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-shyft-session': session.token }, body });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { message: 'Cancelled.', cancelled: true };
    return { message: 'The helper didn’t answer. Nothing was changed. Try again.' };
  }
  let json: { design?: Design; message?: string; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  if (res.status === 200 && json.design) return { design: json.design };
  if (json.message) return { message: json.message };
  if (res.status === 403) return { message: json.error === 'helper-off' ? 'The helper is switched off.' : 'You can’t use the helper.' };
  if (res.status === 429) return { message: 'Wait a moment before asking again.' };
  if (res.status === 400) return { message: 'That request can’t be used. Check the words and the picture.' };
  return { message: 'The helper didn’t answer. Nothing was changed. Try again.' };
}
