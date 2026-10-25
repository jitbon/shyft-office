import type { AvatarChoice, Layer, Look, SpriteIndex } from '../shared/protocol';
import { LAYER_ORDER } from '../shared/sprites';
import { loadAvatar, makeAvatar, type Avatar, type Dir } from './art';
import { session } from './session';

const SHIRTS = ['#e04f5f', '#f29e4c', '#f1c453', '#5cb85c', '#3fa7d6', '#7b68ee', '#e86fb0', '#3d4452'];
const HAIRS = ['#2b1d14', '#5a3825', '#a0522d', '#d9a441', '#e8e1d5', '#c0392b', '#3b5bdb', '#111111'];
const SKINS = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];

const STORAGE_KEY = 'shyft-office:profile';
const MEMBER_KEY = 'shyft-office:member';

export interface Profile {
  name: string;
  look: Look;
  avatar: AvatarChoice;
}

/** A random id that stays the same in this browser, so desk claims survive reloads. */
export function getMemberId(): string {
  try {
    const saved = localStorage.getItem(MEMBER_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(MEMBER_KEY, id);
    return id;
  } catch {
    // storage unavailable: this session just gets a fresh id
    return crypto.randomUUID();
  }
}

function loadProfile(): Partial<Profile> | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // private mode etc.; the profile just won't be remembered
  }
}

async function fetchSprites(): Promise<SpriteIndex> {
  try {
    const res = await fetch('/sprites/index.json');
    return res.ok ? await res.json() : [];
  } catch {
    return []; // no server yet (or solo mode): only the built-in characters
  }
}

/** A remembered choice only counts while its sheets still exist in the right slots. */
function stillValid(choice: AvatarChoice | undefined, sprites: SpriteIndex): choice is AvatarChoice {
  if (!choice) return false;
  if (choice.kind === 'sheet') return sprites.some((s) => s.id === choice.id && s.layer === 'full');
  if (choice.kind === 'layers') {
    const entries = Object.entries(choice.ids) as [Layer, string][];
    return !!choice.ids.body && entries.every(([slot, id]) => sprites.some((s) => s.id === id && s.layer === slot));
  }
  return true;
}

/** Shows the character creator and resolves once the user enters the office. */
export async function showJoinScreen(): Promise<Profile> {
  const profile = await runPicker({ initial: loadProfile(), joining: true });
  return profile!; // joining cannot be cancelled
}

/** The same creator, opened inside the office. Resolves with the new look, or null if cancelled. */
export function changeCharacter(current: Profile): Promise<Profile | null> {
  return runPicker({ initial: current, joining: false });
}

