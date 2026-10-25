import { AREAS, DESK_PODS, areaAt, areaById, deskAt, deskById, tileAt, type Area } from '../shared/map';
import type { ClientMsg, OfficeSnapshot, ServerMsg, ViewMode } from '../shared/protocol';
import { session } from './session';
import { OFFLINE_COLOR, statusColor } from './types';

/** The few things this module needs from the rest of the client. */
export interface OfficeUiDeps {
  send(msg: ClientMsg): void;
  /** Everyone currently in the office, including you. */
  people(): { memberId: string; name: string }[];
  /** Where you are and which way you face. */
  me(): { memberId: string; x: number; y: number; a: number };
}

type Reason = 'full' | 'restricted' | 'locked';
type NotifyMsg = Extract<ServerMsg, { t: 'notify' }>;

let deps: OfficeUiDeps = { send: () => {}, people: () => [], me: () => ({ memberId: '', x: 0, y: 0, a: 0 }) };
let office: OfficeSnapshot | null = null;
/** Areas and desks the server turned us away from, and until when (performance.now) we assume it would again. */
const turnedAway = new Map<string, number>();
const TURNED_AWAY_MS = 3000;
const lastBlockedAt = new Map<string, number>();
let lastPrivateArea: string | null | undefined;
let adminAllowed: Record<string, string[]> = {};
let cardDesk: string | null = null;
/** What the last sprite reload found, for the admin panel. */
let spritesStatus: {
  count: number;
  rejected?: { file: string; errors: string[] }[];
  warnings?: { file: string; warning: string }[];
} | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function initOfficeUi(d: OfficeUiDeps) {
  deps = d;
  const btn = $<HTMLButtonElement>('adminBtn');
  btn.onclick = () => {
    const panel = $('adminPanel');
    panel.hidden = !panel.hidden;
    btn.classList.toggle('on', !panel.hidden);
    renderAdmin();
    btn.blur();
  };
  $<HTMLButtonElement>('deskBtn').onclick = (e) => {
    claimOrWalk();
    (e.currentTarget as HTMLElement).blur();
  };
}

/** Called once `welcome` arrives, so admin-only controls appear for admins. */
export function onWelcome() {
  $('adminBtn').hidden = !session.isAdmin;
}

// ------------------------------------------------------------------ state

export function setOffice(snapshot: OfficeSnapshot) {
  office = snapshot;
  renderAdmin();
  renderDeskCard();
}

/** The server reloaded the sprite sheets; admins also learn which files were rejected. */
export function onSprites(msg: Extract<ServerMsg, { t: 'sprites' }>) {
  if (msg.rejected || spritesStatus) spritesStatus = { count: msg.sprites.length, rejected: msg.rejected, warnings: msg.warnings };
  renderAdmin();
}

export function setAdminState(areaAllowed: Record<string, string[]>) {
  adminAllowed = areaAllowed;
  renderAdmin();
}

function occupants(areaId: string): number | undefined {
  return office?.areas.find((a) => a.id === areaId)?.occupants;
}

/** "<name> · <n> here", the label shown for the private area you are in. */
export function areaLabel(area: Area): string {
  const n = occupants(area.id);
  return n === undefined ? area.name : `${area.name} · ${n} here`;
}

/**
 * Whether walking from one position to another would be refused, judging from what we know. Full
 * areas are predicted from occupancy. Restricted areas and locked desks are only known after the
 * server has turned us away once.
 */
export function predictEntry(fx: number, fy: number, tx: number, ty: number): Reason | null {
  const now = performance.now();
  const to = areaAt(tx, ty);
  if (to && to.id !== areaAt(fx, fy)?.id) {
    if ((turnedAway.get(to.id) ?? 0) > now) return 'restricted';
    const a = office?.areas.find((x) => x.id === to.id);
    if (a?.capacity !== undefined && a.occupants >= a.capacity) return 'full';
  }
  const desk = deskAt(tx, ty);
  if (desk && desk.id !== deskAt(fx, fy)?.id && (turnedAway.get(desk.id) ?? 0) > now) return 'locked';
  return null;
}

// -------------------------------------------------------- per-frame updates

/** Call a few times a second with the private area the player is in, if any. */
export function updateArea(area: Area | null, mode: ViewMode) {
  if (lastPrivateArea !== undefined && area?.id !== lastPrivateArea && area) {
    notice(`You have entered ${area.name}`, { key: 'entered', ttlMs: 3000 });
  }
  lastPrivateArea = area?.id ?? null;

  // Top-down view draws the label on the map; first-person has no map, so a banner shows it instead.
  const banner = $('areaBanner');
  banner.hidden = !(mode === '3d' && area);
  if (area) banner.textContent = areaLabel(area);
}

