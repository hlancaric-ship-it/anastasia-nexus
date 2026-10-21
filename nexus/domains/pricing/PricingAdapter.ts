// PricingAdapter -- obaluje legacy Pricing Engine, nepřepisuje ho.
// Legacy Pricing Engine -> PricingAdapter -> Nexus Pricing Contract
// Ownership pravidel se postupně přesune do Nexusu; legacy zůstává
// referenční, dokud tento adapter nedosáhne parity (viz MIGRATION_PLAN.md).

import Decimal from 'decimal.js';
import type { PricingComputationInput } from '../../core/canonical/entities/Price.js';
import type { Rule, RuleContext } from '../../core/canonical/rules/Rule.js';
import type { Decision } from '../../core/canonical/rules/Decision.js';

export interface PricingRuleResult {
    readonly finalPrice: Decimal;
    readonly appliedRules: string[];
    readonly rejected: boolean;
    readonly rejectReason?: string;
}

/**
 * Nexus-side Rule, deleguje výpočet na legacy PricingEngine (injektováno,
 * ne re-implementováno). Zachovává: HighestDiscountPolicy,
 * DiscountLimitPolicy (Product->Brand->Category), RoundingPolicy,
 * Decimal aritmetika -- to vše je LEGACY, nemigrováno, jen obaleno.
 */
/** Legacy `PricingResult` shape (core/interfaces.ts v connectors/pricing-engine/legacy) -- jen ta pole, co adapter potřebuje. */
export interface LegacyPricingResult {
    finalPrice: Decimal;
    appliedRules: { rule: string; metadata?: string }[];
    rejected: boolean;
    rejectReason?: string;
}

/** Legacy `PricingInput` shape -- jen ta pole, co canonical vstup umí dodat. */
export interface LegacyPricingInput {
    sku: string;
    basePrice: Decimal;
    salePrice?: Decimal;
    productMaxDiscount?: Decimal;
    customerTier?: string;
    allowLoyaltyDiscount?: boolean;
    manufacturer?: string;
    category?: string;
    /**
     * Procentuální sleva z QR/kupón kódu jako ratio (0.10 = 10 %), server-side
     * vyřešená z Medusa Promotion -- NIKDY klientem dodaná hodnota slevy,
     * jen ověřený kód. Nepovinné -- bez kupónu se krok v
     * createNexusPricingCalculator přeskočí (viz CouponDiscountRule.ts).
     */
    couponDiscountPercent?: Decimal;
    /**
     * Pevná zľava (EUR) přidělená této položce košíku.
     *
     * Alokaci pevné sumy mezi položky dělá Medusa (zná celý košík i pravidla
     * kupónu); sem přichází už jen podíl pro tuto položku. Nikdy klientem
     * dodaná hodnota -- jen serverem vypočítaná a ověřená.
     */
    couponFixedAmount?: Decimal;
}

export class PricingAdapter implements Rule<PricingComputationInput, PricingRuleResult> {
    constructor(
        public readonly context: RuleContext,
        private readonly legacyCalculatePrice: (input: LegacyPricingInput) => LegacyPricingResult
    ) {}

    evaluate(input: PricingComputationInput): PricingRuleResult {
        const legacyResult = this.legacyCalculatePrice({
            sku: input.productSku,
            basePrice: input.basePrice.amount,
            salePrice: input.salePrice?.amount,
            productMaxDiscount: input.productMaxDiscount !== undefined
                ? new Decimal(input.productMaxDiscount)
                : undefined,
            customerTier: input.customerTier,
            allowLoyaltyDiscount: input.allowLoyaltyDiscount,
            manufacturer: input.manufacturer,
            category: input.category,
        });

        return {
            finalPrice: legacyResult.finalPrice,
            appliedRules: legacyResult.appliedRules.map((r) => r.rule),
            rejected: legacyResult.rejected,
            rejectReason: legacyResult.rejectReason,
        };
    }

    toDecision(result: PricingRuleResult, inputReference: string, fingerprint: string): Omit<Decision<PricingRuleResult>, keyof import('../../core/canonical/entities/base.js').CanonicalEntity> {
        return {
            ruleId: this.context.ruleId,
            ruleVersion: this.context.ruleVersion,
            inputReference,
            result,
            reason: result.rejected
                ? (result.rejectReason ?? 'rejected')
                : `applied: ${result.appliedRules.join(', ')}`,
            fingerprint,
        };
    }
}
