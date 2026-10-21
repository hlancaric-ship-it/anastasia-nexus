// CouponDiscountRule -- nové pravidlo (12. 10. 2026, Krok 2 bod 6
// PROGRESS_LOG.md: "Propojit QR aktivaci slevy s NEXUS pricing").
//
// ZÁMĚRNĚ NEPOUŽÍVÁ starý CouponPolicyRule/legacy CouponPolicy (OKFISH
// "ZR20/ZR25 locked tiers, 20% standardLimit") -- ANASTASIA bude mít
// vlastní věrnostní tiery (Lucky 12.10.2026, zatím neurčené: pracovní
// návrh Bronzový/Strieborný/Zlatý), takže vázat kupón na konkrétní OKFISH
// tier kódy by bylo jen hádání cizí byznys logiky do jiného tenanta.
// Schéma starého `ecCoupon` (anozeu DB.sql) navíc žádnou vazbu na tier
// nemá vůbec -- jen couponCode, discountPerc/discountAmount, validFrom/
// Until, useMultiple, quotePriceMin/Max, productCodes. Tahle verze proto
// řeší jen procentuální slevu, bez tier eligibility.
//
// UMÍSTĚNÍ V CHAINU: AŽ PO DiscountLimitRule, ne před ním (viz
// createNexusPricingCalculator.ts). Důvod: DiscountLimitRule má
// "VAGNER pravidlo" -- je-li aktivní limit (product/brand/category) A
// salePrice je definovaná, salePrice vyhrává ABSOLUTNĚ, cap-floor se
// vůbec nepočítá. Kdyby kupón modifikoval currentPrice PŘED touhle
// kontrolou, DiscountLimitRule by ho tiše přepsal zpět na salePrice a
// kupón by na zlevněných položkách s aktivním limitem neměl žádný efekt
// -- nenápadná chyba, ne reálný business požadavek. Aplikace AŽ PO
// DiscountLimitRule je jednoznačná: kupón sníží tu cenu, kterou zbytek
// řetězce už jednou doladil, ne naopak.
//
// FIXED-AMOUNT KUPÓNY (ecCoupon.discountAmount) NEJSOU touhle verzí
// řešené -- pevná částka na celý košík vyžaduje alokaci mezi položky
// (tenhle calculator počítá cenu PER ITEM, ne za celý košík), což je
// samostatný problém. Zatím jen procentuální sleva (ecCoupon.discountPerc
// / Medusa Promotion application_method.type === "percentage").
//
// POZOR -- limit použití (ecCoupon žádný limit nemá, ale Medusa Promotion
// má `limit`/`used`): tahle rule NEŘEŠÍ atomické navýšení použití kupónu.
// To musí udělat volající (Medusa, při dokončení objednávky) přes
// `IPromotionModuleService`, jinak jednorázový kupón půjde použít
// neomezeně -- viz docs/PROGRESS_LOG.md, zatím neimplementováno, sledovat
// jako samostatný krok.

import Decimal from 'decimal.js';
import type { Rule, RuleContext } from '../../core/canonical/rules/Rule.js';

export interface CouponDiscountRuleInput {
    readonly currentPrice: Decimal;
    /** Procentuální sleva jako ratio (0.10 = 10 %), z Medusa Promotion application_method.value / 100. */
    readonly discountPercent?: Decimal;
    /**
     * Pevná zľava (EUR) přidělená této položce košíku.
     *
     * Alokaci pevné sumy mezi položky dělá Medusa (zná celý košík a pravidla
     * kupónu); Worker jen odečte přidělený podíl. Cena NIKDY neklesne pod 0.
     */
    readonly fixedAmount?: Decimal;
}

export interface CouponDiscountRuleResult {
    readonly applied: boolean;
    readonly price?: Decimal;
    readonly rule?: 'COUPON';
}

export class CouponDiscountRule implements Rule<CouponDiscountRuleInput, CouponDiscountRuleResult> {
    constructor(public readonly context: RuleContext) {}

    evaluate(input: CouponDiscountRuleInput): CouponDiscountRuleResult {
        const one = new Decimal('1');
        const zero = new Decimal(0);
        let current = input.currentPrice;

        // Procento nejprve, pevná částka potom (kdyby přišly obě, pevná snižuje to,
        // co zbylo po procentu). Kdyby žádné nebylo, pravidlo se neaplikuje.
        if (input.discountPercent && input.discountPercent.greaterThan(0)) {
            const ratio = Decimal.min(input.discountPercent, one);
            current = Decimal.max(current.mul(one.minus(ratio)), zero);
        }
        if (input.fixedAmount && input.fixedAmount.greaterThan(0)) {
            current = Decimal.max(current.minus(input.fixedAmount), zero);
        }
        if (current.equals(input.currentPrice)) {
            return { applied: false };
        }
        return { applied: true, price: current, rule: 'COUPON' };
    }
}
