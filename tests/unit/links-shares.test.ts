import { describe, expect, it } from 'vitest';
import { LinkEngine } from '../../server/links';
import type { PlayerState, ServerMsg, ShareInfo } from '../../shared/protocol';

const player = (id: string, x: number, y: number): PlayerState =>
  ({
    id, name: id, look: { shirt: '#000', hair: '#000', skin: '#000' }, memberId: id,
    avatar: { kind: 'look' } as never, status: { kind: 'available' }, mic: false, cam: false,
    x, y, a: 0, mode: '2d', moving: false,
  }) as PlayerState;

const share: ShareInfo = { shareId: 'a:1', sharer: 'a', startedAt: 1, audio: false, w: 1920, h: 1080, drawing: true };

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

  it('gives conversation members distinct ink slots, only while there is a share', () => {
    const shares: ShareInfo[] = [];
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('b', 16.5, 19.5)], shares);
    engine.update();
    expect(sent.at(-1)!.msg.conversation?.ink).toBeUndefined();
    shares.push(share);
    engine.update();
    const ink = sent.filter((s) => s.id === 'a').at(-1)!.msg.conversation?.ink;
    expect(Object.keys(ink!).sort()).toEqual(['a', 'b']);
    expect(new Set(Object.values(ink!)).size).toBe(2);
  });

  it('keeps ink slots the same across ticks', () => {
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('b', 16.5, 19.5)], [share]);
    engine.update();
    const first = sent.filter((s) => s.id === 'b').at(-1)!.msg.conversation?.ink;
    engine.update();
    engine.update();
    expect(sent.filter((s) => s.id === 'b').at(-1)!.msg.conversation?.ink).toEqual(first);
    expect(sent.filter((s) => s.id === 'b').length).toBe(1);
  });

  it('keeps a member\'s ink slot when a share stops and another starts', () => {
    const shares: ShareInfo[] = [share];
    const { engine, sent } = setup([player('a', 15.5, 19.5), player('b', 16.5, 19.5), player('c', 17.5, 19.5)], shares);
    engine.update();
    const before = sent.filter((s) => s.id === 'b').at(-1)!.msg.conversation!.ink!;
    shares.length = 0;
    engine.update();
    expect(sent.filter((s) => s.id === 'b').at(-1)!.msg.conversation?.ink).toBeUndefined();
    shares.push({ ...share, shareId: 'a:2' });
    engine.update();
    expect(sent.filter((s) => s.id === 'b').at(-1)!.msg.conversation!.ink).toEqual(before);
  });
});
