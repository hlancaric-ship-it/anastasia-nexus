// P0-1 Medusa webhook authentication: fail-closed matrix.
// Exercises the real Worker entry point (`worker.fetch`) so the route, the
// ENVIRONMENT classification and the CORS wrapper are tested together.
// All keys, ids and payloads are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';

const SECRET = 'synthetic-medusa-webhook-secret';
const URL_ = 'https://nexus.synthetic.test/api/webhooks/medusa';
const ctx = { waitUntil: vi.fn() };

/** Environments that must behave as production (strict). */
const STRICT_ENVIRONMENTS: unknown[] = [
    'production', undefined, '', 'prod', 'Production', 'staging', 'Development', 'TEST', 'live', 1, true,
];
const label = (value: unknown) => JSON.stringify(value) ?? String(value);

function makeDb() {
    const receipts = new Set<string>();
    const prepare = vi.fn((_sql: string) => ({
        bind: (eventId: string) => ({
            first: async () => {
                if (receipts.has(eventId)) return null;
                receipts.add(eventId);
                return { event_id: eventId };
            },
        }),
    }));
    return { prepare, receipts };
}

function makeEnv(db: ReturnType<typeof makeDb>, overrides: Record<string, unknown> = {}): Env {
    return { DB: { prepare: db.prepare }, HMAC_SECRET: 'synthetic-unused-hmac', ...overrides } as unknown as Env;
}

async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const now = () => Math.floor(Date.now() / 1000);
const payload = (id = `evt_${crypto.randomUUID()}`) => JSON.stringify({ type: 'order.placed', id, data: { id: `ord_${id}` } });

async function signed(body: string, opts: { secret?: string; timestamp?: number; extra?: Record<string, string> } = {}): Promise<Request> {
    const timestamp = opts.timestamp ?? now();
    const signature = await hmacHex(opts.secret ?? SECRET, `${timestamp}.${body}`);
    return new Request(URL_, { method: 'POST', headers: { 'x-medusa-signature': `t=${timestamp},v1=${signature}`, ...(opts.extra ?? {}) }, body });
}

const unsigned = (body: string, headers: Record<string, string> = {}) => new Request(URL_, { method: 'POST', headers, body });
const withHeader = (body: string, header: string) => new Request(URL_, { method: 'POST', headers: { 'x-medusa-signature': header }, body });

async function errorCode(response: Response): Promise<string | undefined> {
    return ((await response.json()) as { error?: string }).error;
}

