import './style.css';
import { MAP_H, MAP_W, SPAWN, moveWithCollision, areaAt, deskAt, getWorld, onWorldChange } from '../shared/map';
import { gainFor } from '../shared/proximity';
import type {
  AvatarChoice, ChatScope, ClientMsg, ConversationInfo, ItemInfo, Link, PlayerState, PlayerStatus, ServerMsg, ViewMode,
} from '../shared/protocol';
import { expireStatus } from '../shared/status';
import { loadAvatar, makeAvatar } from './art';
import { Builder } from './builder/builder';
import { CallPanel, type TileInfo } from './callPanel';
import { changeCharacter, getMemberId, showJoinScreen } from './join';
import { MeshTransport, shareScreen } from './media';
import { InkStore } from './inkModel';
import { ShareStage, stagePlan, type StageItem } from './shareStage';
import {
  areaLabel, blocked, closeDeskCard, deskTitle, showDeskCue, notice, deskCardOpen, deskMarkers, deskTags, facedDesk, initOfficeUi, onNotify,
  onSprites, onWelcome, openDeskCard, predictEntry, setAdminState, setBuilding, setOffice, showDeskHint, updateArea, walkToMyDesk,
} from './office-ui';
import { Net } from './net';
import { session } from './session';
import { Renderer2D, drawBubble, drawNameTag } from './render2d';
import { Raycaster } from './render3d';
import { defaultZoom, rescale, stepZoom } from './scale';
import { handleSocialNotify, initStatus, refreshStatusUi } from './status';
import { statusColor, type Player } from './types';
import { updateCustomObjects } from './custom-objects';
import { deskCueText, deskPresenceNow, roomViewNow } from './desk-presence';
import { icon } from './icons';
import { canJump } from '../shared/jump';
import { panelPlan } from '../shared/desk-presence';
import { syncItems, onItemsChanged } from './items-client';
import { Studio } from './studio/studio';
import { onHelperStatus, setHelperStatus } from './studio/helper-ui';
import { loadLayout, recompile } from './world-client';
import { mouseLook, readInvert, writeInvert } from './look';

const WALK_SPEED = 3.6; // tiles per second
const TURN_SPEED = 2.6; // radians per second
const MOUSE_SENS = 0.0028;
let pitch = 0; // how far the view is tilted up (+) or down (-); only ever in this browser, level whenever first person opens
let invertLook = readInvert();
const NEARBY_RADIUS = 4;
const BUBBLE_MS = 6000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const chatInput = $<HTMLInputElement>('chatInput');
const chatLog = $('chatLog');

const renderer2d = new Renderer2D();
const raycaster = new Raycaster();
const buildBtn = $<HTMLButtonElement>('buildBtn');
const net = new Net();
const media = new MeshTransport();
const callPanel = new CallPanel($('callPanel'), (which) => toggleDevice(which), () => toggleShare(), (open) => setSelfLarge(open));
const shareStage = new ShareStage($('shareStage'));
const studio = new Studio({
  notice: (text) => notice(text, { key: 'studio', ttlMs: 3000 }),
  onItemChanged: (id) => builder.itemSaved(id),
});
const builder = new Builder({
  openStudio: (seed) => void studio.open(seed),
  canvas,
  renderer: renderer2d,
  panel: $('builderPanel'),
  notice: (text, ttlMs = 3000) => notice(text, { key: 'builder', ttlMs }),
  here: () => ({ x: me.x, y: me.y }),
  onClose: () => {
    renderer2d.setWorld(getWorld());
    buildBtn.classList.remove('on');
  },
});
onItemsChanged(() => builder.refreshPanel());
onHelperStatus(() => studio.refresh());
const micBtn = $<HTMLButtonElement>('micBtn');
const camBtn = $<HTMLButtonElement>('camBtn');
const chatScopeBtn = $<HTMLButtonElement>('chatScope');

let me: Player;
/** What we send (and re-send on every reconnect) to enter the office. */
let joinMsg: Extract<ClientMsg, { t: 'join' }>;
const others = new Map<string, Player>();
let mode: ViewMode = '2d';
/** Device pixels per CSS pixel; the canvas is drawn at this density so the art stays sharp on 2x screens. */
let dpr = window.devicePixelRatio || 1;
/** Device pixels per art pixel: always a whole number (see scale.ts). */
let zoom = defaultZoom(dpr);
let online = false;
let links: Link[] = [];
let conversation: ConversationInfo | null = null;
let convFull = false;
let chatTo: 'nearby' | 'office' = 'nearby';
/** The desk under the mouse in the top-down view. */
let hoverDesk: string | null = null;

function toPlayer(s: PlayerState): Player {
  const p: Player = { ...s, avatar: makeAvatar(s.look), avatarChoice: s.avatar, tx: s.x, ty: s.y, ta: s.a, animT: 0 };
  void applyAvatar(p, s.avatar);
  return p;
}

/**
 * Shows the built-in character right away, then swaps in the chosen sheet once its image has
 * loaded. Both views draw `avatar`, so nothing else needs to know about custom characters.
 */
async function applyAvatar(p: Player, choice: AvatarChoice) {
  p.avatarChoice = choice;
  const avatar = await loadAvatar(choice, session.sprites, p.look);
  if (p.avatarChoice !== choice) return; // a slow load that a newer choice has overtaken
  p.avatar = avatar;
  refreshCallPanel(); // a conversation tile shows this picture too
}

// ----------------------------------------------------------------- input

const keys = new Set<string>();
const held = (...codes: string[]) => codes.some((c) => keys.has(c));

/** True while the user is typing into some field, so single-letter shortcuts (M, C, G, WASD…) must not fire. */
function typingInField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

