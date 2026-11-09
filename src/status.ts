import type { ClientMsg, PlayerStatus, ServerMsg, StatusId } from '../shared/protocol';
import {
  MAX_STATUS_TEXT,
  STATUS_IDS,
  STATUS_PRESETS,
  limitUntil,
  nextMorning,
  pushRecent,
  statusIcon,
  statusId,
  statusLabel,
  type RecentStatus,
} from '../shared/status';
import { notice } from './office-ui';
import { statusBadge } from './status-badge';
export { statusBadge };
import { readLocal, writeLocal } from './storage';
import { statusColor } from './types';

export interface StatusDeps {
  send(msg: ClientMsg): void;
  /** Your status right now. */
  current(): PlayerStatus;
  /** Make a new status take effect here (devices off in Do Not Disturb, indicators, and so on). */
  apply(status: PlayerStatus, opts?: { byMe?: boolean }): void;
  /** Another person's status, for the badge on their ring and wave notices. */
  statusOf?(id: string): PlayerStatus | undefined;
}

const STORE_KEY = 'shyft.status.v1';
const EMOJI = ['😀', '🙂', '😎', '🤔', '😴', '🤒', '🎉', '👍', '🙏', '💪', '🔥', '✨', '📞', '💻', '📝', '📚', '🍜', '🍕', '🥗', '☕', '🚶', '🏠', '🚗', '🌴'];
/** Customize's time-limit choices; 'morning' is 08:00 the next day. */
const DURATIONS: { value: string; label: string }[] = [
  { value: '0', label: 'Until I change it' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: 'morning', label: 'Until tomorrow morning' },
];

interface StoredPrefs {
  autoMeeting: boolean;
  recent: RecentStatus[];
}

/** This device's status settings and recent statuses; defaults when unreadable. */
export function statusPrefs(): StoredPrefs {
  const out: StoredPrefs = { autoMeeting: true, recent: [] };
  try {
    const raw = JSON.parse(readLocal(STORE_KEY) ?? 'null') as Partial<StoredPrefs> | null;
    if (typeof raw?.autoMeeting === 'boolean') out.autoMeeting = raw.autoMeeting;
    if (Array.isArray(raw?.recent)) {
      out.recent = raw.recent
        .filter((r): r is RecentStatus => !!r && typeof r === 'object' && typeof (r as RecentStatus).kind === 'string')
        .slice(0, 3);
    }
  } catch {
    /* defaults */
  }
  return out;
}
const savePrefs = (p: StoredPrefs) => writeLocal(STORE_KEY, JSON.stringify(p));

let deps: StatusDeps | null = null;
/** What Customize will set: filled by picking a status while it is open. */
let draft: { id: StatusId; text: string; emoji: string; minutes: string } = { id: 'available', text: '', emoji: '', minutes: '0' };
let customizeOpen = false;
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
    const cur = d.current();
    draft = { id: statusId(cur), text: cur.text ?? '', emoji: cur.emoji ?? '', minutes: '0' };
    customizeOpen = false;
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
  // "· 42m" on the button counts down; refresh while a limit is running.
  window.setInterval(() => {
    if (deps?.current().until !== undefined) refreshStatusUi();
  }, 30_000);
  refreshStatusUi();
}

export interface StatusDraft {
  id: StatusId;
  text?: string;
  emoji?: string;
  /** Epoch ms; undefined for no limit. */
  until?: number;
}

/** Builds the wire status for a draft. Presets travel as `kind: 'busy'` plus `preset`; the server enforces that too. */
function toStatus(d: StatusDraft): PlayerStatus {
  const isPreset = d.id !== 'available' && d.id !== 'busy' && d.id !== 'dnd';
  const status: PlayerStatus = { kind: isPreset ? 'busy' : (d.id as 'available' | 'busy' | 'dnd') };
  if (isPreset) status.preset = d.id as PlayerStatus['preset'];
  const text = (d.text ?? '').trim().slice(0, MAX_STATUS_TEXT);
  if (text) status.text = text;
  if (d.emoji) status.emoji = d.emoji;
  if (d.until !== undefined) status.until = d.until;
  return status;
}

/** Sets and announces a status, and remembers it in the recent list. */
export function setStatus(d: StatusDraft | StatusId) {
  if (!deps) return;
  const draftIn: StatusDraft = typeof d === 'string' ? { id: d } : d;
  const status = toStatus(draftIn);
  deps.send({ t: 'status', ...status });
  deps.apply(status, { byMe: true });
  const prefs = statusPrefs();
  const minutes = status.until !== undefined ? Math.max(1, Math.round((status.until - Date.now()) / 60_000)) : undefined;
  prefs.recent = pushRecent(prefs.recent, { ...status, ...(minutes ? { minutes } : {}) });
  savePrefs(prefs);
  if (status.kind === 'dnd') notice('Do Not Disturb is on: your mic and camera are off, and no one can start a conversation with you.', { key: 'dnd', ttlMs: 4500 });
  else if (status.preset === 'focus') notice("Conversations won't open around you. Rings still reach you.", { key: 'focus', ttlMs: 4500 });
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
  let label = statusId(s) === 'available' ? 'Status' : `${statusIcon(s)} ${statusLabel(s)}`.trim();
  if (s.until !== undefined && s.preset !== 'out') label += ` · ${Math.max(1, Math.ceil((s.until - Date.now()) / 60_000))}m`;
  btn.append(dot, document.createTextNode(label));
  renderPanel();
}

