// The "Now playing" card for a Jam Room: who is listening, what plays, the queue, and the box to paste a song link into.
import { QUEUE_MAX } from '../../shared/jam';
import type { ClientMsg } from '../../shared/protocol';
import type { JamClient } from './client';
import type { Mixer } from './mixer';

const NOTE = '♪';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** "Ana, Ben and 2 others"; the person who added the current song comes first and carries a note mark. */
export function listenerLine(names: string[], adder?: string): string {
  const ordered = adder && names.includes(adder) ? [adder, ...names.filter((n, i) => n !== adder || i !== names.indexOf(adder))] : names;
  const label = (n: string) => (adder && n === adder ? `${n} ${NOTE}` : n);
  if (ordered.length <= 2) return ordered.map(label).join(' and ');
  const rest = ordered.length - 2;
  return `${ordered.slice(0, 2).map(label).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

export class JamCard {
  /** Where the provider's embedded player goes. */
  readonly playerHost = el('div', 'jamPlayerHost');
  private client!: JamClient;
  private folded = false;
  private pendingAddAt = 0;

  private head = el('div', 'jamHead');
  private title = el('span', 'jamTitle');
  private fold = el('button', 'jamFold');
  private listeners = el('div', 'jamListeners');
  private body = el('div', 'jamBody');
  private click = el('button', 'jamClick', 'Click to start the music');
  private station = el('div', 'jamStation');
  private failed = el('div', 'jamFailed', "Songs can't load right now. The station is still playing.");
  private trackLine = el('div', 'jamTrackLine');
  private skip = el('button', 'jamSkip', 'Skip');
  private volume = el('input', 'jamVolume');
  private mute = el('button', 'jamMute');
  private queue = el('ol', 'jamQueue');
  private count = el('div', 'jamCount');
  private input = el('input', 'jamInput');
  private addBtn = el('button', 'jamAdd', 'Add');
  private message = el('div', 'jamMessage');

  constructor(private root: HTMLElement, private mixer: Mixer, private send: (m: ClientMsg) => void) {
    this.fold.type = 'button';
    this.fold.setAttribute('aria-label', 'Fold the music card');
    this.fold.onclick = () => {
      this.folded = !this.folded;
      this.render();
    };
    this.head.append(this.title, this.mute, this.fold);

    this.click.type = 'button';
    this.click.onclick = () => void this.client.unlock();

    this.station.append(el('div', 'jamBars'), el('div', 'jamStationName', 'Office Lofi'));
    this.skip.type = 'button';
    this.skip.onclick = () => this.send({ t: 'jam', op: 'skip' });
    this.volume.type = 'range';
    this.volume.min = '0';
    this.volume.max = '100';
    this.volume.setAttribute('aria-label', 'Music volume');
    this.volume.oninput = () => {
      this.mixer.setVolume(Number(this.volume.value) / 100);
      this.render();
    };
    this.mute.type = 'button';
    this.mute.onclick = () => {
      this.mixer.setMuted(!this.mixer.muted);
      this.render();
    };

    this.input.type = 'text';
    this.input.maxLength = 300;
    this.input.placeholder = 'Paste a link to a song';
    this.input.setAttribute('aria-label', 'Link to a song');
    this.input.onkeydown = (e) => {
      e.stopPropagation(); // typing here must not walk the character
      if (e.key === 'Enter') this.submit();
    };
    this.input.onkeyup = (e) => e.stopPropagation();
    this.addBtn.type = 'button';
    this.addBtn.onclick = () => this.submit();
    const add = el('div', 'jamAddRow');
    add.append(this.input, this.addBtn);

    const controls = el('div', 'jamControls');
    controls.append(this.skip, this.volume);
    this.body.append(this.click, this.playerHost, this.station, this.failed, this.trackLine, controls, this.queue, this.count, add, this.message);
    this.root.append(this.head, this.listeners, this.body);
    // Clicking the card frees the mouse in first person, as the other panels do.
    this.root.addEventListener('pointerdown', () => document.exitPointerLock());
  }

  bind(client: JamClient) {
    this.client = client;
  }

  private submit() {
    const url = this.input.value.trim();
    if (!url) return;
    this.pendingAddAt = performance.now();
    this.message.textContent = '';
    this.send({ t: 'jam', op: 'add', url });
    this.input.value = '';
  }

  /** An error the server sent just after an add shows under the field. True when it was taken. */
  refusal(text: string): boolean {
    if (!this.client.inRoom() || performance.now() - this.pendingAddAt > 5000) return false;
    this.message.textContent = text;
    return true;
  }

  render() {
    const s = this.client.state;
    this.root.hidden = !s;
    if (!s) {
      this.message.textContent = '';
      return;
    }
    const cur = s.track;
    this.title.textContent = `${NOTE} ${s.name}`;
    this.mute.textContent = this.mixer.muted ? 'Unmute' : 'Mute';
    this.mute.setAttribute('aria-label', this.mixer.muted ? 'Unmute the music' : 'Mute the music');
    this.fold.textContent = this.folded ? 'Open' : 'Fold';
    this.root.classList.toggle('folded', this.folded);
    this.listeners.textContent = this.folded
      ? cur ? cur.title : 'Office Lofi'
      : listenerLine(s.listeners, cur?.byName);
    // Folding keeps the player: the provider requires it to stay visible while a song plays, so only the rest folds away.
    this.playerHost.classList.toggle('active', !!cur);
    if (this.folded) return;

    this.station.hidden = !!cur || s.mode === 'track';
    this.click.hidden = !this.client.needsClick;
    this.failed.hidden = !this.client.songsFailed;
    this.trackLine.textContent = cur
      ? `${cur.title} · added by ${cur.byName}${cur.len ? ` · ${Math.floor(cur.len / 60)}:${String(cur.len % 60).padStart(2, '0')}` : ''}`
      : s.mode === 'track'
        ? 'Up next…'
        : s.queue.length
          ? 'Starting the next song…'
          : 'Office Lofi · nobody has queued anything';
    this.skip.hidden = !cur;
    this.volume.value = String(Math.round(this.mixer.volume * 100));

    this.queue.replaceChildren(
      ...s.queue.map((q) => {
        const li = el('li');
        li.append(el('span', 'jamQTitle', q.title), el('span', 'jamQBy', ` · ${q.byName}`));
        if (q.mine) {
          const x = el('button', 'jamRemove', '×');
          x.type = 'button';
          x.setAttribute('aria-label', `Remove ${q.title}`);
          x.onclick = () => this.send({ t: 'jam', op: 'remove', id: q.id });
          li.append(x);
        }
        return li;
      }),
    );
    this.count.textContent = `${s.queue.length} / ${QUEUE_MAX}`;
  }
}