window.addEventListener('keydown', (e) => {
  if (studio.isOpen) return; // the studio handles its own keys
  if (!me || !$('join').hidden) return; // still joining, or choosing a character
  if (document.activeElement === chatInput) {
    if (e.key === 'Escape') chatInput.blur();
    return;
  }
  if (typingInField(e.target)) {
    if (e.key === 'Escape') (e.target as HTMLElement).blur();
    return;
  }
  if (e.key === 'Escape') {
    // Esc backs out of drawing first, then out of the larger view of your own share.
    if (shareStage.penOn) {
      shareStage.setPen(false);
      return;
    }
    if (selfLarge) {
      setSelfLarge(false);
      return;
    }
  }
  if (e.code === 'KeyB' && !e.repeat && session.canBuild) {
    e.preventDefault();
    toggleBuild();
    return;
  }
  if (builder.active && builder.handleKey(e)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    keys.clear();
    chatInput.focus();
    return;
  }
  if ((e.code === 'KeyM' || e.code === 'KeyC') && !e.repeat) {
    toggleDevice(e.code === 'KeyM' ? 'mic' : 'cam');
    return;
  }
  if (e.code === 'Space' && !e.repeat) {
    // Jump: only for show. You rise and land where you took off; it moves you nowhere and changes no rule.
    e.preventDefault();
    const now = Date.now();
    if (canJump(me.jumpAt, now)) {
      me.jumpAt = now;
      net.send({ t: 'jump' });
    }
    return;
  }
  if (e.code === 'KeyG' && !e.repeat) {
    walkToMyDesk();
    return;
  }
  if (e.code === 'KeyF' && mode === '3d' && !e.repeat) {
    const desk = facedDesk();
    if (desk) {
      document.exitPointerLock(); // the card has buttons, so free the mouse
      openDeskCard(desk);
    }
    return;
  }
  if (e.key === 'Escape' && deskCardOpen()) {
    closeDeskCard();
    return;
  }
  if (e.code === 'Tab' || e.code === 'KeyV') {
    e.preventDefault();
    setMode(mode === '2d' ? '3d' : '2d');
    return;
  }
  if (mode === '2d' && (e.key === '+' || e.key === '=')) zoom = stepZoom(zoom, 1, dpr);
  if (mode === '2d' && (e.key === '-' || e.key === '_')) zoom = stepZoom(zoom, -1, dpr);
  // A key pressed with ⌘, Ctrl or Alt is a shortcut (⌘+D, Ctrl+S…), not a step: on a Mac its keyup never comes, so it would stick.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // While the pen is on the keys do not walk you around the office.
  if (shareStage.penOn && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)) return;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  // macOS sends no keyup for other keys released while ⌘ is down, so anything held then may never be let go of.
  if (e.key === 'Meta') keys.clear();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Meta') keys.clear(); // the same: stop walking rather than walk on forever
});
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) keys.clear();
});

canvas.addEventListener('wheel', (e) => {
  if (mode !== '2d') return;
  e.preventDefault();
  zoom = stepZoom(zoom, e.deltaY < 0 ? 1 : -1, dpr);
}, { passive: false });

canvas.addEventListener('click', (e) => {
  if (builder.active) return;
  if (mode === '3d') {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    return;
  }
  // Top-down: clicking a desk opens its card, clicking elsewhere closes it.
  const t = renderer2d.tileUnder(e.clientX, e.clientY);
  const desk = deskAt(t.x + 0.5, t.y + 0.5);
  if (desk) openDeskCard(desk.id);
  else closeDeskCard();
});
canvas.addEventListener('mousemove', (e) => {
  if (mode !== '2d' || builder.active) return;
  const t = renderer2d.tileUnder(e.clientX, e.clientY);
  hoverDesk = deskAt(t.x + 0.5, t.y + 0.5)?.id ?? null;
  canvas.style.cursor = hoverDesk ? 'pointer' : '';
});
document.addEventListener('mousemove', (e) => {
  if (mode === '3d' && document.pointerLockElement === canvas) {
    me.a += e.movementX * MOUSE_SENS;
    pitch = mouseLook(pitch, e.movementY, invertLook, MOUSE_SENS);
  }
});
const invertBox = $('invertLook') as HTMLInputElement;
invertBox.checked = invertLook;
invertBox.addEventListener('change', () => {
  invertLook = invertBox.checked;
  writeInvert(invertLook);
  invertBox.blur(); // otherwise the keys keep going to the checkbox
});
$('invertLookLabel').addEventListener('click', (e) => e.stopPropagation()); // ticking it must not capture the mouse
document.addEventListener('pointerlockchange', updateHints);

chatInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.stopPropagation(); // otherwise the window handler re-focuses the input
  const text = chatInput.value.trim();
  if (text) {
    if (online) net.send({ t: 'chat', text, to: conversation ? chatTo : 'office' });
    else onChat(me.id, me.name, text, areaAt(me.x, me.y)?.id ?? null, 'office');
  }
  chatInput.value = '';
  chatInput.blur();
});

/** Opens or closes build mode. Build mode is a top-down view, so first person switches back first. */
function toggleBuild() {
  keys.clear();
  pitch = 0;
  if (!builder.active && mode === '3d') setMode('2d');
  builder.toggle();
  buildBtn.classList.toggle('on', builder.active);
  buildBtn.blur();
}
buildBtn.onclick = toggleBuild;

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
  b.onclick = () => {
    setMode(b.dataset.mode as ViewMode);
    b.blur();
  };
});

$<HTMLButtonElement>('characterBtn').onclick = async (e) => {
  (e.currentTarget as HTMLElement).blur();
  keys.clear();
  document.exitPointerLock();
  const next = await changeCharacter({ name: me.name, look: me.look, avatar: me.avatarChoice });
  if (!next) return;
  me.look = next.look;
  void applyAvatar(me, next.avatar); // show it at once; the server's echo confirms or corrects it
  net.send({ t: 'avatar', avatar: next.avatar });
  // A reconnect re-sends the join message, so it must describe the character we have now.
  joinMsg.look = next.look;
  joinMsg.avatar = next.avatar;
};

