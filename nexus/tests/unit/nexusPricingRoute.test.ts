import { describe, it, expect } from 'vitest';
import { handleNexusPricing } from '../../workers/api/routes/nexusPricing.js';
import type { Env } from '../../workers/api/types.js';

describe('handleNexusPricing Route Handler', () => {
    it('spočítá brand sale cenu pre DELPHIN (15 % akcia)', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                basePrice: 100,
                customerTier: 'ZR4',
                manufacturer: 'DELPHIN',
            }),
        });

        const res = await handleNexusPricing(req, {} as Env);
        expect(res.status).toBe(200);

        const data = await res.json() as { ok: boolean; calculated: { finalPrice: number } };
        expect(data.ok).toBe(true);
        expect(data.calculated.finalPrice).toBe(85);
    });

    it('spočítá loyalty tier cenu pre ne-brandSale výrobcu (ZR25 = 25 % sleva)', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                basePrice: 100,
                customerTier: 'ZR25',
                manufacturer: 'UNKNOWN_BRAND',
            }),
        });

        const res = await handleNexusPricing(req, {} as Env);
        expect(res.status).toBe(200);

        const data = await res.json() as { ok: boolean; calculated: { finalPrice: number } };
        expect(data.ok).toBe(true);
        expect(data.calculated.finalPrice).toBe(75);
    });
});
