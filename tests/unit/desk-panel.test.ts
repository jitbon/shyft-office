import { describe, expect, it } from 'vitest';
import { panelPlan } from '../../shared/desk-presence';

describe('panelPlan', () => {
  it('shows nothing with no conversation and no desk view due', () => {
    expect(panelPlan({ conversation: null, desk: null })).toEqual({ kind: 'none' });
  });

  it('shows the desk view headed with the desk\'s title when there is no conversation and a desk view is due', () => {
    expect(panelPlan({ conversation: null, desk: 'Your desk' })).toEqual({ kind: 'desk', heading: 'Your desk' });
    expect(panelPlan({ conversation: null, desk: "Sam's desk" })).toEqual({ kind: 'desk', heading: "Sam's desk" });
    expect(panelPlan({ conversation: null, desk: 'Free desk' })).toEqual({ kind: 'desk', heading: 'Free desk' });
  });

  it('shows a conversation as it is when there is no desk view', () => {
    expect(panelPlan({ conversation: 'Nearby · 2', desk: null })).toEqual({ kind: 'conversation', heading: 'Nearby · 2' });
  });

  it('adds the desk to the conversation heading while you are on your own desk', () => {
    expect(panelPlan({ conversation: 'Nearby · 2', desk: 'Your desk' })).toEqual({ kind: 'conversation', heading: 'Your desk · Nearby · 2' });
  });

  it('calls a desk conversation at your own desk simply "Your desk"', () => {
    expect(panelPlan({ conversation: "Gus's desk", deskConversation: true, desk: 'Your desk' })).toEqual({ kind: 'conversation', heading: 'Your desk' });
    // not on your own desk: the label stays as it is
    expect(panelPlan({ conversation: "Gus's desk", deskConversation: true, desk: null })).toEqual({ kind: 'conversation', heading: "Gus's desk" });
  });

  it('never carries "conversation is full" for the desk kind', () => {
    expect(JSON.stringify(panelPlan({ conversation: null, desk: 'x' }))).not.toMatch(/full/i);
  });

  it('hands over cleanly: desk view, then conversation, then desk view again, with no state between', () => {
    const seq = [
      panelPlan({ conversation: null, desk: 'Your desk' }),
      panelPlan({ conversation: 'Nearby · 2', desk: 'Your desk' }),
      panelPlan({ conversation: null, desk: 'Your desk' }),
    ];
    expect(seq.map((p) => p.kind)).toEqual(['desk', 'conversation', 'desk']);
  });

  it('shows the one-tile view headed with the room name when alone in a meeting room', () => {
    expect(panelPlan({ conversation: null, desk: null, room: 'Meeting Room A' })).toEqual({ kind: 'desk', heading: 'Meeting Room A' });
  });

  it('prefers a conversation, then your desk, over the room view', () => {
    expect(panelPlan({ conversation: 'Meeting Room A', desk: null, room: 'Meeting Room A' })).toEqual({ kind: 'conversation', heading: 'Meeting Room A' });
    expect(panelPlan({ conversation: null, desk: 'Your desk', room: 'Meeting Room A' })).toEqual({ kind: 'desk', heading: 'Your desk' });
  });
});