micBtn.innerHTML = icon('mic');
camBtn.innerHTML = icon('cam');
buildBtn.innerHTML = `${icon('build')}<span>Build</span>`;
micBtn.onclick = () => {
  toggleDevice('mic');
  micBtn.blur();
};
camBtn.onclick = () => {
  toggleDevice('cam');
  camBtn.blur();
};
chatScopeBtn.onclick = () => {
  chatTo = chatTo === 'nearby' ? 'office' : 'nearby';
  updateChatScope();
  chatScopeBtn.blur();
};

/** The scope switch only matters in open-floor conversations; private areas keep chat inside the room. */
function updateChatScope() {
  chatScopeBtn.hidden = !(conversation && conversation.context === 'open');
  chatScopeBtn.textContent = chatTo === 'nearby' ? 'Nearby' : 'Office';
}

function deviceHelp(error?: string) {
  if (error === 'NotAllowedError') {
    return 'Camera or microphone access is blocked. Allow it in your browser site settings (the icon by the address bar) and try again. You can still chat and stay in the conversation.';
  }
  if (error === 'NotFoundError') return 'No camera or microphone was found. You can still chat and stay in the conversation.';
  if (error === 'TypeError') return 'Camera and microphone need a secure connection (https, or localhost).';
  return 'Could not start your camera or microphone.';
}

let wantMic = false;
let wantCam = false;
let devicesQueue: Promise<void> = Promise.resolve();

/** Takes a new status of ours into effect: Do Not Disturb switches the mic and camera off and locks their buttons. */
function setMyStatus(status: PlayerStatus) {
  me.status = status;
  const dnd = status.kind === 'dnd';
  micBtn.disabled = camBtn.disabled = dnd;
  if (dnd && (wantMic || wantCam)) {
    wantMic = false;
    wantCam = false;
    devicesQueue = devicesQueue.then(applyDevices);
  }
  refreshStatusUi();
  lastPeopleKey = ''; // redraw the list with the new dot
  renderPeople();
}

let speakingSent = false;
let speakingWanted = false;
let speakingAt = 0;
let speakingTimer = 0;

/** Tells the server when we start or stop talking, at most once a second. */
function flushSpeaking() {
  if (speakingWanted === speakingSent) return;
  const wait = 1000 - (performance.now() - speakingAt);
  if (wait > 0) {
    speakingTimer ||= window.setTimeout(() => {
      speakingTimer = 0;
      flushSpeaking();
    }, wait);
    return;
  }
  speakingSent = speakingWanted;
  speakingAt = performance.now();
  net.send({ t: 'media', mic: me.mic, cam: me.cam, speaking: speakingSent });
}

/** Flips the wanted state right away, then applies changes one at a time so quick toggles never act on stale state. */
function toggleDevice(which: 'mic' | 'cam') {
  if (me.status.kind === 'dnd') {
    notice('You are in Do Not Disturb, so your mic and camera stay off.', { key: 'dnd-devices', ttlMs: 2500 });
    return;
  }
  if (which === 'mic') wantMic = !wantMic;
  else wantCam = !wantCam;
  devicesQueue = devicesQueue.then(applyDevices);
}

/** Turns devices on or off, and tells everyone so their panels show the right icons. */
async function applyDevices() {
  const r = await media.setLocal({ mic: wantMic, cam: wantCam });
  const on = media.local();
  // A device that could not start goes back to off; one the user flipped meanwhile keeps its new wish.
  if (wantMic && !on.mic && !r.ok) wantMic = false;
  if (wantCam && !on.cam && !r.ok) wantCam = false;
  publishDevices();
  if (!r.ok) systemLine(deviceHelp(r.error));
}

/** Shows and announces which devices are really on right now. */
function publishDevices() {
  const on = media.local();
  me.mic = on.mic;
  me.cam = on.cam;
  micBtn.classList.toggle('off', !on.mic);
  camBtn.classList.toggle('off', !on.cam);
  net.send({ t: 'media', mic: on.mic, cam: on.cam });
  refreshCallPanel();
}

/** A device went away mid-call (unplugged, or taken by another app). The call and the other device carry on. */
function onDeviceLost(device: 'mic' | 'cam') {
  if (device === 'mic') wantMic = false;
  else wantCam = false;
  publishDevices();
  const left = device === 'mic' ? (me.cam ? ' Your camera is still on.' : '') : me.mic ? ' Your microphone is still on.' : '';
  notice(`Your ${device === 'mic' ? 'microphone' : 'camera'} was disconnected.${left}`, { key: `lost-${device}`, ttlMs: 6000 });
}

let blockedHintShown = false;

/**
 * Someone whose browser blocks the camera or microphone still joins conversations and can chat, but others
 * will neither see nor hear them. Say so once, when a conversation opens, instead of waiting for them to press Mic.
 */
async function warnIfDevicesBlocked() {
  if (blockedHintShown) return;
  const states = await Promise.all(
    (['microphone', 'camera'] as const).map((name) =>
      // Not every browser knows these names; treat that as "no news".
      navigator.permissions?.query({ name: name as PermissionName }).then((r) => r.state, () => 'prompt') ?? 'prompt',
    ),
  );
  if (!states.includes('denied')) return;
  blockedHintShown = true;
  notice(
    'Your browser is blocking the camera or microphone, so others cannot see or hear you. Allow it in the site settings (the icon by the address bar). You can still chat here.',
    { key: 'devices-blocked', ttlMs: 12_000 },
  );
}

/** Your own desk's id while its video view is due (you have stayed on it), otherwise null. Set from desk presence each frame. */
let deskView: string | null = null; // (any desk space, yours or not)
/** The name of the meeting room you are in on your own, while its one-tile view is due, otherwise null. */
let roomView: string | null = null;

