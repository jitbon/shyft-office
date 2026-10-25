// What a member id looks like. Browsers make a random UUID; the server hands guests `eph-<number>`.
// Anything else a client sends in an id field is refused before it is stored.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUEST_RE = /^eph-\d{1,9}$/;

export const MAX_MEMBER_ID = 40;

/** A browser-made id, which is the only kind a client may claim for itself. */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Any id the server could have issued: a UUID, or a guest id. */
export const isMemberId = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= MAX_MEMBER_ID && (UUID_RE.test(v) || GUEST_RE.test(v));
