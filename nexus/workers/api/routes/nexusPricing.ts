// NEXUS Pricing API Route Handler pre Medusa.js / Cloudflare Workers
import { ApiError, jsonResponse } from '../http.js';
import type { Env } from '../types.js';
import Decimal from 'decimal.js';
import { createNexusPricingCalculator } from '../../../domains/pricing/createNexusPricingCalculator.js';
import { StaticPricingConfigurationProvider } from '../../../domains/pricing/StaticPricingConfigurationProvider.js';
import type { TenantContext } from '../../../core/tenant/types.js';

export async function handleNexusPricing(request: Request, _env: Env): Promise<Response> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Telo požiadavky musí byť platný JSON.');
    }

    const input = body as Record<string, unknown>;
    const basePrice = Number(input.basePrice ?? 0);
    if (isNaN(basePrice) || basePrice < 0) {
        throw new ApiError('VALIDATION_ERROR', 400, 'basePrice musí byť kladné číslo.');
    }

    const tenantId = typeof input.tenantId === 'string' && input.tenantId.trim().length > 0
        ? input.tenantId.trim()
        : 'anastasia';

    const tenant: TenantContext = { tenantId, platform: 'medusa' };
    const provider = new StaticPricingConfigurationProvider();
    const calculator = createNexusPricingCalculator(provider, tenant);

    const result = calculator({
        sku: typeof input.sku === 'string' ? input.sku : 'ANASTASIA-SKU-DEMO',
        basePrice: new Decimal(basePrice),
        salePrice: typeof input.salePrice === 'number' ? new Decimal(input.salePrice) : undefined,
        customerTier: typeof input.customerTier === 'string' ? input.customerTier : undefined,
        manufacturer: typeof input.manufacturer === 'string' ? input.manufacturer : undefined,
        category: typeof input.category === 'string' ? input.category : undefined,
        productMaxDiscount: typeof input.productMaxDiscount === 'number' ? new Decimal(input.productMaxDiscount) : undefined,
        allowLoyaltyDiscount: typeof input.allowLoyaltyDiscount === 'boolean' ? input.allowLoyaltyDiscount : true,
    });

    return jsonResponse({
        ok: true,
        tenantId,
        input: {
            basePrice,
            salePrice: input.salePrice,
            customerTier: input.customerTier,
            manufacturer: input.manufacturer,
        },
        calculated: {
            finalPrice: Number(result.finalPrice),
            appliedRules: result.appliedRules,
            rejected: result.rejected,
        },
        timestamp: new Date().toISOString(),
    });
}
