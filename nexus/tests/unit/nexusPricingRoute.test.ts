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

        const data = await res.json() as { ok: boolean; calculated: { finalPrice: number } };
        expect(data.ok).toBe(true);
        expect(data.calculated.finalPrice).toBe(85);
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
});
