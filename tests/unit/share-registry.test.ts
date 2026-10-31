import { describe, expect, it } from 'vitest';
import { ShareRegistry } from '../../server/shares';
import type { SharePlace } from '../../shared/screen-share';

const spec = { audio: false, w: 1920, h: 1080 };
const place = (over: Partial<SharePlace> = {}): SharePlace => ({
  context: 'open',
  inConversation: true,
  atDesk: false,
  dnd: false,
  ...over,
});

describe('ShareRegistry', () => {
  it('numbers share ids per sharer', () => {
    const r = new ShareRegistry();
    expect(r.start('a', spec, 'open', ['a', 'b'], 1)).toEqual({ ok: true, shareId: 'a:1' });
    r.stop('a');
    expect(r.start('a', spec, 'open', ['a', 'b'], 2)).toEqual({ ok: true, shareId: 'a:2' });
  });

  it('only updates a running share', () => {
    const r = new ShareRegistry();
    r.start('a', spec, 'open', ['a', 'b'], 10);
    const again = r.start('a', { audio: true, w: 1280, h: 720 }, 'open', ['a', 'b'], 99);
    expect(again).toEqual({ ok: true, shareId: 'a:1' });
    expect(r.sharesOf(['a'])).toEqual([{ shareId: 'a:1', sharer: 'a', startedAt: 10, audio: true, w: 1280, h: 720 }]);
  });

  it('refuses a fourth share among the same members', () => {
    const r = new ShareRegistry();
    const members = ['a', 'b', 'c', 'd'];
    for (const id of ['a', 'b', 'c']) expect(r.start(id, spec, 'open', members, 1).ok).toBe(true);
    expect(r.start('d', spec, 'open', members, 2)).toEqual({ ok: false, reason: 'full' });
    r.stop('b');
    expect(r.start('d', spec, 'open', members, 3).ok).toBe(true);
  });

  it('does not count shares of people outside the conversation', () => {
    const r = new ShareRegistry();
    for (const id of ['x', 'y', 'z']) r.start(id, spec, 'open', [id], 1);
    expect(r.start('a', spec, 'open', ['a', 'b'], 2).ok).toBe(true);
  });

  it('lets a running share resize even when three run', () => {
    const r = new ShareRegistry();
    const members = ['a', 'b', 'c'];
    for (const id of members) r.start(id, spec, 'open', members, 1);
    expect(r.start('a', { audio: false, w: 800, h: 600 }, 'open', members, 2).ok).toBe(true);
  });

  it('removes a share on stop', () => {
    const r = new ShareRegistry();
    r.start('a', spec, 'open', ['a'], 1);
    expect(r.stop('a')).toBe(true);
    expect(r.stop('a')).toBe(false);
    expect(r.sharesOf(['a'])).toEqual([]);
  });

  it('sweeps shares whose place no longer keeps them', () => {
    const r = new ShareRegistry();
    r.start('a', spec, 'open', ['a', 'b'], 1);
    r.start('b', spec, 'area:r', ['a', 'b'], 2);
    r.start('c', spec, 'open', ['c'], 3);
    const ended = r.sweep((id) => (id === 'a' ? place({ context: 'area:r' }) : id === 'b' ? place({ context: 'area:r' }) : null));
    expect(ended).toEqual([{ sharer: 'a', reason: 'left' }]);
    expect(r.sharesOf(['a', 'b', 'c']).map((s) => s.sharer)).toEqual(['b']);
  });

  it('sweeps a sharer on Do Not Disturb with reason dnd, and a gone player silently', () => {
    const r = new ShareRegistry();
    r.start('a', spec, 'open', ['a', 'b'], 1);
    r.start('b', spec, 'open', ['a', 'b'], 2);
    const ended = r.sweep((id) => (id === 'a' ? place({ dnd: true }) : null));
    expect(ended).toEqual([{ sharer: 'a', reason: 'dnd' }]);
    expect(r.sharesOf(['a', 'b'])).toEqual([]);
  });

  it('lists shares oldest first, without the origin', () => {
    const r = new ShareRegistry();
    r.start('b', spec, 'open', ['a', 'b'], 20);
    r.start('a', spec, 'open', ['a', 'b'], 10);
    const list = r.sharesOf(['a', 'b']);
    expect(list.map((s) => s.sharer)).toEqual(['a', 'b']);
    expect(list[0]).not.toHaveProperty('origin');
    expect(r.sharesOf(['b']).map((s) => s.sharer)).toEqual(['b']);
  });
});
