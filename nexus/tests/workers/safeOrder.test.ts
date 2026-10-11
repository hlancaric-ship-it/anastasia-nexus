import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';

// Executed in workerd with the isolated D1 created by vitest.workers.config.ts.
const bindings = { DB: env.DB, HMAC_SECRET: 'synthetic-hmac', MEDUSA_PRICING_API_KEY: 'synthetic-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', ENVIRONMENT: 'test' } as Env;
const input = { tenantId: 'anastasia', currency: 'eur', orderSum: 50, paymentMethod: 'stripe', customerEmail: 'synthetic@example.test' };
const request = (body: unknown = input, key?: string) => new Request('https://nexus.test/api/nexus/safeorder', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
});
const ctx = { waitUntil: (_promise: Promise<unknown>) => {} };

describe('SafeOrder workerd security gate', () => {
    it('fails closed for a wrong service key and missing identity configuration', async () => {
        expect((await worker.fetch(request(input, 'wrong-synthetic-key'), bindings, ctx)).status).toBe(401);
        expect((await worker.fetch(request(input, 'synthetic-key'), { ...bindings, MEDUSA_PRICING_API_KEY: undefined }, ctx)).status).toBe(503);
        expect((await worker.fetch(request(input, 'synthetic-key'), { ...bindings, MEDUSA_PRICING_TENANT_ID: undefined }, ctx)).status).toBe(503);
    });
    it.each([
        { ...input, orderSum: -1 },
        { ...input, orderSum: '50' },
        { ...input, orderSum: null },
        { ...input, currency: 'usd' },
        { ...input, paymentMethod: 'unknown' },
        { ...input, unit_price: 0.01 },
        { ...input, customerEmail: '' },
    ])('rejects invalid or client-controlled fields %#', async (body) => {
        expect((await worker.fetch(request(body, 'synthetic-key'), bindings, ctx)).status).toBe(400);
    });
    it('rejects unauthorized, cross-tenant and client policy changes in actual runtime', async () => {
        expect((await worker.fetch(request(), bindings, ctx)).status).toBe(401);
        expect((await worker.fetch(request({ ...input, tenantId: 'other' }, 'synthetic-key'), bindings, ctx)).status).toBe(403);
        expect((await worker.fetch(request({ ...input, codLimit: 9999 }, 'synthetic-key'), bindings, ctx)).status).toBe(400);
    });
    it('returns tenant/amount-bound ALLOW only for the configured service', async () => {
        const response = await worker.fetch(request(input, 'synthetic-key'), bindings, ctx);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, tenantId: 'anastasia', orderSum: 50, currency: 'eur', decision: 'ALLOW' });
    });
});