// -------------------------------------------------------------- server events

/** The server refused a move, so tell the player why and what they can do about it. */
export function blocked(reason: Reason, areaId?: string, deskId?: string) {
  const area = areaId ? areaById(areaId) : undefined;
  const turnedKey = deskId ?? area?.id;
  if (turnedKey && reason !== 'full') turnedAway.set(turnedKey, performance.now() + TURNED_AWAY_MS);
  // Holding a key against a closed door must not rebuild the notice every frame.
  const key = `${reason}:${deskId ?? areaId}`;
  if (performance.now() - (lastBlockedAt.get(key) ?? -Infinity) < 1500) return;
  lastBlockedAt.set(key, performance.now());

  const name = area?.name ?? 'That room';
  if (reason === 'full') {
    notice(`${name} is full`, { key, ttlMs: 2500 });
  } else if (reason === 'restricted' && area) {
    notice(`${name} is for invited people only.`, {
      key,
      ttlMs: 8000,
      buttons: [{ label: 'Knock', onClick: () => deps.send({ t: 'knock', areaId: area.id }) }],
    });
  } else if (deskId) {
    const owner = office?.desks.find((d) => d.id === deskId)?.owner?.name;
    notice(owner ? `${owner}'s desk is locked` : 'That desk is locked', { key, ttlMs: 3000 });
  } else {
    notice(`${name} is closed`, { key, ttlMs: 2500 });
  }
}

export function onNotify(msg: NotifyMsg) {
  if (msg.kind === 'error' && msg.text) {
    notice(msg.text, { ttlMs: 4000 });
  } else if (msg.kind === 'knock' && msg.areaId && msg.memberId) {
    const { areaId, memberId } = msg;
    const answer = (allow: boolean) => deps.send({ t: 'admit', areaId, memberId, allow });
    notice(`${msg.text ?? 'Someone'} is knocking at ${areaById(areaId)?.name ?? 'the room'}`, {
      key: `knock:${memberId}`,
      ttlMs: 60_000,
      buttons: [
        { label: 'Let in', onClick: () => answer(true) },
        { label: 'Decline', onClick: () => answer(false) },
      ],
    });
  } else if (msg.kind === 'knockResult' && msg.areaId) {
    if (msg.ok) turnedAway.delete(msg.areaId);
    notice(msg.ok ? 'You were let in. Walk right in.' : 'Your knock was declined.', { ttlMs: 4000 });
  } else if (msg.kind === 'deskInvite' && msg.deskId) {
    const { deskId } = msg;
    turnedAway.delete(deskId);
    notice(`${msg.text ?? 'Someone'} invited you to their desk`, {
      key: `invite:${deskId}`,
      ttlMs: 30_000,
      buttons: [{ label: 'Go there', onClick: () => deps.send({ t: 'walkToDesk', deskId }) }],
    });
  }
}

// ---------------------------------------------------------------- notices

interface NoticeOpts {
  /** A notice with the same key replaces the old one instead of piling up. */
  key?: string;
  ttlMs?: number;
  buttons?: { label: string; onClick: () => void }[];
}

export function notice(text: string, opts: NoticeOpts = {}) {
  const box = $('notices');
  if (opts.key) box.querySelectorAll(`[data-key="${CSS.escape(opts.key)}"]`).forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = 'notice';
  if (opts.key) el.dataset.key = opts.key;
  el.append(Object.assign(document.createElement('span'), { textContent: text }));
  for (const b of opts.buttons ?? []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.label;
    btn.onclick = () => {
      b.onClick();
      el.remove();
    };
    el.append(btn);
  }
  box.append(el);
  while (box.childElementCount > 4) box.firstElementChild!.remove();
  window.setTimeout(() => el.remove(), opts.ttlMs ?? 4000);
}

// ------------------------------------------------------------------ desks

/** A desk's label and highlight, as the top-down renderer draws it. */
export interface DeskTag {
  tiles: { x: number; y: number }[];
  /** Centre of the desk surface, in tiles. */
  anchor: { x: number; y: number };
  text: string;
  /** The owner's status colour, or grey when they are away. */
  dot: string;
  /** Hovered, or you are standing close. */
  show: boolean;
  mine: boolean;
}

