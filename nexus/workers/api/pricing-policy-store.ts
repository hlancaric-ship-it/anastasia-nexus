// Uložiště cenové politiky tenantu v KV.
//
// Politika (věrnostní úrovně) přichází z databáze Medusa podepsaným webhookem
// a Worker si ji tady uloží. Zdroj pravdy pro zľavy je tato politika; env var
// `MEDUSA_PRICING_POLICY_JSON` zůstává fallback (a drží limity značek/kategorií).
//
// Cache v izolátu na 30 s: KV se nečte při každém řádku košíku a politika se
// mění zřídka. Po uložení nové politiky se cache vyprázdní (platí hned).
import { ApiError } from './http.js';
import type { Env } from './types.js';

const TIER_CODE = /^ZR[1-9]\d?$/;
const MAX_DISCOUNT_RATIO = 0.5;
const STORED_POLICY_TTL_MS = 30_000;

export function pricingPolicyKey(tenantId: string): string {
    return `medusa-pricing-policy:${tenantId}`;
}

/** Vyčíslí mapu `ZR1..ZR4 -> podiel zľavy`; neplatnou mapu odmítne (fail-closed). */
export function parseLoyaltyTiers(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError('VALIDATION_ERROR', 422, 'Politika musí obsahovať mapu loyaltyTiers.');
    }
    const tiers: Record<string, number> = {};
    for (const [code, ratio] of Object.entries(value as Record<string, unknown>)) {
        if (!TIER_CODE.test(code) || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > MAX_DISCOUNT_RATIO) {
            throw new ApiError('VALIDATION_ERROR', 422, `Neplatná zľava pre úroveň ${code}.`);
        }
        tiers[code] = ratio;
    }
    return tiers;
}

let storedPolicyCache: { tenantId: string; tiers: Record<string, number>; expiresAt: number } | null = null;

/** Po úspěšném uložení politiky se cache vyprázdní (nová politika platí hned). */
export function invalidateStoredPolicyCache(): void {
    storedPolicyCache = null;
}

/**
 * Uložené věrnostní úrovně tenantu (null = nic uloženého, použije se env politika).
 * Poškodená hodnota se NEPOUŽIJE (vrátí null), nikdy se nahradí jinou mapou.
 */
export async function readStoredLoyaltyTiers(env: Env): Promise<Record<string, number> | null> {
    const tenantId = env.MEDUSA_PRICING_TENANT_ID?.trim().toLowerCase();
    if (!tenantId || !env.PRICING_POLICY) return null;
    if (storedPolicyCache && storedPolicyCache.tenantId === tenantId && storedPolicyCache.expiresAt > Date.now()) {
        return storedPolicyCache.tiers;
    }
    let raw: string | null = null;
    try { raw = await env.PRICING_POLICY.get(pricingPolicyKey(tenantId)); }
    catch { return null; }
    if (!raw) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return null; }
    const value = (parsed ?? {}) as { loyaltyTiers?: unknown };
    let tiers: Record<string, number>;
    try { tiers = parseLoyaltyTiers(value.loyaltyTiers); }
    catch { return null; }
    storedPolicyCache = { tenantId, tiers, expiresAt: Date.now() + STORED_POLICY_TTL_MS };
    return tiers;
}

/** Uloží politiku do KV (volá se až po ověření podpisu a tvaru). */
export async function storeLoyaltyPolicy(env: Env, tenantId: string, loyaltyTiers: Record<string, number>): Promise<void> {
    if (!env.PRICING_POLICY) {
        throw new ApiError('MISSING_BINDING', 503, 'Chybí úložiště cenové politiky (KV binding PRICING_POLICY).');
    }
    const stored = JSON.stringify({ tenantId, loyaltyTiers, updatedAt: new Date().toISOString() });
    await env.PRICING_POLICY.put(pricingPolicyKey(tenantId), stored);
    invalidateStoredPolicyCache();
}
