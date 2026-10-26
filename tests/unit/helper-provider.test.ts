import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Helper, anthropicDrafter, drafterFromEnv, parseDesign } from '../../server/helper';
import { itemDef } from './fixtures/items';

let service: http.Server | undefined;
afterEach(() => service?.close());

/** A tiny local stand-in for the service: records the request and answers with `answer`. */
async function fakeService(answer: (body: any, headers: http.IncomingHttpHeaders) => { status: number; body: unknown }) {
  const seen: { body: any; headers: http.IncomingHttpHeaders; url?: string }[] = [];
  service = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ body, headers: req.headers, url: req.url });
      const r = answer(body, req.headers);
      res.writeHead(r.status, { 'content-type': 'application/json' }).end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => service!.listen(0, r));
  return { url: `http://localhost:${(service!.address() as AddressInfo).port}`, seen };
}

describe('the Anthropic drafter', () => {
  it('sends the key, the model, the format and the request, and returns the text of the reply', async () => {
    const svc = await fakeService(() => ({ status: 200, body: { content: [{ type: 'text', text: JSON.stringify(itemDef('floor', { name: 'Cactus' })) }] } }));
    const drafter = anthropicDrafter({ key: 'secret', model: 'm-1', url: svc.url + '/' });
    const helper = new Helper({ drafter, enabled: () => true });
    const r = await helper.draftItem({ text: 'a cactus', image: { type: 'image/png', data: Buffer.from([1, 2, 3]) } });
    expect(r).toMatchObject({ ok: true, design: { name: 'Cactus' } });
    const { body, headers, url } = svc.seen[0];
    expect(url).toBe('/v1/messages');
    expect(headers['x-api-key']).toBe('secret');
    expect(body.model).toBe('m-1');
    expect(body.system).toContain('multiple of 0.05');
    expect(body.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } },
      { type: 'text', text: 'a cactus' },
    ]);
  });

  it('counts a refusal or error from the service as a failure and goes unavailable for a minute', async () => {
    const svc = await fakeService(() => ({ status: 500, body: {} }));
    const helper = new Helper({ drafter: anthropicDrafter({ key: 'k', url: svc.url }), enabled: () => true });
    expect(helper.status()).toBe('on');
    const r = await helper.draftItem({ text: 'x' });
    expect(r).toMatchObject({ ok: false, kind: 'failed' });
    expect(helper.status()).toBe('unavailable');
    expect(helper.status(Date.now() + 61_000)).toBe('on');
    expect(helper.retryAt()).toBeGreaterThan(Date.now());
  });
});

describe('the environment', () => {
  it('has no drafter without a key, and reads the timeout', () => {
    expect(drafterFromEnv({}).drafter).toBeUndefined();
    const env = drafterFromEnv({ ITEM_AI_KEY: 'k', ITEM_AI_TIMEOUT_MS: '5000' } as NodeJS.ProcessEnv);
    expect(env.drafter).toBeDefined();
    expect(env.timeoutMs).toBe(5000);
  });
});

describe('parseDesign', () => {
  it('takes an object or text with an object in it, and nothing else', () => {
    expect(parseDesign(itemDef('floor'))).not.toBeNull();
    expect(parseDesign(`ok ${JSON.stringify(itemDef('wall'))} done`)).not.toBeNull();
    expect(parseDesign('no braces')).toBeNull();
    expect(parseDesign('{ broken')).toBeNull();
    expect(parseDesign(42)).toBeNull();
  });
});