async function runPicker(opts: { initial: Partial<Profile> | null; joining: boolean }): Promise<Profile | null> {
  const sprites = await fetchSprites();
  session.sprites = sprites;

  const saved = opts.initial;
  const look: Look = saved?.look ? { ...saved.look } : {
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
    skin: SKINS[Math.floor(Math.random() * SKINS.length)],
  };
  let choice: AvatarChoice = stillValid(saved?.avatar, sprites) ? saved!.avatar! : { kind: 'built-in', look };

  const overlay = document.getElementById('join')!;
  overlay.hidden = false;
  const nameInput = document.getElementById('name') as HTMLInputElement;
  // Inside the office the name is not editable here: only the look changes.
  nameInput.parentElement!.hidden = !opts.joining;
  overlay.querySelector('h1')!.textContent = opts.joining ? 'Shyft Office' : 'Your character';
  overlay.querySelector('button.primary')!.textContent = opts.joining ? 'Enter office' : 'Save character';
  const cancel = document.getElementById('joinCancel') as HTMLButtonElement;
  cancel.hidden = opts.joining;
  for (const id of ['shirts', 'hairs', 'skins', 'sheets', 'layers']) document.getElementById(id)!.replaceChildren();
  const preview = document.getElementById('preview') as HTMLCanvasElement;
  const pctx = preview.getContext('2d')!;
  nameInput.value = saved?.name ?? '';

  // ---- the avatar being previewed
  let custom: Avatar | null = null;
  const refreshPreview = () => {
    const wanted = choice;
    custom = null;
    if (wanted.kind !== 'built-in') {
      void loadAvatar(wanted, sprites, look).then((a) => {
        if (choice === wanted) custom = a;
      });
    }
  };

  // ---- built-in tab
  const swatches = (id: string, colors: string[], key: keyof Look) => {
    const el = document.getElementById(id)!;
    for (const color of colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = color;
      b.setAttribute('aria-label', `${key} ${color}`);
      b.classList.toggle('on', look[key] === color);
      b.onclick = () => {
        look[key] = color;
        el.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === b));
        choice = { kind: 'built-in', look };
        refreshPreview();
      };
      el.appendChild(b);
    }
  };
  swatches('shirts', SHIRTS, 'shirt');
  swatches('hairs', HAIRS, 'hair');
  swatches('skins', SKINS, 'skin');

  // ---- custom tab
  const sheetsEl = document.getElementById('sheets')!;
  const layersEl = document.getElementById('layers')!;
  const hint = document.getElementById('customHint')!;
  const layerIds: Partial<Record<Layer, string>> = choice.kind === 'layers' ? { ...choice.ids } : {};
  const selects = new Map<Layer, HTMLSelectElement>();

  const markSheets = () => {
    sheetsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', choice.kind === 'sheet' && b.dataset.id === choice.id));
  };
  const fromLayers = () => {
    const chosen = Object.fromEntries(Object.entries(layerIds).filter(([, id]) => id)) as Partial<Record<Layer, string>>;
    if (chosen.body) {
      choice = { kind: 'layers', ids: chosen };
      hint.textContent = '';
    } else {
      choice = { kind: 'built-in', look };
      hint.textContent = Object.keys(chosen).length ? 'Pick a body to build a character from parts.' : '';
    }
    markSheets();
    refreshPreview();
  };

  const full = sprites.filter((s) => s.layer === 'full');
  for (const s of full) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.dataset.id = s.id;
    b.title = s.author ? `by ${s.author}` : s.name;
    b.onclick = () => {
      for (const sel of selects.values()) sel.value = '';
      for (const k of Object.keys(layerIds)) delete layerIds[k as Layer];
      choice = { kind: 'sheet', id: s.id };
      hint.textContent = '';
      markSheets();
      refreshPreview();
    };
    sheetsEl.append(b);
  }
  if (!full.length) sheetsEl.textContent = 'none yet';

  for (const slot of LAYER_ORDER) {
    const options = sprites.filter((s) => s.layer === slot);
    if (!options.length) continue;
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.append(Object.assign(document.createElement('option'), { value: '', textContent: 'None' }));
    for (const s of options) select.append(Object.assign(document.createElement('option'), { value: s.id, textContent: s.name }));
    select.value = layerIds[slot] ?? '';
    select.onchange = () => {
      if (select.value) layerIds[slot] = select.value;
      else delete layerIds[slot];
      fromLayers();
    };
    selects.set(slot, select);
    label.append(document.createTextNode(slot), select);
    layersEl.append(label);
  }
  if (!sprites.length) {
    hint.innerHTML = 'No custom characters yet. Draw one with the <a href="/sprites/FORMAT.md" target="_blank">sprite format</a> and an admin can add it.';
  }
  markSheets();

  // ---- tabs
  const tabBuiltIn = document.getElementById('tabBuiltIn')!;
  const tabCustom = document.getElementById('tabCustom')!;
  const showTab = (isCustom: boolean) => {
    document.getElementById('panelBuiltIn')!.hidden = isCustom;
    document.getElementById('panelCustom')!.hidden = !isCustom;
    tabBuiltIn.classList.toggle('on', !isCustom);
    tabCustom.classList.toggle('on', isCustom);
  };
  tabBuiltIn.onclick = () => {
    showTab(false);
    choice = { kind: 'built-in', look };
    refreshPreview();
  };
  tabCustom.onclick = () => showTab(true);
  showTab(choice.kind !== 'built-in');
  refreshPreview();

  // Spin the preview character while the creator is open.
  const spin: Dir[] = ['down', 'right', 'up', 'left'];
  let raf = 0;
  const draw = (t: number) => {
    const avatar = choice.kind === 'built-in' ? makeAvatar(look) : custom ?? makeAvatar(look);
    const dir = spin[Math.floor(t / 900) % 4];
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.drawImage(avatar.frames[dir][Math.floor(t / 150) % 4], 0, 0, preview.width, preview.height);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  if (opts.joining) nameInput.focus();

  return new Promise((resolve) => {
    cancel.onclick = () => {
      cancelAnimationFrame(raf);
      overlay.hidden = true;
      resolve(null);
    };
    (document.getElementById('joinForm') as HTMLFormElement).onsubmit = (e) => {
      e.preventDefault();
      const name = opts.joining ? nameInput.value.trim().slice(0, 24) || 'Guest' : saved?.name ?? 'Guest';
      const profile: Profile = {
        name,
        look: { ...look },
        avatar: choice.kind === 'built-in' ? { kind: 'built-in', look: { ...look } } : choice,
      };
      saveProfile(profile);
      cancelAnimationFrame(raf);
      overlay.hidden = true;
      resolve(profile);
    };
  });
}
