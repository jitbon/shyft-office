import type { ClientMsg, PlayerStatus, ServerMsg, StatusKind } from '../shared/protocol';
import { MAX_STATUS_TEXT } from '../shared/status';
import { notice } from './office-ui';
import { statusColor } from './types';

export interface StatusDeps {
  send(msg: ClientMsg): void;
  /** Your status right now. */
  current(): PlayerStatus;
  /** Make a new status take effect here (devices off in Do Not Disturb, indicators, and so on). */
  apply(status: PlayerStatus): void;
}

const LABELS: Record<StatusKind, string> = { available: 'Available', busy: 'Busy', dnd: 'Do Not Disturb' };
const DURATIONS = [{ minutes: 0, label: 'Until I change it' }, { minutes: 15, label: '15 minutes' }, { minutes: 30, label: '30 minutes' }, { minutes: 45, label: '45 minutes' }];

let deps: StatusDeps | null = null;
let draftKind: StatusKind = 'available';
/** Closes the status panel (set up in `initStatus`). */
let hideStatusPanel: () => void = () => {};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initStatus(d: StatusDeps) {
  deps = d;
  const btn = $<HTMLButtonElement>('statusBtn');
  const panel = $('statusPanel');
  // Hovering the button opens the panel; moving away closes it after a moment. Clicking pins it open (and again to close), so it
  // also works without a hover (a touch screen) and while typing a note.
  let pinned = false;
  let timer = 0;
  const open = () => {
    clearTimeout(timer);
    if (!panel.hidden) return;
    panel.hidden = false;
    draftKind = d.current().kind;
    renderPanel();
  };
  const close = () => {
    clearTimeout(timer);
    pinned = false;
    panel.hidden = true;
    btn.classList.remove('on');
  };
  const closeSoon = () => {
    clearTimeout(timer);
    if (pinned) return;
    timer = window.setTimeout(() => {
      const busy = btn.matches(':hover') || panel.matches(':hover') || panel.contains(document.activeElement);
      if (!pinned && !busy) close();
    }, 300);
  };
  btn.onmouseenter = open;
  btn.onmouseleave = closeSoon;
  panel.onmouseenter = () => clearTimeout(timer);
  panel.onmouseleave = closeSoon;
  btn.onclick = () => {
    if (panel.hidden) {
      open();
      pinned = true;
    } else if (pinned) close();
    else pinned = true; // opened by hover: keep it
    btn.classList.toggle('on', !panel.hidden);
    btn.blur();
  };
  hideStatusPanel = close;
  // Ctrl+U (⌘+U on a Mac) flips Do Not Disturb, as in Gather. Browsers use it for "view source", so we claim it.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyU' || e.repeat) return;
    e.preventDefault();
    toggleDnd();
  }, true);
  refreshStatusUi();
}

/** Sets and announces a status. Minutes of 0 mean no time limit. */
export function setStatus(kind: StatusKind, text = '', minutes = 0) {
  if (!deps) return;
  const status: PlayerStatus = { kind };
  const clean = text.trim().slice(0, MAX_STATUS_TEXT);
  if (clean) status.text = clean;
  if (minutes > 0) status.until = Date.now() + minutes * 60_000;
  deps.send({ t: 'status', ...status });
  deps.apply(status);
  if (kind === 'dnd') notice('Do Not Disturb is on: your mic and camera are off, and no one can start a conversation with you.', { key: 'dnd', ttlMs: 4500 });
}

export function toggleDnd() {
  if (deps) setStatus(deps.current().kind === 'dnd' ? 'available' : 'dnd');
}

/** Redraws the status button and, if open, the panel. Call whenever your status changes. */
export function refreshStatusUi() {
  if (!deps) return;
  const s = deps.current();
  const btn = $('statusBtn');
  btn.textContent = '';
  const dot = document.createElement('i');
  dot.className = 'dot';
  dot.style.background = statusColor(s);
  btn.append(dot, document.createTextNode(s.kind === 'available' ? 'Status' : LABELS[s.kind]));
  renderPanel();
}

function renderPanel() {
  const panel = $('statusPanel');
  if (panel.hidden || !deps) return;
  panel.replaceChildren(Object.assign(document.createElement('div'), { className: 'head', textContent: 'Your status' }));

  const kinds = document.createElement('div');
  kinds.className = 'kinds';
  for (const kind of Object.keys(LABELS) as StatusKind[]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.classList.toggle('on', draftKind === kind);
    const dot = document.createElement('i');
    dot.className = 'dot';
    dot.style.background = statusColor({ kind });
    b.append(dot, document.createTextNode(LABELS[kind]));
    b.onclick = () => {
      draftKind = kind;
      for (const other of kinds.children) other.classList.toggle('on', other === b);
    };
    kinds.append(b);
  }
  panel.append(kinds);

  const text = Object.assign(document.createElement('input'), {
    maxLength: MAX_STATUS_TEXT,
    placeholder: 'What are you up to? (optional)',
    value: deps.current().text ?? '',
  });
  const when = document.createElement('select');
  for (const d of DURATIONS) when.append(Object.assign(document.createElement('option'), { value: String(d.minutes), textContent: d.label }));
  const set = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Set status' });
  set.onclick = () => {
    setStatus(draftKind, text.value, Number(when.value));
    hideStatusPanel();
  };
  panel.append(text, when, set);
}

/**
 * Rings and waves. Returns true when the message was one of those, so the caller can skip the
 * generic notice handling.
 */
export function handleSocialNotify(msg: Extract<ServerMsg, { t: 'notify' }>): boolean {
  if (!deps) return false;
  const send = deps.send;
  const from = msg.from;
  if (msg.kind === 'ring' && from) {
    notice(`${msg.text ?? 'Someone'} is ringing you`, {
      key: `ring:${from}`,
      ttlMs: 30_000,
      buttons: [
        { label: 'Accept', onClick: () => send({ t: 'ringReply', from, accept: true }) },
        { label: 'Decline', onClick: () => send({ t: 'ringReply', from, accept: false }) },
      ],
    });
    return true;
  }
  if (msg.kind === 'ringResult') {
    notice(msg.ok ? 'They are on their way.' : msg.text ?? 'They are not coming over.', { ttlMs: 3500 });
    return true;
  }
  if (msg.kind === 'wave' && from) {
    notice(`${msg.text ?? 'Someone'} waved ${msg.reply ? 'back ' : ''}to you`, {
      key: `wave:${from}`,
      ttlMs: 8000,
      buttons: msg.reply ? [] : [{ label: 'Wave back', onClick: () => send({ t: 'wave', to: from, reply: true }) }],
    });
    return true;
  }
  return false;
}
