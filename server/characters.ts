// Each member's saved character, so it follows them to any device. Only real members are kept (a guest's choice
// stays in their browser), and only what the office already shows others.
import { isUuid } from '../shared/member';
import type { AvatarChoice, SpriteIndex } from '../shared/protocol';
import { DEFAULT_LOOK } from '../shared/wardrobe';
import { validateAvatarChoice } from './sprites';
import { MAX_CHARACTERS, type StoredCharacter } from './store';

/** Remembers a member's character. Past MAX_CHARACTERS the member who changed theirs longest ago is forgotten. */
export function saveCharacter(characters: Record<string, StoredCharacter>, memberId: string, avatar: AvatarChoice, now: number): boolean {
  if (!isUuid(memberId)) return false;
  characters[memberId] = { avatar, at: now };
  const ids = Object.keys(characters);
  if (ids.length > MAX_CHARACTERS) {
    const oldest = ids.reduce((a, b) => (characters[b].at < characters[a].at ? b : a));
    delete characters[oldest];
  }
  return true;
}

/** A member's saved character checked again against today's wardrobe and sprites, or nothing if none is saved. */
export function loadCharacter(characters: Record<string, StoredCharacter>, memberId: string, index: SpriteIndex): AvatarChoice | undefined {
  const saved = Object.hasOwn(characters, memberId) ? characters[memberId] : undefined;
  return saved && validateAvatarChoice(saved.avatar, index, DEFAULT_LOOK);
}
