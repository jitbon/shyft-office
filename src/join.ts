import type { AvatarChoice, Layer, Look, SpriteIndex } from '../shared/protocol';
import { LAYER_ORDER } from '../shared/sprites';
import {
  CLOTH_COLORS, DEFAULTS, HAIR_COLORS, SKIN_TONES, byKind, optionOf, outfitGroups, randomLook, type WardrobeKind,
} from '../shared/wardrobe';
import { drawCharacter, loadAvatar, makeAvatar, type Avatar, type Dir } from './art';
import { session } from './session';

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

/** The character the server saved for this member, so it follows them to any device (none for a new member or offline). */
async function fetchSavedCharacter(): Promise<AvatarChoice | null> {
  try {
    const res = await fetch('/api/character', { headers: { 'X-Shyft-Member': getMemberId() } });
    return res.ok ? ((await res.json()) as { avatar?: AvatarChoice }).avatar ?? null : null;
  } catch {
    return null;
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

  // On joining, the server's copy comes first, then this browser's, then a random character.
  let saved = opts.initial;
  if (opts.joining) {
    const remote = await fetchSavedCharacter();
    if (remote) saved = { ...saved, avatar: remote, ...(remote.kind === 'built-in' ? { look: remote.look } : {}) };
  }
  let look: Look = saved?.look ? { ...saved.look } : randomLook();
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
  for (const id of ['cats', 'options', 'colors', 'sheets', 'layers']) document.getElementById(id)!.replaceChildren();
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

  // ---- built-in tab: category tabs, a grid of options drawn on your own character, and a color row
  const TABS: { id: string; label: string; kind?: WardrobeKind }[] = [
    { id: 'hair', label: 'Hair', kind: 'hairStyle' }, { id: 'face', label: 'Face', kind: 'face' }, { id: 'skin', label: 'Skin' },
    { id: 'top', label: 'Top', kind: 'top' }, { id: 'bottom', label: 'Bottoms', kind: 'bottom' }, { id: 'shoes', label: 'Shoes', kind: 'shoes' },
    { id: 'accessory', label: 'Accessory', kind: 'accessory' }, { id: 'outfit', label: 'Outfits', kind: 'outfit' },
  ];
  const catsEl = document.getElementById('cats')!;
  const optionsEl = document.getElementById('options')!;
  const colorsEl = document.getElementById('colors')!;
  const backToMe = document.getElementById('backToMe') as HTMLButtonElement;
  const surprise = document.getElementById('surprise') as HTMLButtonElement;
  let tab = TABS[0];

  const changed = () => {
    choice = { kind: 'built-in', look };
    refreshPreview();
    renderPicker();
  };
  /** Picking a part while an outfit is on takes the outfit off, so the part shows. */
  const setPart = (apply: () => void) => {
    delete look.outfit;
    delete look.outfitColor;
    apply();
    changed();
  };
  const partOf = (kind: WardrobeKind): string | undefined => (look as unknown as Record<string, string | undefined>)[kind];
  const withoutOutfit = (): Look => {
    const l = { ...look };
    delete l.outfit;
    delete l.outfitColor;
    return l;
  };

  const tile = (name: string, l: Look | null, on: boolean, pick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.title = name;
    b.classList.toggle('on', on);
    if (l) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(drawCharacter(l, 'down', 0), 0, 0, 64, 64);
      b.append(c);
    } else {
      b.append(Object.assign(document.createElement('div'), { className: 'none', textContent: '✕' }));
    }
    b.append(document.createTextNode(name));
    b.onclick = pick;
    return b;
  };

  const colorRow = (label: string, colors: string[], current: string, pick: (c: string) => void) => {
    const row = document.createElement('div');
    row.className = 'row';
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const color of colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = color;
      b.setAttribute('aria-label', `${label} ${color}`);
      b.classList.toggle('on', color.toLowerCase() === current.toLowerCase());
      b.onclick = () => pick(color);
      sw.append(b);
    }
    row.append(Object.assign(document.createElement('span'), { textContent: label }), sw);
    colorsEl.append(row);
  };

  function renderPicker() {
    catsEl.replaceChildren(...TABS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.label;
      b.classList.toggle('on', t === tab);
      b.onclick = () => {
        tab = t;
        renderPicker();
      };
      return b;
    }));
    optionsEl.replaceChildren();
    colorsEl.replaceChildren();
    backToMe.hidden = !look.outfit;

    const kind = tab.kind;
    if (kind === 'outfit') {
      for (const group of outfitGroups(new Date())) {
        optionsEl.append(Object.assign(document.createElement('h3'), { textContent: group.name }));
        for (const o of group.outfits) {
          const l: Look = { ...look, outfit: o.id };
          if (o.colors) l.outfitColor = o.colors[0];
          else delete l.outfitColor;
          optionsEl.append(tile(o.name, l, look.outfit === o.id, () => {
            look.outfit = o.id;
            if (o.colors) look.outfitColor = o.colors[0];
            else delete look.outfitColor;
            changed();
          }));
        }
      }
      const current = look.outfit ? optionOf('outfit', look.outfit) : undefined;
      if (current?.colors) {
        colorRow('Color', current.colors, look.outfitColor ?? current.colors[0], (c) => {
          look.outfitColor = c;
          changed();
        });
      }
      return;
    }

    if (kind) {
      const base = withoutOutfit();
      if (kind === 'accessory') {
        optionsEl.append(tile('None', null, !look.accessory, () => setPart(() => {
          delete look.accessory;
          delete look.accessoryColor;
        })));
      }
      const field = kind as Exclude<WardrobeKind, 'outfit'>;
      for (const o of byKind(kind)) {
        const on = (partOf(kind) ?? (DEFAULTS as Record<string, string>)[kind]) === o.id;
        optionsEl.append(tile(o.name, { ...base, [field]: o.id }, on, () => setPart(() => {
          (look as unknown as Record<string, string>)[field] = o.id;
        })));
      }
    }
    const colors: Record<string, [string, string[], string, (c: string) => void] | undefined> = {
      hair: ['Hair color', HAIR_COLORS, look.hair, (c) => (look.hair = c)],
      skin: ['Skin tone', SKIN_TONES, look.skin, (c) => (look.skin = c)],
      top: ['Top color', CLOTH_COLORS, look.shirt, (c) => (look.shirt = c)],
      bottom: ['Bottom color', CLOTH_COLORS, look.bottomColor ?? DEFAULTS.bottomColor, (c) => (look.bottomColor = c)],
    };
    const acc = look.accessory ? optionOf('accessory', look.accessory) : undefined;
    if (tab.id === 'accessory' && acc?.colored) {
      colors.accessory = ['Color', CLOTH_COLORS, look.accessoryColor ?? CLOTH_COLORS[0], (c) => (look.accessoryColor = c)];
    }
    const row = colors[tab.id];
    if (row) colorRow(row[0], row[1], row[2], (c) => setPart(() => row[3](c)));
  }

  surprise.onclick = () => {
    look = randomLook();
    changed();
  };
  backToMe.onclick = () => setPart(() => {});
  renderPicker();

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
    surprise.hidden = isCustom;
    backToMe.hidden = isCustom || !look.outfit;
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
    for (const [id, d] of [['pvFront', 'down'], ['pvSide', 'right'], ['pvBack', 'up']] as const) {
      const v = document.getElementById(id) as HTMLCanvasElement;
      const g = v.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, v.width, v.height);
      g.drawImage(avatar.frames[d][0], 0, 0, v.width, v.height);
    }
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