/** Your own tile: the same in the conversation and at your desk. */
function selfTile(): TileInfo {
  return { id: me.id, name: me.name, mic: me.mic, cam: me.cam, avatar: me.avatar.frames.down[0], stream: media.localVideo(), self: true, talking: media.selfTalking() };
}

function refreshCallPanel() {
  refreshShare();
  const plan = panelPlan({ conversation: conversation ? conversation.label : null, deskConversation: !!conversation?.context.startsWith('desk:'), desk: deskView ? deskTitle(deskView) : null, room: roomView });
  if (plan.kind === 'none') {
    callPanel.render(null, [], false);
    return;
  }
  if (plan.kind === 'desk') {
    // At a desk (or a room) with nobody linked: just you, with the mic and camera buttons. Nothing is turned on or sent.
    callPanel.render(plan.heading, [selfTile()], false, 'desk');
    return;
  }
  if (!conversation) return;
  const streams = media.streams();
  const talking = media.talking();
  const tiles: TileInfo[] = [];
  for (const id of conversation.members) {
    const p = id === me.id ? me : others.get(id);
    if (!p) continue;
    const self = p === me;
    // In big meetings only some people send video, so everyone else shows as an avatar.
    const sendsVideo = !conversation.video || conversation.video.includes(p.id);
    tiles.push({
      id: p.id, name: p.name, mic: p.mic, cam: p.cam && sendsVideo,
      avatar: p.avatar.frames.down[0],
      stream: self ? media.localVideo() : streams.get(p.id) ?? null,
      self,
      talking: self ? media.selfTalking() : talking.has(p.id),
      sharing: conversation.shares?.some((sh) => sh.sharer === p.id),
    });
  }
  callPanel.render(plan.heading, tiles, convFull, 'conversation');
}

// ------------------------------------------------------------------ screen sharing

type ShareStatus = 'idle' | 'picking' | 'sharing';
let shareStatus: ShareStatus = 'idle';
/** Stop messages sent whose `shareState` reply has not come yet. */
let stopsAwaited = 0;
/** The share this viewer clicked to watch large (in memory only). */
let pickedShare: string | null = null;
/** Your own share is open large in the app, so you can draw on it. In memory only. */
let selfLarge = false;
/** Everyone's pen strokes on the shares you can see. Nothing is kept once they fade or the share ends. */
const inkStore = new InkStore();
const lastDrawing = new Map<string, boolean>();
const inkColorOf = (id: string) => conversation?.ink?.[id] ?? 0;

function setSelfLarge(on: boolean) {
  selfLarge = on;
  if (!on && shareStage.penOn) shareStage.setPen(false);
  refreshCallPanel();
}

/** Drops ink for shares that ended or were switched off, and ends the lines of people who left the conversation. */
function syncInk() {
  const shares = conversation?.shares ?? [];
  const live = new Set(shares.map((sh) => sh.shareId));
  for (const id of inkStore.shareIds()) if (!live.has(id)) inkStore.dropShare(id);
  for (const id of [...lastDrawing.keys()]) if (!live.has(id)) lastDrawing.delete(id);
  for (const sh of shares) {
    if (lastDrawing.get(sh.shareId) === true && !sh.drawing) inkStore.dropShare(sh.shareId);
    lastDrawing.set(sh.shareId, sh.drawing);
  }
  const members = new Set(conversation?.members ?? []);
  const now = performance.now();
  for (const d of inkStore.drawers()) if (d !== me.id && !members.has(d)) inkStore.endFrom(d, now);
  shareStage.wakeInk();
}
let seenShares: string[] = [];
let sizeTimer = 0;
const MAX_SHARES_NOTE = 'Sharing is full here (3 people are sharing)';

function toggleShare() {
  if (shareStatus === 'sharing') endShare();
  else if (shareStatus === 'idle') void startShare();
}

async function startShare() {
  shareStatus = 'picking';
  refreshCallPanel();
  // getDisplayMedia is called inside the click's own turn: the browser wants a user gesture.
  const r = await shareScreen();
  if (!r.ok) {
    shareStatus = 'idle';
    if (r.error === 'os') {
      notice('Your computer is blocking screen sharing. Allow screen recording for your browser in your system settings, then try again.', { key: 'share', ttlMs: 12_000 });
    }
    refreshCallPanel();
    return;
  }
  r.video.onended = () => endShare(); // the browser's own Stop sharing bar
  media.setScreen(r.video, r.audio);
  net.send({ t: 'share', on: true, audio: !!r.audio, w: r.w, h: r.h });
  let sent = { w: r.w, h: r.h };
  clearInterval(sizeTimer);
  sizeTimer = window.setInterval(() => {
    const { width, height } = r.video.getSettings();
    if (!width || !height || (width === sent.w && height === sent.h)) return;
    sent = { w: width, h: height };
    net.send({ t: 'share', on: true, audio: !!r.audio, w: width, h: height });
  }, 1000);
  // The button turns into Stop sharing when the server confirms (shareState).
}

function endShare() {
  net.send({ t: 'share', on: false });
  stopsAwaited++;
  stopShareLocally();
}

/** Stops the capture and clears the screen slots. Safe to call more than once. */
function stopShareLocally() {
  clearInterval(sizeTimer);
  sizeTimer = 0;
  media.setScreen(null, null);
  shareStatus = 'idle';
  refreshCallPanel();
}

const SHARE_ENDED: Record<string, string> = {
  left: 'Screen sharing stopped because you left the conversation.',
  dnd: 'Screen sharing stopped: Do Not Disturb is on.',
  full: '3 people are already sharing here.',
};

