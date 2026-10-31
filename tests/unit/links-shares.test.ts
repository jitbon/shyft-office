import { describe, expect, it } from 'vitest';
import { LinkEngine } from '../../server/links';
import type { PlayerState, ServerMsg, ShareInfo } from '../../shared/protocol';

const player = (id: string, x: number, y: number): PlayerState =>
  ({
    id, name: id, look: { shirt: '#000', hair: '#000', skin: '#000' }, memberId: id,
    avatar: { kind: 'look' } as never, status: { kind: 'available' }, mic: false, cam: false,
    x, y, a: 0, mode: '2d', moving: false,
  }) as PlayerState;

const share: ShareInfo = { shareId: 'a:1', sharer: 'a', startedAt: 1, audio: false, w: 1920, h: 1080 };

function setup(players: PlayerState[], shares: ShareInfo[]) {
  const sent: { id: string; msg: Extract<ServerMsg, { t: 'links' }> }[] = [];
  const engine = new LinkEngine(
    () => players,
    (id, msg) => msg.t === 'links' && sent.push({ id, msg }),
    {},
    () => ({}),
    (members) => shares.filter((s) => members.includes(s.sharer)),
  );
  return { engine, sent };
}

describe('LinkEngine shares', () => {
  it('puts the shares in each conversation member\'s info', () => {
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('b', 16.5, 19.5)], [share]);
    engine.update();
    for (const id of ['a', 'b']) {
      const last = sent.filter((s) => s.id === id).at(-1)!;
      expect(last.msg.conversation?.shares).toEqual([share]);
    }
  });

  it('gives a player in no conversation no shares', () => {
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('c', 30.5, 19.5)], [share]);
    engine.update();
    const last = sent.filter((s) => s.id === 'c').at(-1);
    expect(last).toBeUndefined(); // nothing to say: no links, no conversation
  });

  it('sends again on a change and not on no change', () => {
    const shares: ShareInfo[] = [];
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('b', 16.5, 19.5)], shares);
    engine.update();
    const n = sent.length;
    engine.update();
    expect(sent.length).toBe(n);
    shares.push(share);
    engine.update();
    expect(sent.length).toBe(n + 2);
    engine.update();
    expect(sent.length).toBe(n + 2);
    shares[0] = { ...share, w: 1280 };
    engine.update();
    expect(sent.length).toBe(n + 4);
  });
});