describe('P0-1 Medusa webhook: fail-closed authentication', () => {
    let logs: string[];
    let spies: ReturnType<typeof vi.spyOn>[];
    beforeEach(() => {
        logs = [];
        spies = (['log', 'warn', 'error'] as const).map((method) => vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); }));
    });
    afterEach(() => spies.forEach((spy) => spy.mockRestore()));

    describe('1+3: no secret configured', () => {
        it.each(STRICT_ENVIRONMENTS.map((value) => [label(value), value]))('ENVIRONMENT=%s rejects an unsigned webhook with 503 and does not touch storage', async (_l, environment) => {
            const db = makeDb();
            const response = await worker.fetch(unsigned(payload()), makeEnv(db, { ENVIRONMENT: environment }), ctx);
            expect(response.status).toBe(503);
            expect(await errorCode(response)).toBe('MISSING_BINDING');
            expect(db.prepare).not.toHaveBeenCalled();
        });

        it('rejects even when the caller sends a plausible-looking signature header (nothing to verify against)', async () => {
            const db = makeDb();
            const body = payload();
            const response = await worker.fetch(await signed(body), makeEnv(db, { ENVIRONMENT: 'production' }), ctx);
            expect(response.status).toBe(503);
            expect(db.prepare).not.toHaveBeenCalled();
        });

        it.each(['', ' ', '\t\n', undefined, null, 0, false])('treats an empty/blank/non-string secret (%j) as missing', async (secret) => {
            for (const environment of ['production', undefined]) {
                const db = makeDb();
                const response = await worker.fetch(unsigned(payload()), makeEnv(db, { ENVIRONMENT: environment, MEDUSA_WEBHOOK_SECRET: secret }), ctx);
                expect(response.status).toBe(503);
                expect(db.prepare).not.toHaveBeenCalled();
            }
        });

        it('logs an alert that names the declared environment but never a secret', async () => {
            const db = makeDb();
            await worker.fetch(unsigned(payload()), makeEnv(db, { ENVIRONMENT: 'prod' }), ctx);
            const line = logs.find((entry) => entry.includes('webhook.medusa.missing_secret'));
            expect(line).toBeDefined();
            expect(line).toContain('"alert":true');
            expect(line).toContain('"declaredEnvironment":"prod"');
        });
    });

    describe('2: secret configured, signature invalid', () => {
        const environments = ['production', undefined, 'staging', 'development', 'test'];

        it.each(environments.map((value) => [label(value), value]))('ENVIRONMENT=%s: missing signature header -> 401, storage untouched', async (_l, environment) => {
            const db = makeDb();
            const response = await worker.fetch(unsigned(payload()), makeEnv(db, { ENVIRONMENT: environment, MEDUSA_WEBHOOK_SECRET: SECRET }), ctx);
            expect(response.status).toBe(401);
            expect(await errorCode(response)).toBe('REJECT_SIGNATURE');
            expect(db.prepare).not.toHaveBeenCalled();
        });

        it('rejects every class of bad signature in production without touching storage', async () => {
            const body = payload();
            const ts = now();
            const good = await hmacHex(SECRET, `${ts}.${body}`);
            const bad: Array<[string, Request]> = [
                ['wrong secret', await signed(body, { secret: 'another-synthetic-secret' })],
                ['tampered body', new Request(URL_, { method: 'POST', headers: { 'x-medusa-signature': `t=${ts},v1=${good}` }, body: body.replace('order.placed', 'order.canceled') })],
                ['stale timestamp (301 s)', await signed(body, { timestamp: ts - 301 })],
                // +310 (not +301): a clock tick during the test must not land exactly on the 300 s boundary.
                ['future timestamp (310 s)', await signed(body, { timestamp: ts + 310 })],
                ['signature over body only (no timestamp)', withHeader(body, `t=${ts},v1=${await hmacHex(SECRET, body)}`)],
                ['timestamp swapped after signing', withHeader(body, `t=${ts + 1},v1=${good}`)],
                ['malformed header', withHeader(body, 'garbage')],
                ['empty header', withHeader(body, '')],
                ['missing v1', withHeader(body, `t=${ts}`)],
                ['missing t', withHeader(body, `v1=${good}`)],
                ['non-numeric t', withHeader(body, `t=abc,v1=${good}`)],
                ['non-hex v1', withHeader(body, `t=${ts},v1=${'z'.repeat(64)}`)],
                ['short v1', withHeader(body, `t=${ts},v1=${good.slice(0, 63)}`)],
                ['long v1', withHeader(body, `t=${ts},v1=${good}00`)],
                ['all-zero v1', withHeader(body, `t=${ts},v1=${'0'.repeat(64)}`)],
            ];
            for (const [name, request] of bad) {
                const db = makeDb();
                const response = await worker.fetch(request, makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET }), ctx);
                expect(response.status, name).toBe(401);
                expect(await errorCode(response), name).toBe('REJECT_SIGNATURE');
                expect(db.prepare, name).not.toHaveBeenCalled();
            }
        });

        it('does not echo the secret or the expected signature in responses or logs', async () => {
            const db = makeDb();
            const body = payload();
            const response = await worker.fetch(await signed(body, { secret: 'another-synthetic-secret' }), makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET }), ctx);
            const text = JSON.stringify(await response.json()) + logs.join(' ');
            expect(text).not.toContain(SECRET);
            expect(text).not.toContain('another-synthetic-secret');
        });
    });

    describe('6: correctly signed webhook', () => {
        it.each(['production', undefined, 'staging', 'development', 'test'].map((value) => [label(value), value]))('ENVIRONMENT=%s: a valid signature is accepted and stored exactly once', async (_l, environment) => {
            const db = makeDb();
            const body = payload();
            const env = makeEnv(db, { ENVIRONMENT: environment, MEDUSA_WEBHOOK_SECRET: SECRET });
            const first = await worker.fetch(await signed(body), env, ctx);
            expect(first.status).toBe(200);
            expect(await first.json()).toMatchObject({ received: true });
            expect(db.receipts.size).toBe(1);
            // Replay of the very same signed delivery is acknowledged but flagged duplicate.
            const replay = await worker.fetch(await signed(body), env, ctx);
            expect(replay.status).toBe(200);
            expect(await replay.json()).toMatchObject({ received: true, duplicate: true });
            expect(db.receipts.size).toBe(1);
        });

        it('accepts a timestamp close to the edge of the five-minute window', async () => {
            const db = makeDb();
            const response = await worker.fetch(await signed(payload(), { timestamp: now() - 290 }), makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET }), ctx);
            expect(response.status).toBe(200);
        });

        it('keeps the Medusa contract: event/type + id from payload or x-medusa-delivery header', async () => {
            const db = makeDb();
            const env = makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET });
            const viaHeader = JSON.stringify({ event: 'customer.created', data: { id: 'cus_synthetic' } });
            const response = await worker.fetch(await signed(viaHeader, { extra: { 'x-medusa-delivery': 'delivery_synthetic_1' } }), env, ctx);
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ received: true, event: 'customer.created', eventId: 'delivery_synthetic_1' });
        });

        it('still validates the payload after authentication (422 for missing event / id)', async () => {
            const db = makeDb();
            const env = makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET });
            expect((await worker.fetch(await signed(JSON.stringify({ id: 'evt_x', data: {} })), env, ctx)).status).toBe(422);
            expect((await worker.fetch(await signed(JSON.stringify({ type: 'order.placed' })), env, ctx)).status).toBe(422);
            expect((await worker.fetch(await signed('{'), env, ctx)).status).toBe(400);
            expect(db.prepare).not.toHaveBeenCalled();
        });

        it('storage failure after authentication fails closed (503), never as accepted', async () => {
            const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('synthetic D1 outage'); } }) }) }, HMAC_SECRET: 'x', ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET } as unknown as Env;
            const response = await worker.fetch(await signed(payload()), env, ctx);
            expect(response.status).toBe(503);
            expect(await errorCode(response)).toBe('STORAGE_UNAVAILABLE');
        });
    });

    describe('7: legitimate non-production behaviour preserved', () => {
        it.each(['development', 'test'])('explicit ENVIRONMENT=%s without secret still accepts an unsigned local webhook (and warns)', async (environment) => {
            const db = makeDb();
            const response = await worker.fetch(unsigned(payload()), makeEnv(db, { ENVIRONMENT: environment }), ctx);
            expect(response.status).toBe(200);
            expect(db.receipts.size).toBe(1);
            expect(logs.some((entry) => entry.includes('webhook.medusa.unsigned_accepted_nonproduction'))).toBe(true);
        });

        it('wrong method is still rejected by the router', async () => {
            const db = makeDb();
            const response = await worker.fetch(new Request(URL_, { method: 'GET' }), makeEnv(db, { ENVIRONMENT: 'production', MEDUSA_WEBHOOK_SECRET: SECRET }), ctx);
            expect(response.status).toBe(405);
        });
    });
});