/** The Share screen button, the banner and the viewers' stage, as of now. */
function refreshShare() {
  const shares = conversation?.shares ?? [];
  let control: 'idle' | 'picking' | 'sharing' | { unavailable: string } = shareStatus;
  if (shareStatus === 'idle') {
    if (!window.isSecureContext) control = { unavailable: 'Screen sharing needs a secure (https) address' };
    else if (!navigator.mediaDevices?.getDisplayMedia) control = { unavailable: "Your browser can't share screens" };
    else if (shares.length >= 3) control = { unavailable: MAX_SHARES_NOTE };
  }
  callPanel.setShareControl(control);
  const sharing = shareStatus === 'sharing' && shares.some((sh) => sh.sharer === me.id);
  if (!sharing) selfLarge = false;
  callPanel.setSharingBanner(shareStatus === 'sharing' ? media.localScreen() : null, !conversation || conversation.members.length < 2, selfLarge);

  const plan = stagePlan({ shares, selfId: me.id, picked: pickedShare, selfLarge }, seenShares);
  pickedShare = plan.picked;
  seenShares = shares.map((sh) => sh.shareId);
  const screens = media.screens();
  const item = (id: string | null): StageItem | null => {
    const sh = shares.find((x) => x.shareId === id);
    if (!sh) return null;
    const self = sh.sharer === me.id;
    return {
      shareId: sh.shareId, sharer: sh.sharer, name: self ? 'You' : others.get(sh.sharer)?.name ?? 'Someone',
      stream: self ? media.localScreen() : screens.get(sh.sharer) ?? null,
      audio: sh.audio && !self, w: sh.w, h: sh.h, drawing: sh.drawing, self,
    };
  };
  shareStage.render({
    large: item(plan.large),
    thumbs: plan.thumbs.map(item).filter((x): x is StageItem => !!x),
    started: plan.started.filter((id) => id !== plan.large).map((id) => item(id)?.name ?? 'Someone'),
  });
}

function setMode(next: ViewMode) {
  mode = next;
  if (mode === '3d') pitch = 0;
  if (mode === '2d' && document.pointerLockElement) document.exitPointerLock();
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  updateHints();
  sendState(true);
}

function updateHints() {
  $('help').innerHTML =
    mode === '2d'
      ? '<b>WASD</b>/arrows move · <b>Shift</b> run · <b>Space</b> jump · <b>Tab</b> first person · <b>Enter</b> chat · <b>+/-</b> zoom · <b>M</b> mic · <b>C</b> camera · <b>G</b> my desk · click a desk'
      : '<b>WASD</b> move · <b>mouse</b> look around · <b>←→</b> turn · <b>Shift</b> run · <b>Space</b> jump · <b>Tab</b> top-down · <b>Enter</b> chat · <b>M</b> mic · <b>C</b> camera · <b>G</b> my desk · <b>F</b> desk menu';
  updateLockHint();
}

/** "Click to look around" shows in first person until the mouse is captured, but never over the desk card. */
function updateLockHint() {
  $('lockHint').hidden = !(mode === '3d' && document.pointerLockElement !== canvas && !deskCardOpen());
}

// ---------------------------------------------------------------- network

let lastSent = { x: 0, y: 0, a: 0, mode: '2d' as ViewMode, moving: false, at: 0 };

function sendState(force = false) {
  const now = performance.now();
  const changed =
    Math.abs(me.x - lastSent.x) > 0.01 || Math.abs(me.y - lastSent.y) > 0.01 ||
    Math.abs(me.a - lastSent.a) > 0.02 || me.mode !== lastSent.mode || me.moving !== lastSent.moving;
  if (!force && (now - lastSent.at < 66 || (!changed && now - lastSent.at < 2000))) return;
  me.mode = mode;
  net.send({ t: 'state', x: me.x, y: me.y, a: me.a, mode, moving: me.moving });
  lastSent = { x: me.x, y: me.y, a: me.a, mode, moving: me.moving, at: now };
}

