// The Office Arena scoreboard: held with K, shown for a few seconds at round end, and kept up at match end.
import { TEAM_COLOR, TEAM_NAME, type ArenaClient } from './client';

export class ArenaBoard {
  private heldK = false;
  private showUntil = 0;
  private lastPhase: string | null = null;
  private key = '';

  constructor(private root: HTMLElement, private arena: ArenaClient, private nameOf: (id: string) => string) {}

  setHeld(on: boolean) {
    this.heldK = on;
  }

  /** Call every frame. */
  update(now: number) {
    const a = this.arena;
    const m = a.match;
    if (!a.inMatch() || !m) {
      this.root.hidden = true;
      this.lastPhase = null;
      return;
    }
    if (m.phase !== this.lastPhase) {
      if (m.phase === 'roundEnd') this.showUntil = now + 5000;
      this.lastPhase = m.phase;
    }
    const visible = this.heldK || now < this.showUntil || m.phase === 'matchEnd';
    this.root.hidden = !visible;
    if (!visible) return;

    const rows = a.board;
    const key = JSON.stringify([rows, m.wins, m.phase, m.alive]);
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    const title = document.createElement('div');
    title.className = 'abTitle';
    title.textContent = `Round ${m.round} · ${TEAM_NAME.blue} ${m.wins.blue} – ${m.wins.orange} ${TEAM_NAME.orange}`;
    this.root.append(title);
    for (const team of ['blue', 'orange'] as const) {
      const table = document.createElement('table');
      table.innerHTML = `<caption style="color:${TEAM_COLOR[team]}">${TEAM_NAME[team]} Team</caption><thead><tr><th>Name</th><th>Tags</th><th>Out</th><th>Money</th></tr></thead>`;
      const body = document.createElement('tbody');
      for (const r of rows.filter((x) => x.team === team)) {
        const tr = document.createElement('tr');
        if (r.id === a.me) tr.className = 'me';
        if (!m.alive.includes(r.id)) tr.classList.add('out');
        for (const text of [this.nameOf(r.id), String(r.tags), String(r.tagOuts), `$${r.money}`]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      this.root.append(table);
    }
    if (m.phase === 'matchEnd') {
      const note = document.createElement('div');
      note.className = 'abNote';
      note.textContent = 'Leave from the Arena panel, or the host can reset for another match.';
      this.root.append(note);
    }
  }
}
