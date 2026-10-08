// Static (In-Memory) implementácia PricingConfigurationProvider pre Cloudflare Workers.
// Poskytuje konfiguráciu cenníkových stropov, tierov a akcií bez prístupu k súborovému systému (fs).

import type { TenantContext } from '../../core/tenant/types.js';
import type { PolicyConfig, PricingConfigurationProvider } from './PricingConfigurationProvider.js';

export const DEFAULT_ANASTASIA_PRICING_CONFIG: PolicyConfig = {
    loyaltyTiers: {
        ZR4: 0.04,
        ZR6: 0.06,
        ZR8: 0.08,
        ZR10: 0.10,
        ZR12: 0.12,
        ZR14: 0.14,
        ZR16: 0.16,
        ZR18: 0.18,
        ZR20: 0.20,
        ZR25: 0.25,
    },
    brandLimits: {
        'DELPHIN': 0.25,
        'MIVARDI': 0.20,
        'MIKADO': 0.15,
        'FISHING POINT': 0.10,
    },
    categoryLimits: {},
    brandSaleDiscounts: {
        'DELPHIN': 0.15,
        'MIVARDI': 0.10,
        'MIKADO': 0.09,
    },
};

export class StaticPricingConfigurationProvider implements PricingConfigurationProvider {
    private readonly config: PolicyConfig;

    constructor(customConfig?: Partial<PolicyConfig>) {
        this.config = {
            ...DEFAULT_ANASTASIA_PRICING_CONFIG,
            ...(customConfig ?? {}),
        };
    }

    getPolicyConfig(_context: TenantContext): PolicyConfig {
        return this.config;
    }
}
