import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { CouponDiscountRule } from '../../domains/pricing/CouponDiscountRule.js';

// Pevná zľava (EUR) na jednu položku košíku. Alokaci mezi položkami dělá
// Medusa (zná celý košík); Worker jen odečte přidělený podíl a nikdy nepod 0.
describe('CouponDiscountRule – pevná zľava', () => {
    const rule = new CouponDiscountRule({ tenantId: 'synthetic', ruleId: 'coupon-test', ruleVersion: '1' });

    it('odečte pevnú sumu od ceny', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(168), fixedAmount: new Decimal(20) });
        expect(result.applied).toBe(true);
        expect(result.price?.toNumber()).toBe(148);
        expect(result.rule).toBe('COUPON');
    });

    it('cena nikdy neklesne pod 0', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(10), fixedAmount: new Decimal(20) });
        expect(result.price?.toNumber()).toBe(0);
    });

    it('bez pevnej sumy a bez percenta sa pravidlo neaplikuje', () => {
        expect(rule.evaluate({ currentPrice: new Decimal(100) }).applied).toBe(false);
        expect(rule.evaluate({ currentPrice: new Decimal(100), fixedAmount: new Decimal(0) }).applied).toBe(false);
    });

    it('percento a pevná suma sa sčítajú (percento najprv, potom pevná částka)', () => {
        const result = rule.evaluate({
            currentPrice: new Decimal(100),
            discountPercent: new Decimal(0.1),
            fixedAmount: new Decimal(5),
        });
        expect(result.price?.toNumber()).toBe(85);
    });

    it('percento zostáva na svojej pôvodnej semantike', () => {
        const result = rule.evaluate({ currentPrice: new Decimal(100), discountPercent: new Decimal(0.1) });
        expect(result.price?.toNumber()).toBe(90);
    });
});