function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'welcome':
      me.id = msg.id;
      session.isAdmin = !!msg.isAdmin;
      session.token = msg.session ?? '';
      session.canBuild = !!msg.canBuild;
      buildBtn.hidden = !session.canBuild;
      updateCustomObjects(msg.objects ?? [], () => builder.refreshPanel()); // before the office loads: it may place them
      session.ice = msg.ice ?? [];
      session.sprites = msg.sprites ?? [];
      media.setIceServers(session.ice);
      {
        // After a reconnect the server has forgotten our status: say it again, unless it has run out.
        const mine = expireStatus(me.status, Date.now());
        setMyStatus(mine);
        if (mine.kind !== 'available' || mine.text) net.send({ t: 'status', ...mine });
      }
      if (msg.office) setOffice(msg.office);
      onWelcome();
      if (me.mic || me.cam) net.send({ t: 'media', mic: me.mic, cam: me.cam });
      others.clear();
      for (const p of msg.players) others.set(p.id, toPlayer(p));
      renderPeople();
      setHelperStatus(msg.helper, msg.helperCooling);
      void afterWelcome(msg.layoutRev, msg.items ?? []);
      break;
    case 'join':
      others.set(msg.player.id, toPlayer(msg.player));
      systemLine(`${msg.player.name} joined`);
      renderPeople();
      break;
    case 'leave': {
      const p = others.get(msg.id);
      others.delete(msg.id);
      if (p) systemLine(`${p.name} left`);
      refreshCallPanel();
      renderPeople();
      break;
    }
    case 'jump': {
      const p = others.get(msg.id);
      if (p) p.jumpAt = Date.now();
      break;
    }
    case 'state': {
      const p = others.get(msg.id);
      if (!p) return;
      p.tx = msg.x;
      p.ty = msg.y;
      p.ta = msg.a;
      p.moving = msg.moving;
      if (p.mode !== msg.mode) {
        p.mode = msg.mode;
        renderPeople();
      }
      break;
    }
    case 'chat':
      onChat(msg.id, msg.name, msg.text, msg.zone, msg.scope ?? 'office');
      break;
    case 'links': {
      const wasTalking = !!conversation;
      links = msg.links;
      conversation = msg.conversation;
      if (conversation && !wasTalking) void warnIfDevicesBlocked();
      convFull = !!msg.full;
      media.setLinks(links, me.id);
      media.setVideoAllowed(!conversation?.video || conversation.video.includes(me.id));
      updateChatScope();
      syncInk();
      refreshCallPanel();
      break;
    }
    case 'ink':
      inkStore.add(msg, inkColorOf(msg.from), performance.now());
      shareStage.wakeInk();
      break;
    case 'inkClear':
      inkStore.clear(msg.shareId, msg.scope, msg.from);
      shareStage.wakeInk();
      break;
    case 'inkSlow':
      shareStage.pausePen(1000);
      break;
    case 'rtc':
      void media.onSignal(msg.from, msg.data);
      break;
    case 'shareState':
      if (msg.on) {
        // A late reply, after you pressed Stop, must not bring the banner back.
        if (shareStatus !== 'idle') shareStatus = 'sharing';
        refreshCallPanel();
      } else if (msg.reason === 'stopped' && stopsAwaited > 0) {
        // The answer to our own Stop. If Share screen was pressed again before it came, that newer capture must survive.
        stopsAwaited--;
        if (shareStatus === 'idle') refreshCallPanel();
      } else {
        stopShareLocally();
        const text = msg.reason && SHARE_ENDED[msg.reason];
        if (text) notice(text, { key: 'share', ttlMs: 6000 });
      }
      break;
    case 'notify':
      if (!handleSocialNotify(msg)) onNotify(msg);
      break;
    case 'office':
      setOffice(msg);
      break;
    case 'adminState':
      setAdminState(msg.areaAllowed, msg.buildingEnabled, msg.helperEnabled);
      break;
    case 'objects':
      updateCustomObjects(msg.objects, () => builder.refreshPanel());
      recompile();
      break;
    case 'items':
      void syncItems(msg.items);
      break;
    case 'helper':
      setHelperStatus(msg.status, msg.cooling);
      break;
    case 'layout':
      void onLayoutPublished(msg.rev, msg.by.name);
      break;
    case 'building':
      session.canBuild = msg.canBuild;
      buildBtn.hidden = !msg.canBuild;
      setBuilding(msg.enabled);
      if (!msg.canBuild) builder.buildingOff();
      break;
    case 'correct':
      me.x = msg.x;
      me.y = msg.y;
      blocked(msg.reason, msg.areaId, msg.deskId);
      sendState(true);
      break;
    case 'teleport':
      // The server asked us to move (to our desk, or to an invitation); the move itself is ours to make.
      me.x = msg.x;
      me.y = msg.y;
      sendState(true);
      break;
    case 'sprites':
      session.sprites = msg.sprites;
      onSprites(msg);
      // Sheets may have changed: redraw everyone who wears one.
      for (const p of [me, ...others.values()]) if (p.avatarChoice.kind !== 'built-in') void applyAvatar(p, p.avatarChoice);
      break;
    case 'presence': {
      if (msg.avatar) {
        // The server may have corrected our own choice, so our own presence counts too.
        const who = msg.id === me.id ? me : others.get(msg.id);
        if (who) void applyAvatar(who, msg.avatar);
      }
      if (msg.id === me.id && msg.status) setMyStatus(msg.status); // e.g. a time-limited status ran out
      const p = others.get(msg.id);
      if (!p) break;
      if (msg.mic !== undefined) p.mic = msg.mic;
      if (msg.cam !== undefined) p.cam = msg.cam;
      if (msg.status) p.status = msg.status;
      refreshCallPanel();
      break;
    }
  }
}

let spawned = false;

/** Loads the published office before our first position goes out, so we start at its spawn point, not an old one. */
async function afterWelcome(rev: number | undefined, items: ItemInfo[]) {
  await syncItems(items); // before the office loads: it may place them
  if (rev !== undefined && rev !== session.layoutRev) await loadLayout();
  if (!spawned) {
    me.x = SPAWN.x;
    me.y = SPAWN.y;
    spawned = true;
  }
  sendState(true);
}

/** Someone published a new layout: fetch it, and say who changed the office. */
async function onLayoutPublished(rev: number, by: string) {
  if (rev <= session.layoutRev) return;
  await loadLayout(rev);
  builder.publishedChanged();
  if (!builder.ownRev(rev)) notice(`${by} updated the office`, { key: 'layout', ttlMs: 4000 });
}

function onChat(id: string, name: string, text: string, zone: string | null, scope: ChatScope) {
  const p = id === me.id ? me : others.get(id);
  if (p) p.bubble = { text, until: performance.now() + BUBBLE_MS };
  const line = document.createElement('div');
  const who = document.createElement('b');
  who.textContent = name;
  who.style.color = p?.look.shirt ?? '#fff';
  line.append(who, document.createTextNode(` ${text}`));
  if (zone) line.prepend(Object.assign(document.createElement('span'), { className: 'tag', textContent: '🔒' }));
  else if (scope === 'nearby') line.prepend(Object.assign(document.createElement('span'), { className: 'tag', textContent: '👥' }));
  appendLine(line);
}

function systemLine(text: string) {
  appendLine(Object.assign(document.createElement('div'), { className: 'sys', textContent: text }));
}

function appendLine(el: HTMLElement) {
  chatLog.append(el);
  while (chatLog.childElementCount > 80) chatLog.firstElementChild!.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}

// -------------------------------------------------------------------- HUD

let lastPeopleKey = '';

