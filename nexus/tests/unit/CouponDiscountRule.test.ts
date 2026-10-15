// CouponDiscountRule a jeho zapojení do createNexusPricingCalculator
// (12. 10. 2026, Krok 2 bod 6 -- "Propojit QR aktivaci slevy s NEXUS
// pricing"). Testuje především umístění AŽ PO DiscountLimitRule (VAGNER
// pravidlo) -- viz hlavička CouponDiscountRule.ts pro zdůvodnění.

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { CouponDiscountRule } from '../../domains/pricing/CouponDiscountRule.js';
import { createNexusPricingCalculator } from '../../domains/pricing/createNexusPricingCalculator.js';
import { InMemoryPricingConfigurationProvider } from '../../domains/pricing/PricingConfigurationProvider.js';
import type { TenantContext } from '../../core/tenant/types.js';

describe('CouponDiscountRule (izolovaně)', () => {
    const rule = new CouponDiscountRule({ tenantId: 'ten_test', ruleId: 'coupon-discount-v1', ruleVersion: '1' });

    it('bez kupónu (undefined) se neuplatní', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(100) });
        expect(result.applied).toBe(false);
    });

    it('0% nebo záporná sleva se neuplatní', () => {
        expect(rule.evaluate({ currentPrice: new Decimal(100), discountPercent: new Decimal(0) }).applied).toBe(false);
        expect(rule.evaluate({ currentPrice: new Decimal(100), discountPercent: new Decimal(-0.1) }).applied).toBe(false);
    });

    it('10% sleva sníží cenu o přesně 10 %', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(100), discountPercent: new Decimal(0.1) });
        expect(result.applied).toBe(true);
        expect(result.price!.toNumber()).toBe(90);
        expect(result.rule).toBe('COUPON');
    });

    it('sleva nad 100 % se ořízne na 100 % (cena 0, ne záporná)', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(50), discountPercent: new Decimal(1.5) });
        expect(result.price!.toNumber()).toBe(0);
    });
});

describe('Kupón zapojený do createNexusPricingCalculator', () => {
    const tenant: TenantContext = { tenantId: 'anastasia', platform: 'medusa' };
    const provider = new InMemoryPricingConfigurationProvider({
        loyaltyTiers: { BRONZOVY: 0.05, ZLATY: 0.15 },
        brandLimits: {},
        categoryLimits: { KOZMETIKA: 0.1 },
    });
    const calculate = createNexusPricingCalculator(provider, tenant);

    it('bez couponDiscountPercent se chování nezmění (regresní pojistka)', () => {
        const result = calculate({ sku: 'SK-1', basePrice: new Decimal(100) });
        expect(result.finalPrice.toNumber()).toBe(100);
        expect(result.appliedRules.some((r) => r.rule === 'COUPON')).toBe(false);
    });

    it('kupón se aplikuje NAD výslednou cenou z tier slevy', () => {
        const result = calculate({
            sku: 'SK-1',
            basePrice: new Decimal(100),
            customerTier: 'ZLATY',
            allowLoyaltyDiscount: true,
            couponDiscountPercent: new Decimal(0.1),
        });
        // 100 -> 85 (15% tier) -> 76.5 (dalších 10% z 85)
        expect(result.finalPrice.toNumber()).toBe(76.5);
        expect(result.appliedRules.map((r) => r.rule)).toContain('COUPON');
        expect(result.appliedRules.map((r) => r.rule)).toContain('LOYALTY');
    });

    it('VAGNER scénář: aktivní category limit + salePrice -- kupón se aplikuje AŽ NA salePrice, limit ho nesmaže', () => {
        // category limit 10 %, ale salePrice je hlubší sleva (40 %) -> DiscountLimitRule
        // vrátí salePrice beze změny (VAGNER pravidlo), kupón pak jede z 60, ne ze 100.
        const result = calculate({
            sku: 'SK-2',
            basePrice: new Decimal(100),
            salePrice: new Decimal(60),
            category: 'KOZMETIKA',
            couponDiscountPercent: new Decimal(0.1),
        });
        expect(result.finalPrice.toNumber()).toBe(54); // 60 * 0.9
        expect(result.appliedRules.map((r) => r.rule)).toContain('COUPON');
    });

    it('neplatný customerTier pořád vyhodí chybu i s kupónem (guard beze změny)', () => {
        expect(() =>
            calculate({ sku: 'SK-3', basePrice: new Decimal(100), customerTier: 'NEEXISTUJE', couponDiscountPercent: new Decimal(0.1) })
        ).toThrow(/Unknown customerTier/);
    });
});
