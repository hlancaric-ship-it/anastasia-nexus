import { describe, it, expect } from 'vitest';
import { handleNexusPricing } from '../../workers/api/routes/nexusPricing.js';
import { handleNexusSafeOrder } from '../../workers/api/routes/nexusSafeOrder.js';
import type { Env } from '../../workers/api/types.js';

const pricingEnv = { MEDUSA_PRICING_API_KEY: 'integration-key', MEDUSA_PRICING_TENANT_ID: 'anastasia', MEDUSA_PRICING_POLICY_JSON: JSON.stringify({ loyaltyTiers: { ZR25: 0.25 }, brandLimits: {}, categoryLimits: {}, brandSaleDiscounts: {} }) } as Env;

describe('NEXUS pricing API boundary (unit-level; not a Medusa E2E test)', () => {
    it('1. Načíta produkt v Meduse a vypočíta finálnu cenu cez NEXUS Pricing Engine (ZR25 tier)', async () => {
        const cartReq = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer integration-key' },
            body: JSON.stringify({
                tenantId: 'anastasia',
                sku: 'DEMO-SER-001',
                basePrice: 24.90,
                customerTier: 'ZR25',
                manufacturer: 'ANASTASIA',
                allowLoyaltyDiscount: true,
            }),
        });

        const res = await handleNexusPricing(cartReq, pricingEnv);
        expect(res.status).toBe(200);

        const data = await res.json() as {
            ok: boolean;
            tenantId: string;
            calculated: { finalPrice: number; appliedRules: string[] };
        };

        expect(data.ok).toBe(true);
        expect(data.tenantId).toBe("anastasia");
        expect(data.calculated.finalPrice).toBeLessThan(24.90);
        expect(data.calculated.finalPrice).toBe(18.68);
    });

    it('2. Odmietne pokus o pricing s neoprávneným tenantId (tenant isolation)', async () => {
        const cartReq = new Request('https://nexus-api.internal/api/nexus/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer integration-key' },
            body: JSON.stringify({
                tenantId: 'hacked-tenant',
                sku: 'DEMO-SER-001',
                basePrice: 24.90,
            }),
        });

        await expect(handleNexusPricing(cartReq, pricingEnv)).rejects.toThrow('Požadovaný tenant neodpovídá tenantovi přidělenému této službě.');
    });

    it('3. Vyhodnotí SafeOrder riziko pre bezpečnú CardPay objednávku (handler only; no Medusa order created)', async () => {
        const checkoutReq = new Request('https://nexus-api.internal/api/nexus/safeorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer integration-key' },
            body: JSON.stringify({
                tenantId: 'anastasia',
                currency: 'eur',
                orderSum: 18.68,
                paymentMethod: 'CardPay Platobná karta',
                customerEmail: 'lucia@example.com',
            }),
        });

        const res = await handleNexusSafeOrder(checkoutReq, pricingEnv);
        expect(res.status).toBe(200);

        const data = await res.json() as {
            score: number;
            decision: string;
            statusText: string;
        };

        expect(data.score).toBeLessThan(40);
        expect(data.decision).toBe('ALLOW');
        expect(data.statusText).toContain('ALLOW');
    });

    it('4. Zablokuje podozrivú dobierkovú objednávku s dočasným e-mailom cez SafeOrder Risk OS', async () => {
        const checkoutReq = new Request('https://nexus-api.internal/api/nexus/safeorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: 'Bearer integration-key' },
            body: JSON.stringify({
                tenantId: 'anastasia',
                currency: 'eur',
                orderSum: 350.00,
                paymentMethod: 'Platba na dobierku',
                customerEmail: 'fraud@mailinator.com',
            }),
        });

        const res = await handleNexusSafeOrder(checkoutReq, pricingEnv);
        expect(res.status).toBe(200);

        const data = await res.json() as {
            score: number;
            decision: string;
            statusText: string;
        };

        expect(data.score).toBeGreaterThanOrEqual(70);
        expect(data.decision).toBe('BLOCK');
    });
});
