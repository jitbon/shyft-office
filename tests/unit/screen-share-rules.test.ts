import { describe, expect, it } from 'vitest';
import { shareKeeps, type SharePlace } from '../../shared/screen-share';

const place = (over: Partial<SharePlace> = {}): SharePlace => ({
  context: 'open',
  inConversation: false,
  atDesk: false,
  dnd: false,
  ...over,
});

describe('shareKeeps', () => {
  it('ends on Do Not Disturb', () => {
    expect(shareKeeps('open', place({ dnd: true, inConversation: true }))).toBe(false);
  });

  it('ends when the place changed', () => {
    expect(shareKeeps('open', place({ context: 'area:a', inConversation: true }))).toBe(false);
    expect(shareKeeps('area:a', place({ context: 'open', inConversation: true }))).toBe(false);
    expect(shareKeeps('desk:d1', place({ context: 'desk:d2' }))).toBe(false);
  });

  it('ends on the open floor when alone and not at a desk', () => {
    expect(shareKeeps('open', place())).toBe(false);
  });

  it('keeps on the open floor in a conversation, or alone at a desk', () => {
    expect(shareKeeps('open', place({ inConversation: true }))).toBe(true);
    expect(shareKeeps('open', place({ atDesk: true }))).toBe(true);
  });

  it('keeps in the same room or desk, even alone', () => {
    expect(shareKeeps('area:a', place({ context: 'area:a' }))).toBe(true);
    expect(shareKeeps('desk:d1', place({ context: 'desk:d1' }))).toBe(true);
  });
});
