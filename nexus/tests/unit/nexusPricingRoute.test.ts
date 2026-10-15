import { describe, it, expect } from 'vitest';
import { handleNexusPricing } from '../../workers/api/routes/nexusPricing.js';
import type { Env } from '../../workers/api/types.js';

describe('handleNexusPricing Route Handler', () => {
    const policy = JSON.stringify({ loyaltyTiers: { ZR4: 0.04, ZR25: 0.25 }, brandLimits: {}, categoryLimits: {}, brandSaleDiscounts: { DELPHIN: 0.15 } });
    const env = { MEDUSA_PRICING_API_KEY: 'test-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', MEDUSA_PRICING_POLICY_JSON: policy } as Env;

    it('rejects callers without the server credential and fails closed without tenant policy', async () => {
        const body = JSON.stringify({ basePrice: 100 });
        const unauthenticated = new Request('https://nexus-api.internal/api/nexus/pricing', { method: 'POST', body });
        await expect(handleNexusPricing(unauthenticated, env)).rejects.toThrow('Neplatné přihlašovací údaje pricing služby.');

        const authenticated = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST', headers: { authorization: 'Bearer test-key' }, body,
        });
        await expect(handleNexusPricing(authenticated, { ...env, MEDUSA_PRICING_POLICY_JSON: undefined } as Env)).rejects.toThrow('Chybí tenant pricing policy pro Medusu.');
    });
    it('spočítá brand sale cenu pre DELPHIN (15 % akcia)', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer test-key' },
            body: JSON.stringify({
                sku: 'TEST-1',
                basePrice: 100,
                customerTier: 'ZR4',
                manufacturer: 'DELPHIN',
            }),
        });

        const res = await handleNexusPricing(req, env);
        expect(res.status).toBe(200);

        const data = await res.json() as { ok: boolean; calculated: { finalPrice: number; appliedRules: unknown[] } };
        expect(data.ok).toBe(true);
        expect(data.calculated.finalPrice).toBe(85);
        // Regression (2026-10-12): the calculator's native shape is
        // {rule, metadata?}[]; the Medusa-side consumer contract
        // (nexus-cart/route.ts PriceResponse) is plain string[]. Sending the
        // raw objects made every real /store/nexus-cart call fail
        // INVALID_NEXUS_PRICE_RESPONSE, undetected because no test here ever
        // asserted on appliedRules' element type for a populated response.
        expect(data.calculated.appliedRules.length).toBeGreaterThan(0);
        for (const rule of data.calculated.appliedRules) expect(typeof rule).toBe('string');
    });

    it('spočítá loyalty tier cenu pre ne-brandSale výrobcu (ZR25 = 25 % sleva)', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer test-key' },
            body: JSON.stringify({
                sku: 'TEST-2',
                basePrice: 100,
                customerTier: 'ZR25',
                manufacturer: 'UNKNOWN_BRAND',
            }),
        });

        const res = await handleNexusPricing(req, env);
        expect(res.status).toBe(200);

        const data = await res.json() as { ok: boolean; calculated: { finalPrice: number } };
        expect(data.ok).toBe(true);
        expect(data.calculated.finalPrice).toBe(75);
    });

    it('couponDiscountPercent sníží finální cenu o danou procentuální sazbu (12.10.2026)', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer test-key' },
            body: JSON.stringify({ sku: 'TEST-COUPON', basePrice: 100, couponDiscountPercent: 0.2 }),
        });
        const res = await handleNexusPricing(req, env);
        expect(res.status).toBe(200);
        const data = await res.json() as { calculated: { finalPrice: number; appliedRules: string[] } };
        expect(data.calculated.finalPrice).toBe(80);
        expect(data.calculated.appliedRules).toContain('COUPON');
    });

    it('couponDiscountPercent mimo rozsah <0,1> je VALIDATION_ERROR', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer test-key' },
            body: JSON.stringify({ sku: 'TEST-COUPON', basePrice: 100, couponDiscountPercent: 1.5 }),
        });
        await expect(handleNexusPricing(req, env)).rejects.toThrow('couponDiscountPercent musí být číslo mezi 0 a 1.');
    });
});