function renderPeople() {
  const list = [me, ...others.values()];
  const near = new Set(
    list.filter((p) => p !== me && Math.hypot(p.x - me.x, p.y - me.y) < NEARBY_RADIUS).map((p) => p.id),
  );
  const key = list.map((p) => `${p.id}${p.name}${p.mode}${near.has(p.id)}${p.status.kind}${p.status.text ?? ''}`).join('|') + online;
  if (key === lastPeopleKey) return;
  lastPeopleKey = key;

  const el = $('people');
  el.replaceChildren();
  const head = document.createElement('div');
  head.className = 'head';
  head.textContent = online ? `${list.length} in the office` : 'Offline · solo mode';
  el.append(head);
  for (const p of list) {
    const row = document.createElement('div');
    row.className = 'person' + (near.has(p.id) ? ' near' : '');
    const dot = Object.assign(document.createElement('i'), {});
    dot.style.background = p.look.shirt;
    const state = Object.assign(document.createElement('i'), { className: 'st', title: p.status.kind === 'dnd' ? 'Do Not Disturb' : p.status.kind });
    state.style.background = statusColor(p.status);
    const label = document.createTextNode(p === me ? `${p.name} (you)` : p.name);
    row.append(dot, state, label);
    if (p.mode === '3d') row.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: '1P' }));
    if (p.status.text) row.append(Object.assign(document.createElement('span'), { className: 'what', textContent: p.status.text, title: p.status.text }));
    if (p !== me && online) {
      const acts = document.createElement('span');
      acts.className = 'acts';
      const act = (text: string, title: string, onClick: () => void) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text, title });
        b.onclick = onClick;
        acts.append(b);
      };
      act('Wave', `Wave at ${p.name}`, () => {
        net.send({ t: 'wave', to: p.id });
        notice(`Waved at ${p.name}`, { key: `waved:${p.id}`, ttlMs: 1800 });
      });
      act('Ring', `Ring ${p.name}: they can come to you`, () => {
        net.send({ t: 'ring', to: p.id });
        notice(`Ringing ${p.name}…`, { key: `ringing:${p.id}`, ttlMs: 2500 });
      });
      row.append(acts);
    }
    el.append(row);
  }
}

function renderZone() {
  const z = areaAt(me.x, me.y);
  const priv = z?.private ? z : null;
  // Private rooms show an occupancy label (on the map in top-down, as a banner in first-person).
  $('zone').textContent = z && !priv ? z.name : '';
  $('zone').hidden = !z || !!priv;
  renderer2d.areaLabel = priv ? areaLabel(priv) : null;
  updateArea(priv, mode);
  showDeskHint(mode === '3d' && !deskCardOpen() ? facedDesk() : null);
  updateLockHint();
}

// A new office arrived: repaint the map, rebuild the first-person view, and drop anything that pointed at the old one.
onWorldChange((w) => {
  if (!builder.active) renderer2d.setWorld(w);
  raycaster.rebuild();
  hoverDesk = null;
  closeDeskCard();
  lastPeopleKey = '';
});

// ------------------------------------------------------------- game loop

function update(dt: number) {
  if (builder.active) {
    builder.update(dt, keys);
    updateOthers(dt);
    return;
  }
  const run = held('ShiftLeft', 'ShiftRight') ? 1.8 : 1;
  let vx = 0, vy = 0;
  if (mode === '2d') {
    vx = +held('KeyD', 'ArrowRight') - +held('KeyA', 'ArrowLeft');
    vy = +held('KeyS', 'ArrowDown') - +held('KeyW', 'ArrowUp');
    if (vx || vy) me.a = Math.atan2(vy, vx);
  } else {
    me.a += (+held('ArrowRight', 'KeyE') - +held('ArrowLeft', 'KeyQ')) * TURN_SPEED * dt;
    const fwd = +held('KeyW', 'ArrowUp') - +held('KeyS', 'ArrowDown');
    const strafe = +held('KeyD') - +held('KeyA');
    const c = Math.cos(me.a), s = Math.sin(me.a);
    vx = c * fwd - s * strafe;
    vy = s * fwd + c * strafe;
  }
  const len = Math.hypot(vx, vy);
  me.moving = len > 0;
  if (len > 0) {
    const step = (WALK_SPEED * run * dt) / len;
    const next = moveWithCollision(me.x, me.y, vx * step, vy * step);
    // Do not walk into a room we expect to be turned away from; the server still decides.
    const refused = predictEntry(me.x, me.y, next.x, next.y);
    if (refused) {
      if (refused === 'locked') blocked(refused, undefined, deskAt(next.x, next.y)?.id);
      else blocked(refused, areaAt(next.x, next.y)?.id);
      me.moving = false;
    } else {
      Object.assign(me, next);
      me.animT += dt * run;
    }
  }

  updateOthers(dt);

  for (const l of links) {
    const p = others.get(l.peer);
    if (p) media.setGain(l.peer, gainFor(l.kind, l.context, Math.hypot(p.x - me.x, p.y - me.y)));
  }

  sendState();
}

/** Eases other people toward where the server last saw them. */
function updateOthers(dt: number) {
  const ease = Math.min(1, dt * 12);
  for (const p of others.values()) {
    if (Math.hypot(p.tx - p.x, p.ty - p.y) > 3) {
      p.x = p.tx;
      p.y = p.ty;
    }
    p.x += (p.tx - p.x) * ease;
    p.y += (p.ty - p.y) * ease;
    p.a += Math.atan2(Math.sin(p.ta - p.a), Math.cos(p.ta - p.a)) * ease;
    if (p.moving) p.animT += dt;
  }
}

/** `w` is the canvas width in CSS pixels. */
function drawMinimap(w: number) {
  const s = 4;
  const mw = MAP_W * s, mh = MAP_H * s;
  const x = w - mw - 16, y = 16;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(x - 3, y - 3, mw + 6, mh + 6);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(renderer2d.map, x, y, mw, mh);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  for (const p of others.values()) {
    ctx.fillStyle = p.look.shirt;
    ctx.fillRect(x + p.x * s - 2, y + p.y * s - 2, 4, 4);
  }
  const cx = x + me.x * s, cy = y + me.y * s;
  ctx.fillStyle = 'rgba(255, 240, 150, 0.35)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 22, me.a - 0.58, me.a + 0.58);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
}