/** The desk surface tile, where labels float. */
function surface(deskId: string): { x: number; y: number } {
  const d = deskById(deskId)!;
  const t = d.tiles.find((p) => tileAt(p.x, p.y) === 'd') ?? d.seat;
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

export function myDeskId(): string | undefined {
  const me = deps.me().memberId;
  return office?.desks.find((d) => d.owner?.memberId === me)?.id;
}

/** Labels for claimed desks in the top-down view. */
export function deskTags(hover: string | null): DeskTag[] {
  const me = deps.me();
  return (office?.desks ?? []).flatMap((s) => {
    const desk = deskById(s.id);
    if (!desk || !s.owner) return [];
    const near = Math.hypot(me.x - (desk.seat.x + 0.5), me.y - (desk.seat.y + 0.5)) <= 2;
    const status = s.owner.online ? s.owner.status ?? { kind: 'available' as const } : null;
    return [{
      tiles: desk.tiles,
      anchor: surface(s.id),
      text: `${s.locked ? '🔒 ' : ''}${s.owner.name}${s.owner.online ? '' : ' (away)'}${status?.text ? ` · ${status.text}` : ''}`,
      dot: status ? statusColor(status) : OFFLINE_COLOR,
      // Your own name is already over your head, so your own desk only labels itself on hover.
      show: hover === s.id || (near && s.owner.memberId !== me.memberId),
      mine: s.owner.memberId === me.memberId,
    }];
  });
}

/** Floating labels for claimed desks in first-person view. */
export function deskMarkers(): { x: number; y: number; text: string; dot: string }[] {
  return (office?.desks ?? []).flatMap((s) => {
    if (!s.owner) return [];
    const status = s.owner.online ? s.owner.status ?? { kind: 'available' as const } : null;
    const note = status?.text ? ` · ${status.text}` : '';
    return [{ ...surface(s.id), text: `${s.locked ? '🔒 ' : ''}${s.owner.name}${note}`, dot: status ? statusColor(status) : OFFLINE_COLOR }];
  });
}

/** The desk the player faces within 1.5 tiles, for the first-person view. */
export function facedDesk(): string | null {
  const me = deps.me();
  for (const reach of [0.5, 1.0, 1.5]) {
    const x = me.x + Math.cos(me.a) * reach, y = me.y + Math.sin(me.a) * reach;
    if (tileAt(Math.floor(x), Math.floor(y)) === 'd') return deskAt(x, y)?.id ?? null;
  }
  return null;
}

/** Shows or hides the "press F" hint. */
export function showDeskHint(deskId: string | null) {
  const el = $('deskHint');
  el.hidden = !deskId;
  if (deskId) {
    const owner = office?.desks.find((d) => d.id === deskId)?.owner;
    el.textContent = owner ? `Press F: ${owner.name}'s desk` : 'Press F: free desk';
  }
}

/** The "Desk" button and G key: go to your desk, or claim one if you have none. */
function claimOrWalk() {
  if (myDeskId()) deps.send({ t: 'walkToDesk' });
  else deps.send({ t: 'desk', op: 'claim' }); // the server answers "No desks are free." when there is none
}

export function walkToMyDesk() {
  if (myDeskId()) deps.send({ t: 'walkToDesk' });
  else notice('You have no desk yet. Click an empty desk to claim it.', { key: 'nodesk', ttlMs: 3500 });
}

export function openDeskCard(deskId: string) {
  cardDesk = deskId;
  renderDeskCard();
}

export function closeDeskCard() {
  cardDesk = null;
  renderDeskCard();
}

export const deskCardOpen = () => cardDesk !== null;

function renderDeskCard() {
  const card = $('deskCard');
  const desk = cardDesk ? deskById(cardDesk) : undefined;
  card.hidden = !desk;
  if (!desk) return;
  const state = office?.desks.find((d) => d.id === desk.id);
  const me = deps.me();
  const mine = state?.owner?.memberId === me.memberId;
  const pod = DESK_PODS.find((p) => p.id === desk.podId);
  card.replaceChildren();

  const head = document.createElement('div');
  head.className = 'head';
  head.textContent = `Desk · ${pod?.name ?? ''}`;
  const close = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Close' });
  close.onclick = closeDeskCard;
  head.append(close);
  card.append(head);

  const line = document.createElement('div');
  if (!state?.owner) {
    line.textContent = 'This desk is free.';
  } else {
    const dot = document.createElement('i');
    dot.className = `dot ${state.owner.status?.kind ?? 'available'}`;
    line.append(dot, document.createTextNode(`${state.owner.name}${mine ? ' (you)' : ''}${state.owner.online ? '' : ' · away'}`));
    if (state.owner.status?.text) line.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: state.owner.status.text }));
    if (state.locked) line.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: '🔒 Locked: only invited people can join.' }));
  }
  card.append(line);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const act = (label: string, onClick: () => void) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
    b.onclick = onClick;
    actions.append(b);
    return b;
  };
  if (!state?.owner) {
    act('Claim desk', () => deps.send({ t: 'desk', op: 'claim', deskId: desk.id }));
  } else if (mine) {
    act('Unclaim desk', () => {
      deps.send({ t: 'desk', op: 'unclaim' });
      closeDeskCard();
    });
    act(state.locked ? 'Unlock' : 'Lock', () => deps.send({ t: 'desk', op: state.locked ? 'unlock' : 'lock' }));
    act('Walk to my desk', () => deps.send({ t: 'walkToDesk' }));
  }
  card.append(actions);

  if (mine) {
    const invite = document.createElement('div');
    invite.className = 'group';
    invite.append(Object.assign(document.createElement('b'), { textContent: 'Invite to desk' }));
    const others = deps.people().filter((p) => p.memberId !== me.memberId && !p.memberId.startsWith('eph-'));
    if (!others.length) invite.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: 'No one else is here.' }));
    for (const p of others) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: p.name });
      b.onclick = () => {
        deps.send({ t: 'deskInvite', memberId: p.memberId });
        notice(`Invited ${p.name}`, { ttlMs: 2000 });
      };
      invite.append(b);
    }
    card.append(invite);
  }
}

