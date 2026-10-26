// The optional item helper (specs/004-furniture-studio/contracts/helper.md): turns a few words or a picture into a first
// draft of an item. The service is only ever asked for a draft; whatever it sends back is clamped and checked with
// `validateItem`, so the model never decides what is stored. Nothing about a request or a reply is logged or kept.
import { clampItem, validateItem, ITEM_FORMAT, MAX_PARTS, PATTERNS, type ItemDefinition } from '../shared/items';

export interface DraftRequest {
  text?: string;
  image?: { type: string; data: Buffer };
}

/** Anything that can answer a request with something shaped like an item. One ships (the Anthropic API); tests use a fake. */
export interface Drafter {
  draft(request: DraftRequest, signal: AbortSignal): Promise<unknown>;
}

export type HelperStatus = 'off' | 'unavailable' | 'on';

export type DraftResult =
  | { ok: true; design: ItemDefinition }
  | { ok: false; kind: 'unusable' | 'failed' | 'timeout'; message: string };

/** How long after a failure the helper says it is unavailable before it lets people try again. */
const COOLDOWN_MS = 60_000;

export class Helper {
  private lastFailure = 0;

  constructor(private opts: { drafter?: Drafter; enabled: () => boolean; timeoutMs?: number }) {}

  /** `unavailable` with no service set up or right after it failed; `off` while an admin has it switched off. */
  status(now = Date.now()): HelperStatus {
    if (!this.opts.drafter) return 'unavailable';
    if (!this.opts.enabled()) return 'off';
    return now - this.lastFailure < COOLDOWN_MS ? 'unavailable' : 'on';
  }

  /** Whether an admin can switch it on at all: only when a service is set up. */
  get configured() {
    return !!this.opts.drafter;
  }

  /** When the cool-down after a failure ends, so the server can tell builders it is back; undefined when not cooling down. */
  retryAt(now = Date.now()): number | undefined {
    return now - this.lastFailure < COOLDOWN_MS ? this.lastFailure + COOLDOWN_MS : undefined;
  }

  /** Asks the service for a draft. `signal` cancels it (the member gave up); a timeout cancels it too. */
  async draftItem(request: DraftRequest, signal?: AbortSignal): Promise<DraftResult> {
    const drafter = this.opts.drafter;
    if (!drafter) return { ok: false, kind: 'failed', message: 'The helper isn’t set up on this server.' };
    const timeout = AbortSignal.timeout(this.opts.timeoutMs ?? 60_000);
    const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let raw: unknown;
    try {
      raw = await drafter.draft(request, both);
    } catch {
      if (signal?.aborted) return { ok: false, kind: 'failed', message: 'Cancelled.' };
      if (timeout.aborted) {
        this.lastFailure = Date.now();
        return { ok: false, kind: 'timeout', message: 'The helper didn’t answer in time. Nothing was changed. Try again.' };
      }
      this.lastFailure = Date.now();
      return { ok: false, kind: 'failed', message: 'The helper didn’t answer. Nothing was changed. Try again.' };
    }
    this.lastFailure = 0;
    const design = parseDesign(raw);
    return design ? { ok: true, design } : { ok: false, kind: 'unusable', message: 'The helper couldn’t make that into an item. Try describing it differently.' };
  }
}

/** Turns what came back into a checked item: text is parsed as JSON, then clamped and validated. Null when it is not usable. */
export function parseDesign(raw: unknown): ItemDefinition | null {
  let obj = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      obj = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const checked = validateItem(clampItem(obj));
  return checked.ok ? checked.item : null;
}

// ------------------------------------------------------------------ the Anthropic provider

const SYSTEM = `You design one small piece of office furniture or decoration for a top-down pixel office, as a single JSON object and nothing else.

Format (version ${ITEM_FORMAT}):
{"format":1,"name":string (1-32 chars),"group":"desks"|"chairs"|"computers"|"shelves"|"decorations"|"walldecor"|"floorart"|"odds"|"seasonal","season":"winter"|"spring"|"summer"|"autumn" (only when group is "seasonal"),"kind":"floor"|"deskitem"|"wall"|"floorart","footprint":[w,d],"blocks":boolean (floor only),"hang":number (wall only, 0 to 0.8),"parts":[{"x":n,"y":n,"z":n,"w":n,"d":n,"h":n,"pattern":${PATTERNS.map((p) => `"${p}"`).join('|')},"color":"#rrggbb"}]}

Rules:
- Sizes are in tiles. Every number is a multiple of 0.05. A part is a box with its corner at x, y, z (z is height) and size w, d, h. It must lie inside the footprint (x+w<=footprint width, y+d<=footprint depth) and z+h<=1 (<=0.6 for deskitem, h=0.05 and z=0 for floorart).
- floor and floorart footprints are whole tiles from 1 to 4. deskitem footprints are 0.25, 0.5, 0.75 or 1 per side. wall footprints are width 0.25 to 1 and depth 0.05 to 0.25 (the part that sticks out of the wall).
- Use at most ${MAX_PARTS} parts: few, chunky parts read best at 32 pixels a tile. Items face south (towards larger y); put the back at small y.
- Pick colors that stand out at a small size. Use patterns to suggest material (wood, fabric, metal, leaf, glass, screen, paper, stone) or plain.
- Reply with the JSON object only.`;

export interface AnthropicOptions {
  key: string;
  model?: string;
  url?: string;
}

/** A drafter that calls the Anthropic Messages API with the platform `fetch`: no package, no key in the browser. */
export function anthropicDrafter(o: AnthropicOptions): Drafter {
  const base = (o.url ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  return {
    async draft(request, signal) {
      const content: unknown[] = [];
      if (request.image) content.push({ type: 'image', source: { type: 'base64', media_type: request.image.type, data: request.image.data.toString('base64') } });
      content.push({ type: 'text', text: request.text?.trim() || 'Make a piece of furniture that looks like this picture.' });
      const res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-api-key': o.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: o.model ?? 'claude-sonnet-5-5', max_tokens: 2048, system: SYSTEM, messages: [{ role: 'user', content }] }),
      });
      if (!res.ok) throw new Error(`service answered ${res.status}`);
      const body = (await res.json()) as { content?: { type?: string; text?: string }[] };
      return body.content?.find((c) => c.type === 'text')?.text ?? '';
    },
  };
}

/** The drafter the environment asks for, or none when no key is set. */
export function drafterFromEnv(env: NodeJS.ProcessEnv = process.env): { drafter?: Drafter; timeoutMs?: number } {
  const key = env.ITEM_AI_KEY?.trim();
  const timeoutMs = Number(env.ITEM_AI_TIMEOUT_MS);
  return {
    ...(key ? { drafter: anthropicDrafter({ key, model: env.ITEM_AI_MODEL || undefined, url: env.ITEM_AI_URL || undefined }) } : {}),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  };
}