function render(now: number) {
  const w = canvas.width, h = canvas.height;
  const people = [me, ...others.values()];
  // Which desk space you are in: a strong highlight top-down, and the "Your desk" cue in both views.
  const { highlight, view } = deskPresenceNow(me, now);
  showDeskCue(view ? null : deskCueText(highlight)); // once the desk view is open its heading says "Your desk"
  const room = roomViewNow(me, now);
  if (view !== deskView || room !== roomView) {
    deskView = view;
    roomView = room;
    refreshCallPanel(); // the desk or room view opens or closes
  }
  if (mode === '2d') {
    renderer2d.deskPresence = highlight && { tiles: highlight.tiles, mine: highlight.mine };
    renderer2d.deskTags = deskTags(hoverDesk);
    renderer2d.render(ctx, w, h, zoom, dpr, me, people, now);
  } else {
    raycaster.resize(w, h);
    raycaster.markers = deskMarkers();
    const labels = raycaster.render(me, [...others.values()], Date.now(), pitch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raycaster.canvas, 0, 0, w, h);
    // Labels and the minimap are laid out in CSS pixels.
    ctx.save();
    ctx.scale(dpr, dpr);
    const sx = w / dpr / raycaster.w, sy = h / dpr / raycaster.h;
    for (const m of raycaster.markerLabels) drawNameTag(ctx, m.text, m.x * sx, m.y * sy, 16, m.dot);
    for (const l of labels) {
      const top = drawNameTag(ctx, l.player.name, l.x * sx, l.y * sy - 4, 18, statusColor(l.player.status));
      if (l.player.bubble && l.player.bubble.until > now) drawBubble(ctx, l.player.bubble.text, l.x * sx, top);
    }
    drawMinimap(w / dpr);
    ctx.restore();
  }
}

function resize() {
  const next = window.devicePixelRatio || 1;
  if (next !== dpr) {
    zoom = rescale(zoom, dpr, next);
    dpr = next;
  }
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.imageSmoothingEnabled = false;
}

/** Moving the window to another screen (or browser zoom) changes the pixel ratio without a resize event on some browsers. */
function watchPixelRatio() {
  const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  query.addEventListener('change', () => {
    resize();
    watchPixelRatio();
  }, { once: true });
}

/** Waits (briefly) for the interface font, so the first name tags are measured with it. */
async function loadUiFont() {
  const loaded = Promise.all([document.fonts.load('700 14px Nunito'), document.fonts.ready]).catch(() => {});
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

async function start() {
  await loadUiFont();
  resize();
  window.addEventListener('resize', resize);
  watchPixelRatio();
  // Paint the office behind the join card.
  renderer2d.render(ctx, canvas.width, canvas.height, zoom, dpr, { x: SPAWN.x, y: SPAWN.y - 6 } as Player, [], 0);

  const profile = await showJoinScreen();
  me = {
    id: 'local', memberId: getMemberId(), name: profile.name, look: profile.look, avatar: makeAvatar(profile.look),
    avatarChoice: profile.avatar,
    x: SPAWN.x, y: SPAWN.y, a: -Math.PI / 2, tx: SPAWN.x, ty: SPAWN.y, ta: 0, mode: '2d', moving: false, animT: 0,
    mic: false, cam: false, status: { kind: 'available' },
  };
  $('hud').hidden = false;
  setMode('2d');
  systemLine(`Welcome, ${me.name}! Walk up to someone to start a conversation, or into a meeting room for a private one.`);

  net.onMessage = onMessage;
  net.onStatus = (isOnline) => {
    online = isOnline;
    if (!isOnline) {
      others.clear();
      links = [];
      conversation = null;
      convFull = false;
      stopsAwaited = 0;
      selfLarge = false;
      if (shareStatus !== 'idle') stopShareLocally(); // the server dropped the share with the connection
      media.setLinks([], me.id);
      updateChatScope();
      refreshCallPanel();
    }
    renderPeople();
  };
  const admin = new URLSearchParams(location.search).get('admin') ?? undefined;
  media.onSignalOut = (to, data) => net.send({ t: 'rtc', to, data });
  media.onChange = refreshCallPanel;
  shareStage.onPick = (id) => {
    pickedShare = id;
    refreshCallPanel();
  };
  shareStage.onScreenVolume = (sharer, value) => media.setScreenGain(sharer, value);
  shareStage.bindInk({
    store: inkStore,
    selfId: () => me.id,
    colorOf: inkColorOf,
    nameOf: (id) => others.get(id)?.name ?? 'Someone',
  });
  shareStage.onInk = (m) => net.send(m);
  shareStage.onInkClear = (shareId, scope) => net.send({ t: 'inkClear', shareId, scope });
  shareStage.onInkAllow = (shareId, on) => net.send({ t: 'inkAllow', shareId, on });
  shareStage.onPenChange = (on) => {
    if (on) keys.clear();
  };
  // Clicking the call panel frees the mouse in first person, so the buttons and the stage can be used.
  $('callPanel').addEventListener('pointerdown', () => document.exitPointerLock());
  media.onDeviceLost = onDeviceLost;
  media.onSpeaking = (speaking) => {
    speakingWanted = speaking;
    flushSpeaking();
  };
  initStatus({ send: (m) => net.send(m), current: () => me.status, apply: setMyStatus });
  initOfficeUi({
    send: (m) => net.send(m),
    people: () => [me, ...others.values()].map((p) => ({ memberId: p.memberId, name: p.name })),
    me: () => ({ memberId: me.memberId, x: me.x, y: me.y, a: me.a }),
  });
  void applyAvatar(me, profile.avatar);
  joinMsg = { t: 'join', name: me.name, look: me.look, memberId: getMemberId(), avatar: profile.avatar, admin };
  net.connect(joinMsg);
  renderPeople();

  let last = performance.now();
  let hudTimer = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(now);
    if ((hudTimer += dt) > 0.25) {
      hudTimer = 0;
      renderZone();
      renderPeople();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