/** Minutes shown beside a status in the grid and in Recent. */
function limitLabel(id: StatusId): string {
  const l = STATUS_PRESETS[id].defaultLimit;
  return typeof l === 'number' ? ` · ${l}m` : '';
}

function statusButton(id: StatusId, current: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.classList.toggle('on', current);
  const dot = document.createElement('i');
  dot.className = 'dot';
  dot.style.background = STATUS_PRESETS[id].color;
  b.append(dot, document.createTextNode(`${STATUS_PRESETS[id].icon} ${STATUS_PRESETS[id].label}`.trim()));
  b.title = `${STATUS_PRESETS[id].label}${limitLabel(id)}`;
  b.onclick = onClick;
  return b;
}

function renderPanel() {
  const panel = $('statusPanel');
  if (panel.hidden || !deps) return;
  panel.replaceChildren(Object.assign(document.createElement('div'), { className: 'head', textContent: 'Your status' }));
  const mine = statusId(deps.current());

  const recent = statusPrefs().recent;
  if (recent.length) {
    panel.append(Object.assign(document.createElement('div'), { className: 'head', textContent: 'Recent' }));
    const row = document.createElement('div');
    row.className = 'recent';
    for (const r of recent) {
      const id = statusId(r);
      const b = statusButton(id, false, () => {
        const until = id === 'out' ? nextMorning(Date.now()) : r.minutes ? Date.now() + r.minutes * 60_000 : undefined;
        setStatus({ id, text: r.text, emoji: r.emoji, until });
        hideStatusPanel();
      });
      if (r.emoji) b.firstChild!.nextSibling!.textContent = `${r.emoji} ${STATUS_PRESETS[id].label}`;
      if (r.text) b.append(Object.assign(document.createElement('small'), { textContent: ` ${r.text}` }));
      row.append(b);
    }
    panel.append(row);
  }

  const grid = document.createElement('div');
  grid.className = 'kinds grid';
  for (const id of STATUS_IDS) {
    grid.append(
      statusButton(id, mine === id, () => {
        if (customizeOpen) {
          // Customize is open: picking fills the draft; "Set status" applies it.
          draft.id = id;
          const l = STATUS_PRESETS[id].defaultLimit;
          draft.minutes = l === 'morning' ? 'morning' : l === null ? '0' : String(l);
          renderPanel();
        } else {
          setStatus({ id, until: limitUntil(id, Date.now()) });
          hideStatusPanel();
        }
      }),
    );
  }
  panel.append(grid);

  const details = document.createElement('details');
  details.open = customizeOpen;
  details.ontoggle = () => {
    customizeOpen = details.open;
  };
  details.append(Object.assign(document.createElement('summary'), { textContent: 'Customize' }));
  const text = Object.assign(document.createElement('input'), {
    maxLength: MAX_STATUS_TEXT,
    placeholder: 'What are you up to? (optional)',
    value: draft.text,
  });
  text.oninput = () => (draft.text = text.value);
  const emojiBox = Object.assign(document.createElement('input'), { className: 'emoji-in', maxLength: 16, placeholder: 'Emoji', value: draft.emoji });
  emojiBox.oninput = () => (draft.emoji = emojiBox.value);
  const emojiGrid = document.createElement('div');
  emojiGrid.className = 'emoji-grid';
  for (const e of EMOJI) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: e, title: e });
    b.onclick = () => {
      draft.emoji = e;
      emojiBox.value = e;
    };
    emojiGrid.append(b);
  }
  const when = document.createElement('select');
  for (const d of DURATIONS) when.append(Object.assign(document.createElement('option'), { value: d.value, textContent: d.label }));
  when.value = draft.minutes;
  when.onchange = () => (draft.minutes = when.value);
  const set = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Set status' });
  set.onclick = () => {
    const now = Date.now();
    const until = draft.minutes === 'morning' ? nextMorning(now) : Number(draft.minutes) > 0 ? now + Number(draft.minutes) * 60_000 : undefined;
    setStatus({ id: draft.id, text: draft.text, emoji: draft.emoji, until });
    hideStatusPanel();
  };
  details.append(text, emojiBox, emojiGrid, when, set);
  panel.append(details);

  const auto = document.createElement('label');
  auto.className = 'auto-meeting';
  const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: statusPrefs().autoMeeting });
  box.onchange = () => {
    const prefs = statusPrefs();
    prefs.autoMeeting = box.checked;
    savePrefs(prefs);
    deps?.send({ t: 'statusPrefs', autoMeeting: box.checked });
  };
  auto.append(box, document.createTextNode(' Show me as In a meeting automatically'));
  panel.append(auto);
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
    const st = deps.statusOf?.(from);
    notice(`${msg.text ?? 'Someone'} is ringing you`, {
      ...(st && statusId(st) !== 'available' ? { lead: statusBadge(st) } : {}),
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
    const st = deps.statusOf?.(from);
    notice(`${msg.text ?? 'Someone'} waved ${msg.reply ? 'back ' : ''}to you`, {
      ...(st && statusId(st) !== 'available' ? { lead: statusBadge(st) } : {}),
      key: `wave:${from}`,
      ttlMs: 8000,
      buttons: msg.reply ? [] : [{ label: 'Wave back', onClick: () => send({ t: 'wave', to: from, reply: true }) }],
    });
    return true;
  }
  if (msg.kind === 'awayInfo') {
    notice(msg.text ?? 'They are away.', { key: `away:${from ?? ''}`, ttlMs: 6000 });
    return true;
  }
  return false;
}
