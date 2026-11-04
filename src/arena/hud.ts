// The player's heads-up display for Office Arena (a DOM overlay, hidden outside a match).
import { GEAR, isGearId } from '../../shared/arena';
import { TEAM_COLOR, TEAM_NAME, type ArenaClient } from './client';

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class ArenaHud {
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private arena: ArenaClient, private nameOf: (id: string) => string) {
    root.innerHTML = `
      <div class="ahTop"><span id="ahBlue"></span><span id="ahPhase"></span><span id="ahOrange"></span></div>
      <div id="ahCross"><i></i></div>
      <div id="ahHit"></div>
      <div id="ahHurt"></div>
      <div id="ahFlash"></div>
      <div id="ahBanner"></div>
      <div id="ahTagged"></div>
      <div class="ahBottom">
        <div class="ahBars">
          <div class="ahBar"><b>HP</b><span><i id="ahHealth"></i></span><em id="ahHealthNum"></em></div>
          <div class="ahBar"><b>AR</b><span><i id="ahArmour"></i></span><em id="ahArmourNum"></em></div>
        </div>
        <div class="ahInfo"><span id="ahGear"></span><span id="ahMoney"></span><span class="ahKeys" id="ahKeys"></span></div>
      </div>`;
    for (const e of root.querySelectorAll<HTMLElement>('[id]')) this.el[e.id] = e;
  }

  /** Call every frame: it only touches the page when something changed. */
  update(now: number) {
    const a = this.arena;
    const show = a.inMatch();
    this.root.hidden = !show;
    if (!show || !a.match) return;
    const m = a.match;
    const set = (id: string, text: string) => {
      if (this.el[id].textContent !== text) this.el[id].textContent = text;
    };
    set('ahBlue', `${TEAM_NAME.blue} ${m.wins.blue}`);
    set('ahOrange', `${m.wins.orange} ${TEAM_NAME.orange}`);
    this.el.ahBlue.style.color = TEAM_COLOR.blue;
    this.el.ahOrange.style.color = TEAM_COLOR.orange;
    const left = clock(a.endsIn(now));
    set('ahPhase', {
      lobby: 'Waiting for the host to begin', buy: `Round ${m.round} · Buy ${left}`, play: `Round ${m.round} · ${left}`,
      roundEnd: `Round ${m.round} over`, matchEnd: 'Match over',
    }[m.phase]);

    const y = a.you;
    const health = y?.health ?? 100, armour = y?.armour ?? 0;
    this.el.ahHealth.style.width = `${health}%`;
    this.el.ahArmour.style.width = `${(armour / 50) * 100}%`;
    set('ahHealthNum', String(health));
    set('ahArmourNum', String(armour));
    set('ahGear', y && isGearId(y.gear) ? GEAR[y.gear].name : '');
    set('ahMoney', y ? `$${y.money}` : '');
    set('ahKeys', m.phase === 'buy' ? 'B shop · hold K scoreboard' : 'hold K scoreboard');

    this.el.ahCross.hidden = !(m.phase === 'play' && a.isAlive(a.me));
    this.el.ahHit.classList.toggle('on', now < a.hitMarkerUntil);
    this.el.ahHurt.classList.toggle('on', now < a.hurtUntil);
    this.el.ahFlash.classList.toggle('on', now < a.flashUntil);

    let banner = '';
    if (m.phase === 'roundEnd') banner = m.lastWinner && m.lastWinner !== 'draw' ? `${TEAM_NAME[m.lastWinner]} Team wins the round` : 'Round drawn';
    else if (m.phase === 'matchEnd') banner = `${m.wins.blue > m.wins.orange ? TEAM_NAME.blue : TEAM_NAME.orange} Team wins the match`;
    set('ahBanner', banner);
    const target = a.spectateTarget();
    set('ahTagged', a.spectating() ? `Tagged${a.taggedBy ? ` by ${this.nameOf(a.taggedBy)}` : ''} · spectating ${target ? this.nameOf(target) : 'a teammate'} (click to switch)` : '');
  }
}
