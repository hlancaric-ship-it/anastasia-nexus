// P0-1 Worker security in the real workerd runtime with the isolated test D1.
// Complements tests/unit/*Security.test.ts (Node, fake DB): here the receipt
// table is a real D1 database, so "storage untouched" is proven by row count.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';

const SECRET = 'workerd-synthetic-webhook-secret';
const SHOP = 'https://shop.synthetic.test';
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} };
const bindings = (overrides: Record<string, unknown> = {}) =>
    ({ DB: env.DB, HMAC_SECRET: 'synthetic-unused-hmac', ...overrides }) as unknown as Env;

async function sign(secret: string, timestamp: number, body: string) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const webhook = async (eventId: string, opts: { secret?: string | null; timestamp?: number } = {}) => {
    const body = JSON.stringify({ id: eventId, type: 'order.placed', data: { id: `ord_${eventId}` } });
    const headers: Record<string, string> = {};
    if (opts.secret !== null) {
        const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
        headers['x-medusa-signature'] = `t=${timestamp},v1=${await sign(opts.secret ?? SECRET, timestamp, body)}`;
    }
    return new Request('https://nexus.test/api/webhooks/medusa', { method: 'POST', headers, body });
};
const receiptCount = async (eventId: string) =>
    (await env.DB.prepare('SELECT count(*) AS count FROM medusa_webhook_receipts WHERE event_id = ?').bind(eventId).first<{ count: number }>())!.count;

describe('P0-1 workerd: webhook fail-closed against real D1', () => {
    it.each([
        ['production', 'production'],
        ['ENVIRONMENT missing', undefined],
        ['ENVIRONMENT misspelled', 'prod'],
    ])('no secret (%s): unsigned and self-signed deliveries get 503 and no receipt row', async (_name, environment) => {
        const id = `evt_nosecret_${crypto.randomUUID()}`;
        const config = bindings({ ENVIRONMENT: environment });
        expect((await worker.fetch(await webhook(id, { secret: null }), config, ctx)).status).toBe(503);
        expect((await worker.fetch(await webhook(id), config, ctx)).status).toBe(503);
        expect(await receiptCount(id)).toBe(0);
    });

    it('invalid signature or stale timestamp gets 401 and no receipt row', async () => {
        const id = `evt_badsig_${crypto.randomUUID()}`;
        const config = bindings({ ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET });
        expect((await worker.fetch(await webhook(id, { secret: null }), config, ctx)).status).toBe(401);
        expect((await worker.fetch(await webhook(id, { secret: 'wrong-synthetic-secret' }), config, ctx)).status).toBe(401);
        expect((await worker.fetch(await webhook(id, { timestamp: Math.floor(Date.now() / 1000) - 400 }), config, ctx)).status).toBe(401);
        expect(await receiptCount(id)).toBe(0);
    });

    it('a correctly signed webhook is stored once and replay is reported as duplicate (all environment spellings)', async () => {
        for (const environment of ['production', undefined, 'prod']) {
            const id = `evt_ok_${crypto.randomUUID()}`;
            const config = bindings({ ENVIRONMENT: environment, MEDUSA_WEBHOOK_SECRET: SECRET });
            const first = await worker.fetch(await webhook(id), config, ctx);
            expect(first.status).toBe(200);
            expect(await receiptCount(id)).toBe(1);
            const replay = await worker.fetch(await webhook(id), config, ctx);
            expect(await replay.json()).toMatchObject({ received: true, duplicate: true });
            expect(await receiptCount(id)).toBe(1);
        }
    });

    it('explicit ENVIRONMENT=test keeps the local unsigned flow', async () => {
        const id = `evt_localtest_${crypto.randomUUID()}`;
        expect((await worker.fetch(await webhook(id, { secret: null }), bindings({ ENVIRONMENT: 'test' }), ctx)).status).toBe(200);
        expect(await receiptCount(id)).toBe(1);
    });
});

describe('P0-1 workerd: CORS fail-closed', () => {
    const call = (origin: string, method = 'GET') => new Request('https://nexus.test/api/unknown', { method, headers: { Origin: origin } });

    it('production/unknown environment without allowlist never emits an Allow-Origin', async () => {
        for (const environment of ['production', undefined, 'prod']) {
            const response = await worker.fetch(call(SHOP), bindings({ ENVIRONMENT: environment }), ctx);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
            const preflight = await worker.fetch(call(SHOP, 'OPTIONS'), bindings({ ENVIRONMENT: environment }), ctx);
            expect(preflight.status).toBe(403);
        }
    });

    it('allowlist is exact: allowed origin gets a grant, foreign and opaque origins do not', async () => {
        const config = bindings({ ENVIRONMENT: 'production', ALLOWED_ORIGINS: `*,${SHOP}` });
        expect((await worker.fetch(call(SHOP), config, ctx)).headers.get('Access-Control-Allow-Origin')).toBe(SHOP);
        expect((await worker.fetch(call('https://attacker.synthetic.test'), config, ctx)).headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect((await worker.fetch(call('null'), config, ctx)).headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect((await worker.fetch(call(SHOP, 'OPTIONS'), config, ctx)).status).toBe(204);
        expect((await worker.fetch(call('https://attacker.synthetic.test', 'OPTIONS'), config, ctx)).status).toBe(403);
    });

    it('explicit ENVIRONMENT=development keeps the permissive default', async () => {
        const response = await worker.fetch(call(SHOP), bindings({ ENVIRONMENT: 'development' }), ctx);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
});
