import { describe, it, expect, vi } from 'vitest';
import { handleNexusSafeOrder } from '../../workers/api/routes/nexusSafeOrder.js';
import worker from '../../workers/api/index.js';
import type { Env } from '../../workers/api/types.js';

const env = { MEDUSA_PRICING_API_KEY: 'synthetic-service-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', ENVIRONMENT: 'test', DB: { prepare: vi.fn() }, HMAC_SECRET: 'synthetic-hmac' } as unknown as Env;
const valid = { tenantId: 'anastasia', currency: 'eur', orderSum: 50, paymentMethod: 'stripe', customerEmail: 'synthetic@example.test' };
const request = (body: unknown = valid, authorization: string | null = 'Bearer synthetic-service-key', contentType = 'application/json') => new Request('https://nexus.internal/api/nexus/safeorder', {
    method: 'POST', headers: { 'Content-Type': contentType, ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body),
});
const ctx = { waitUntil: vi.fn() };

describe('SafeOrder security boundary', () => {
    it('allows authenticated online payment and binds the decision to tenant/amount/currency', async () => {
        const response = await handleNexusSafeOrder(request(), env);
        expect(await response.json()).toMatchObject({ ok: true, decision: 'ALLOW', score: 0, tenantId: 'anastasia', currency: 'eur', orderSum: 50 });
    });
    it('retains COD risk rules and blocks disposable email', async () => {
        const response = await handleNexusSafeOrder(request({ ...valid, paymentMethod: 'dobierka', orderSum: 250, customerEmail: 'synthetic@tempmail.com' }), env);
        expect(await response.json()).toMatchObject({ decision: 'BLOCK' });
    });
    it('accepts Medusa manual providers: COD keeps COD risk, bank transfer is prepaid', async () => {
        const cod = await (await handleNexusSafeOrder(request({ ...valid, paymentMethod: 'cod' }), env)).json() as any;
        expect(cod).toMatchObject({ decision: 'ALLOW', score: 30 });
        expect(cod.factors).toContain('Platba na dobierku (+20)');
        const codHigh = await (await handleNexusSafeOrder(request({ ...valid, paymentMethod: 'pp_cod_cod', orderSum: 150 }), env)).json() as any;
        expect(codHigh).toMatchObject({ decision: 'REVIEW' });
        for (const paymentMethod of ['bank_transfer', 'pp_bank_transfer_bank_transfer']) {
            const transfer = await (await handleNexusSafeOrder(request({ ...valid, paymentMethod }), env)).json() as any;
            expect(transfer).toMatchObject({ decision: 'ALLOW', score: 10 });
            expect(transfer.factors.join(' ')).not.toContain('dobierku');
        }
    });
    it.each([null, 'Bearer wrong', 'Basic synthetic-service-key', 'Bearer synthetic-service-key-extra'])('rejects unauthorized caller %s before parsing input', async (authorization) => {
        await expect(handleNexusSafeOrder(request(null, authorization), env)).rejects.toMatchObject({ status: 401 });
    });
    it.each([
        {}, { MEDUSA_PRICING_API_KEY: '' }, { MEDUSA_PRICING_API_KEY: ' ' }, { MEDUSA_PRICING_TENANT_ID: '' }, { MEDUSA_PRICING_TENANT_ID: 'invalid tenant' },
    ])('fails closed without valid service configuration %j', async (overrides) => {
        const config = Object.keys(overrides).length ? { ...env, ...overrides } : {};
        await expect(handleNexusSafeOrder(request(), config as Env)).rejects.toMatchObject({ status: 503 });
    });
    it.each([null, [], 'string', {}, { ...valid, tenantId: 'other' }, { ...valid, orderSum: '1' }, { ...valid, orderSum: null }, { ...valid, orderSum: -1 }, { ...valid, orderSum: 1e100 }, { ...valid, currency: 'czk' }, { ...valid, paymentMethod: '' }, { ...valid, paymentMethod: 'bogus' }, { ...valid, customerEmail: 'invalid' }, { ...valid, codLimit: 100000 }, { ...valid, amount: 1 }, { ...valid, basePrice: 0.01 }])('rejects malformed or manipulated input %#', async (body) => {
        const response = await worker.fetch(request(body), env, ctx);
        expect([400, 403]).toContain(response.status);
        expect(await response.json()).toMatchObject({ ok: false });
        expect(env.DB.prepare).not.toHaveBeenCalled();
    });
    it('rejects invalid JSON, wrong media type and wrong HTTP method', async () => {
        const malformed = new Request('https://nexus.internal/api/nexus/safeorder', { method: 'POST', headers: { authorization: 'Bearer synthetic-service-key', 'content-type': 'application/json' }, body: '{' });
        expect((await worker.fetch(malformed, env, ctx)).status).toBe(400);
        expect((await worker.fetch(request(valid, 'Bearer synthetic-service-key', 'text/plain'), env, ctx)).status).toBe(400);
        expect((await worker.fetch(new Request('https://nexus.internal/api/nexus/safeorder'), env, ctx)).status).toBe(405);
    });
    it('does not allow the local test payment provider in production', async () => {
        await expect(handleNexusSafeOrder(request({ ...valid, paymentMethod: 'pp_system_default' }), { ...env, ENVIRONMENT: 'production' })).rejects.toMatchObject({ status: 400 });
    });
    it('production CORS rejects foreign origins and logs contain no credentials or email', async () => {
        const logs: string[] = [];
        const spies = ['log', 'warn', 'error'].map((method) => vi.spyOn(console, method as 'log').mockImplementation((line) => { logs.push(String(line)); }));
        try {
            const req = request(); req.headers.set('Origin', 'https://attacker.test');
            const response = await worker.fetch(req, { ...env, ENVIRONMENT: 'production', ALLOWED_ORIGINS: 'https://shop.test' }, ctx);
            expect(response.status).toBe(200);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('null');
            await worker.fetch(request(valid, 'Bearer wrong'), env, ctx);
            expect(logs.join(' ')).not.toContain(valid.customerEmail);
            expect(logs.join(' ')).not.toContain('synthetic-service-key');
        } finally { spies.forEach((spy) => spy.mockRestore()); }
    });
    it('administrative voucher issuance rejects unauthorized and foreign-tenant requests before storage', async () => {
        const issue = (tenantId: string, authorization?: string) => new Request('https://nexus.internal/api/vouchers/issue', {
            method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
            body: JSON.stringify({ tenantId, orderId: 'synthetic-order', orderState: 'PAID', customerEmail: 'synthetic@example.test', lines: [{ sku: 'synthetic-voucher', quantity: 1, unitPriceMinor: 100, isVoucherProduct: true }] }),
        });
        expect((await worker.fetch(issue('anastasia'), env, ctx)).status).toBe(401);
        expect((await worker.fetch(issue('other', 'Bearer synthetic-service-key'), env, ctx)).status).toBe(403);
        expect(env.DB.prepare).not.toHaveBeenCalled();
    });

});
