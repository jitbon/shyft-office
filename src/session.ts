import type { SpriteIndex } from '../shared/protocol';

/** Facts about this connection that several UI modules need. Filled in from `welcome`. */
export const session = {
  isAdmin: false,
  /** Sent as `X-Shyft-Session` when calling the HTTP API. */
  token: '',
  /** The published layout revision this client has loaded. */
  layoutRev: 0,
  /** Whether this connection may edit the office layout. */
  canBuild: false,
  ice: [] as RTCIceServer[],
  sprites: [] as SpriteIndex,
};
