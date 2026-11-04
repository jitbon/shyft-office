// The Arena button's panel (start, join, leave, and the host's controls) and the banner everyone else sees.
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/arena';
import type { ClientMsg } from '../../shared/protocol';
import { TEAM_COLOR, TEAM_NAME, type ArenaClient } from './client';

export class ArenaPanel {
  private open = false;
  private key = '';

  constructor(
    private panel: HTMLElement,
    private banner: HTMLElement,
    private arena: ArenaClient,
    private deps: { send: (m: ClientMsg) => void; nameOf: (id: string) => string; beforeJoin: () => void; confirm: (text: string) => boolean },
  ) {}

  toggle() {
    this.open = !this.open;
    this.key = '';
  }

  close() {
    this.open = false;
    this.panel.hidden = true;
  }

  private op(op: Extract<ClientMsg, { t: 'arena' }>['op']) {
    if (op === 'start' || op === 'join') this.deps.beforeJoin();
    this.deps.send({ t: 'arena', op });
  }

  /** Call when the match changes, and now and then for the countdown. */
  update() {
    const a = this.arena;
    const m = a.match;
    const score = m ? `${TEAM_NAME.blue} ${m.wins.blue} – ${m.wins.orange} ${TEAM_NAME.orange}` : '';

    // Everyone not in the match sees a banner while one runs.
    const watching = !!m && !a.inMatch();
    this.banner.hidden = !watching;
    if (watching && m) {
      const full = a.playerCount >= MAX_PLAYERS;
      const key = `${score}|${full}`;
      if (this.banner.dataset.key !== key) {
        this.banner.dataset.key = key;
        this.banner.replaceChildren(document.createTextNode(`Office Arena: ${score}`));
        if (!full) {
          const join = Object.assign(document.createElement('button'), { textContent: 'Join', type: 'button' });
          join.onclick = () => {
            this.op('join');
            join.blur();
          };
          this.banner.append(document.createTextNode(' · '), join);
        }
      }
    }

    this.panel.hidden = !this.open;
    if (!this.open) return;
    const key = JSON.stringify([m && [m.phase, m.host, m.teams, m.wins, m.round], a.inMatch()]);
    if (key === this.key) return;
    this.key = key;
    this.panel.replaceChildren();
    const head = Object.assign(document.createElement('div'), { className: 'head', textContent: 'Office Arena' });
    this.panel.append(head);
    const add = (label: string, op: Extract<ClientMsg, { t: 'arena' }>['op'], opts: { primary?: boolean; disabled?: boolean; title?: string; ask?: string } = {}) => {
      const b = Object.assign(document.createElement('button'), { textContent: label, type: 'button', disabled: !!opts.disabled, title: opts.title ?? '' });
      if (opts.primary) b.className = 'on';
      b.onclick = () => {
        b.blur();
        if (opts.ask && !this.deps.confirm(opts.ask)) return;
        this.op(op);
      };
      this.panel.append(b);
    };
    const note = (text: string) => this.panel.append(Object.assign(document.createElement('div'), { className: 'sys', textContent: text }));

    if (!m) {
      note('Two teams, rounds, a shop between them. Everyone else in the office is left alone.');
      add('Start match', 'start', { primary: true });
      return;
    }
    note(`${score} · ${m.phase === 'lobby' ? 'waiting to begin' : `round ${m.round}`}`);
    if (a.inMatch()) {
      const host = m.host === a.me;
      if (host && m.phase === 'lobby') {
        add('Begin', 'begin', { primary: true, disabled: a.playerCount < MIN_PLAYERS, title: a.playerCount < MIN_PLAYERS ? `Needs ${MIN_PLAYERS} or more players` : '' });
      }
      if (host) {
        add('Reset', 'reset', { disabled: m.phase === 'lobby', ask: 'Reset the match to round 1?' });
        add('Stop', 'stop', { ask: 'Stop the match for everyone?' });
      }
      add('Leave', 'leave');
      for (const team of ['blue', 'orange'] as const) {
        const ids = Object.keys(m.teams).filter((id) => m.teams[id] === team);
        const line = Object.assign(document.createElement('div'), { className: 'arenaTeam' });
        line.style.color = TEAM_COLOR[team];
        line.textContent = `${TEAM_NAME[team]}: ${ids.map((id) => this.deps.nameOf(id) + (id === m.host ? ' (host)' : '')).join(', ') || 'no one yet'}`;
        this.panel.append(line);
      }
    } else if (a.playerCount >= MAX_PLAYERS) {
      note('The match is full.');
    } else {
      add('Join', 'join', { primary: true });
    }
  }
}
