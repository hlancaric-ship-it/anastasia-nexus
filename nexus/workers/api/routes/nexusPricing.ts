// NEXUS Pricing API Route Handler pre Medusa.js / Cloudflare Workers
import { ApiError, jsonResponse } from '../http.js';
import type { Env } from '../types.js';
import Decimal from 'decimal.js';
import { createNexusPricingCalculator } from '../../../domains/pricing/createNexusPricingCalculator.js';
import { StaticPricingConfigurationProvider } from '../../../domains/pricing/StaticPricingConfigurationProvider.js';
import type { PolicyConfig } from '../../../domains/pricing/PricingConfigurationProvider.js';
import type { TenantContext } from '../../../core/tenant/types.js';

export async function handleNexusPricing(request: Request, env: Env): Promise<Response> {
    const apiKey = env.MEDUSA_PRICING_API_KEY;
    const tenantId = env.MEDUSA_PRICING_TENANT_ID?.trim().toLowerCase();
    const authorization = request.headers.get('authorization') || '';
    if (!apiKey || !tenantId || !constantTimeEqual(authorization, `Bearer ${apiKey}`)) {
        throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatné přihlašovací údaje pricing služby.');
    }
    const policyConfig = readTenantPolicy(env.MEDUSA_PRICING_POLICY_JSON);
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Telo požiadavky musí byť platný JSON.');
    }

    const input = body as Record<string, unknown>;
    const basePrice = input.basePrice;
    if (typeof basePrice !== 'number' || !Number.isFinite(basePrice) || basePrice < 0) {
        throw new ApiError('VALIDATION_ERROR', 400, 'basePrice musí být nezáporné konečné číslo.');
    }
    if (typeof input.sku !== 'string' || input.sku.trim().length === 0) {
        throw new ApiError('VALIDATION_ERROR', 400, 'sku produktu je povinné.');
    }
    if (input.salePrice !== undefined && (typeof input.salePrice !== 'number' || !Number.isFinite(input.salePrice) || input.salePrice < 0)) {
        throw new ApiError('VALIDATION_ERROR', 400, 'salePrice musí být nezáporné konečné číslo.');
    }
    if (typeof input.salePrice === 'number' && input.salePrice > basePrice) {
        throw new ApiError('VALIDATION_ERROR', 400, 'salePrice nesmí být vyšší než basePrice.');
    }
    if (input.productMaxDiscount !== undefined && (typeof input.productMaxDiscount !== 'number' || !Number.isFinite(input.productMaxDiscount) || input.productMaxDiscount < 0 || input.productMaxDiscount > 1)) {
        throw new ApiError('VALIDATION_ERROR', 400, 'productMaxDiscount musí být nezáporné konečné číslo.');
    }

    if (!/^[a-z0-9_-]{2,32}$/i.test(tenantId)) {
        throw new ApiError('MISSING_BINDING', 503, 'Tenant pricing služby není správně nakonfigurován.');
    }
    if (input.tenantId !== undefined && input.tenantId !== tenantId) {
        throw new ApiError('VALIDATION_ERROR', 403, 'Požadovaný tenant neodpovídá tenantovi přidělenému této službě.');
    }

    const tenant: TenantContext = { tenantId, platform: 'medusa' };
    const provider = new StaticPricingConfigurationProvider(policyConfig);
    const calculator = createNexusPricingCalculator(provider, tenant);

    const result = calculator({
        sku: input.sku,
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
            // calculator() returns { rule, metadata? }[] (LegacyPricingResult);
            // the Medusa-side consumer contract (nexus-cart/route.ts PriceResponse)
            // is plain string[] -- same flattening PricingAdapter.evaluate() does.
            // Found 2026-10-12: sending the raw objects made every real
            // /store/nexus-cart call fail INVALID_NEXUS_PRICE_RESPONSE, masked
            // until now because no test exercised a populated appliedRules array.
            appliedRules: result.appliedRules.map((r) => r.rule),
            rejected: result.rejected,
        },
        timestamp: new Date().toISOString(),
    });
}

function readTenantPolicy(raw: string | undefined): PolicyConfig {
    if (!raw) throw new ApiError('MISSING_BINDING', 503, 'Chybí tenant pricing policy pro Medusu.');
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new ApiError('VALIDATION_ERROR', 503, 'Tenant pricing policy není platný JSON.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError('VALIDATION_ERROR', 503, 'Tenant pricing policy musí být objekt.');
    }
    const policy = value as Record<string, unknown>;
    const maps = ['loyaltyTiers', 'brandLimits', 'categoryLimits', 'brandSaleDiscounts'] as const;
    for (const key of maps) {
        const map = policy[key];
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            throw new ApiError('VALIDATION_ERROR', 503, `Tenant pricing policy vyžaduje mapu ${key}.`);
        }
        for (const [name, ratio] of Object.entries(map)) {
            if (!name || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
                throw new ApiError('VALIDATION_ERROR', 503, `Neplatná sleva v tenant pricing policy (${key}.${name}).`);
            }
        }
    }
    return policy as unknown as PolicyConfig;
}

function constantTimeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    let difference = left.length ^ right.length;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
        difference |= (left[index % Math.max(1, left.length)] ?? 0) ^ (right[index % Math.max(1, right.length)] ?? 0);
    }
    return difference === 0;
}
