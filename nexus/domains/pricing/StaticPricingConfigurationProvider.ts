// Static (In-Memory) implementácia PricingConfigurationProvider pre Cloudflare Workers.
// Poskytuje konfiguráciu cenníkových stropov, tierov a akcií bez prístupu k súborovému systému (fs).

import type { TenantContext } from '../../core/tenant/types.js';
import type { PolicyConfig, PricingConfigurationProvider } from './PricingConfigurationProvider.js';

// Tenant-neutrálny bezpečný fallback: žiadne tiery, žiadne brand limity/zľavy.
// NESMIE obsahovať dáta konkrétneho tenanta (OKFISH aj ANASTASIA majú vlastnú
// politiku v MEDUSA_PRICING_POLICY_JSON) — chýbajúci/čiastočný tenant config
// sa má prejaviť ako "žiadna zľava", nikdy ako tichý fallback na cudzie čísla.
export const SAFE_EMPTY_PRICING_CONFIG: PolicyConfig = {
    loyaltyTiers: {},
    brandLimits: {},
    categoryLimits: {},
    brandSaleDiscounts: {},
};

export class StaticPricingConfigurationProvider implements PricingConfigurationProvider {
    private readonly config: PolicyConfig;

    constructor(customConfig?: Partial<PolicyConfig>) {
        this.config = {
            ...SAFE_EMPTY_PRICING_CONFIG,
            ...(customConfig ?? {}),
        };
    }

    getPolicyConfig(_context: TenantContext): PolicyConfig {
        return this.config;
    }
}
