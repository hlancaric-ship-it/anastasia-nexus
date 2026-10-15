import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
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
    it.each([
        { amount: 50, decision: 'REVIEW' },
        { amount: 400, decision: 'BLOCK' },
    ])('preserves server risk decision $decision', async ({ amount, decision }) => {
        const response = await worker.fetch(request({ ...input, orderSum: amount, customerEmail: 'synthetic@tempmail.com' }, 'synthetic-key'), bindings, ctx);
        expect(await response.json()).toMatchObject({ ok: true, decision, orderSum: amount, tenantId: 'anastasia' });
    });
    it('rejects malformed JSON and authenticates before parsing it', async () => {
        const malformed = (key: string) => new Request('https://nexus.test/api/nexus/safeorder', {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: '{',
        });
        expect((await worker.fetch(malformed('wrong-key'), bindings, ctx)).status).toBe(401);
        expect((await worker.fetch(malformed('synthetic-key'), bindings, ctx)).status).toBe(400);
    });
    it('protects admin writes with actual D1 unchanged on unauthorized or cross-tenant requests', async () => {
        const count = async () => (await env.DB.prepare('SELECT count(*) AS count FROM vouchers').first<{ count: number }>())!.count;
        const before = await count();
        for (const [tenantId, key, status] of [['anastasia', '', 401], ['anastasia', 'wrong-key', 401], ['other', 'synthetic-key', 403]] as const) {
            const issue = new Request('https://nexus.test/api/vouchers/issue', {
                method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
                body: JSON.stringify({ tenantId, orderId: 'synthetic-order', orderState: 'PAID', customerEmail: input.customerEmail, lines: [{ sku: 'SYNTHETIC-VOUCHER', quantity: 1, unitPriceMinor: 100, isVoucherProduct: true }] }),
            });
            expect((await worker.fetch(issue, bindings, ctx)).status).toBe(status);
            expect(await count()).toBe(before);
        }
    });
    it('rejects browser origins and production test providers without logging email or service credentials', async () => {
        const logs: string[] = [];
        const spies = ['log', 'warn', 'error'].map((method) => vi.spyOn(console, method as 'log').mockImplementation((...args) => { logs.push(args.map(String).join(' ')); }));
        try {
            const production = { ...bindings, ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://shop.test' };
            const req = request(input, 'synthetic-key'); req.headers.set('Origin', 'https://attacker.test');
            expect((await worker.fetch(req, production, ctx)).headers.get('Access-Control-Allow-Origin')).toBe('null');
            expect((await worker.fetch(request({ ...input, paymentMethod: 'pp_system_default' }, 'synthetic-key'), production, ctx)).status).toBe(400);
            await worker.fetch(request(input, 'wrong-key'), bindings, ctx);
            expect(logs.join(' ')).not.toContain(input.customerEmail);
            expect(logs.join(' ')).not.toContain(bindings.MEDUSA_PRICING_API_KEY);
        } finally { spies.forEach((spy) => spy.mockRestore()); }
    });
});
