import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadCharacter, saveCharacter } from '../../server/characters';
import { MAX_CHARACTERS, emptyState, parseState, type StoredCharacter } from '../../server/store';
import { DESKS } from '../../shared/map';
import type { AvatarChoice } from '../../shared/protocol';

const look = { shirt: '#e04f5f', hair: '#111111', skin: '#8d5524' };
const avatar = (extra = {}): AvatarChoice => ({ kind: 'built-in', look: { ...look, ...extra } });

describe('stored characters', () => {
  it('reads a version 3 file as version 4 with no characters, keeping every desk claim', () => {
    const claim = { memberId: crypto.randomUUID(), name: 'Sam', claimedAt: 1 };
    const out = parseState({ version: 3, deskClaims: { [DESKS[0].id]: claim }, podModes: {}, areaAllowed: {}, deskNotice: [], buildingEnabled: true });
    expect(out.version).toBe(4);
    expect(out.characters).toEqual({});
    expect(out.deskClaims[DESKS[0].id]).toEqual(claim);
  });

  it('round-trips a version 4 file and drops entries it cannot trust', () => {
    const id = crypto.randomUUID();
    const state = { ...emptyState(), characters: { [id]: { avatar: avatar(), at: 5 }, 'eph-1': { avatar: avatar(), at: 6 }, junk: { avatar: avatar(), at: 7 } } };
    expect(parseState(JSON.parse(JSON.stringify(state))).characters).toEqual({ [id]: { avatar: avatar(), at: 5 } });
  });

  it('saves a member\'s character and ignores guests', () => {
    const characters: Record<string, StoredCharacter> = {};
    const id = crypto.randomUUID();
    expect(saveCharacter(characters, id, avatar(), 10)).toBe(true);
    expect(saveCharacter(characters, 'eph-3', avatar(), 10)).toBe(false);
    expect(characters).toEqual({ [id]: { avatar: avatar(), at: 10 } });
  });

  it('forgets the member who changed theirs longest ago past the cap', () => {
    const characters: Record<string, StoredCharacter> = {};
    const first = crypto.randomUUID();
    saveCharacter(characters, first, avatar(), 1);
    for (let i = 0; i < MAX_CHARACTERS; i++) saveCharacter(characters, crypto.randomUUID(), avatar(), 2 + i);
    expect(Object.keys(characters)).toHaveLength(MAX_CHARACTERS);
    expect(characters[first]).toBeUndefined();
  });

  it('checks a character again when loading it', () => {
    const id = crypto.randomUUID();
    const characters = { [id]: { avatar: avatar({ hairStyle: 'curly', face: 'long-gone' }), at: 1 } };
    expect(loadCharacter(characters, id, [])).toEqual(avatar({ hairStyle: 'curly' }));
    expect(loadCharacter(characters, crypto.randomUUID(), [])).toBeUndefined();
  });
});
