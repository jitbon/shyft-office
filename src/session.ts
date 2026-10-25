import type { SpriteIndex } from '../shared/protocol';

/** Facts about this connection that several UI modules need. Filled in from `welcome`. */
export const session = {
  isAdmin: false,
  ice: [] as RTCIceServer[],
  sprites: [] as SpriteIndex,
};