// ------------------------------------------------------------ admin panel

function renderAdmin() {
  const panel = $('adminPanel');
  if (panel.hidden) return;
  panel.replaceChildren(Object.assign(document.createElement('div'), { className: 'head', textContent: 'Admin' }));

  const pods = document.createElement('div');
  pods.className = 'group';
  pods.append(Object.assign(document.createElement('b'), { textContent: 'Desk pods' }));
  for (const p of office?.pods ?? []) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    for (const mode of ['ambient', 'cubicle'] as const) {
      select.append(Object.assign(document.createElement('option'), { value: mode, textContent: mode, selected: p.mode === mode }));
    }
    select.onchange = () => deps.send({ t: 'admin', op: 'podMode', podId: p.id, mode: select.value as 'ambient' | 'cubicle' });
    label.append(document.createTextNode(`${DESK_PODS.find((x) => x.id === p.id)?.name ?? p.id} `), select);
    pods.append(label);
  }
  panel.append(pods);

  const sprites = document.createElement('div');
  sprites.className = 'group';
  sprites.append(Object.assign(document.createElement('b'), { textContent: 'Custom characters' }));
  const reload = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Reload sprites' });
  reload.onclick = () => deps.send({ t: 'admin', op: 'reloadSprites' });
  sprites.append(reload);
  if (spritesStatus) {
    sprites.append(Object.assign(document.createElement('div'), {
      className: 'sys',
      textContent: `${spritesStatus.count} sheet${spritesStatus.count === 1 ? '' : 's'} loaded`,
    }));
    for (const r of spritesStatus.rejected ?? []) {
      sprites.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: `Skipped ${r.file}: ${r.errors.join(', ')}` }));
    }
    for (const w of spritesStatus.warnings ?? []) {
      sprites.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: `Check ${w.file}: ${w.warning}` }));
    }
  }
  panel.append(sprites);

  const restricted = (office?.areas ?? []).filter((a) => a.restricted);
  if (!restricted.length) {
    panel.append(Object.assign(document.createElement('div'), {
      className: 'sys',
      textContent: 'No restricted areas. Set restricted: true on an area in shared/map.ts.',
    }));
    return;
  }
  const people = deps.people().filter((p) => /^[0-9a-f-]{36}$/i.test(p.memberId));
  for (const a of restricted) {
    const area = AREAS.find((x) => x.id === a.id);
    const allowed = new Set(adminAllowed[a.id] ?? []);
    const group = document.createElement('div');
    group.className = 'group';
    group.append(Object.assign(document.createElement('b'), { textContent: `${area?.name ?? a.id} · who can walk in` }));
    for (const p of people) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = allowed.has(p.memberId);
      box.onchange = () => {
        if (box.checked) allowed.add(p.memberId);
        else allowed.delete(p.memberId);
        deps.send({ t: 'admin', op: 'areaAllowed', areaId: a.id, memberIds: [...allowed] });
      };
      label.append(box, document.createTextNode(` ${p.name}`));
      group.append(label);
    }
    panel.append(group);
  }
}
