// Politika věrnostních úrovní z databáze Medusa -> KV tenantu.
//
// PROČ TOHLE A NE "PERCENTÁ V POŽÁDÁVCE":
// Worker je autorita na výpočet ceny. Medusa mu posílá jen kód úrovně
// (`customerTier`), NE procento -- kdyby procento přišlo v požádavce, backend
// by si určoval výši zľavy a politika v `MEDUSA_PRICING_POLICY_JSON` by byla
// jen dekorace. Tady si politiku NEXUS sám uloží (podepsaný webhook z Medusa),
// takže klient ani backend nemůžou poslat vlastní procento.
//
// Podpis je stejný jako u medusa webhooku (`X-Medusa-Signature: t=<čas>,v1=<hmac>`),
// tajemství je `MEDUSA_WEBHOOK_SECRET` (nepoužívá se obecný `HMAC_SECRET`).
import { ApiError, jsonResponse } from '../http.js';
import type { Env } from '../types.js';
import { parseLoyaltyTiers, storeLoyaltyPolicy } from '../pricing-policy-store.js';

async function readBody(request: Request): Promise<string> {
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;
            length += result.value.byteLength;
            if (length > 64 * 1024) {
                await reader.cancel();
                throw new ApiError('VALIDATION_ERROR', 413, 'Payload je príliš veľký.');
            }
            chunks.push(result.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

/** Podpis `t=<unix>,v1=<hmac-sha256>` nad `${timestamp}.${body}`. */
export async function verifyMedusaSignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map((part) => {
        const separator = part.indexOf('=');
        return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }));
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !/^\d+$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > 300) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
    const expected = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
    let mismatch = expected.length ^ signature.length;
    for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ (signature.toLowerCase().charCodeAt(index) || 0);
    return mismatch === 0;
}

/** POST /api/nexus/pricing-policy -- politika z DB Medusa (podepsaná). */
export async function handleNexusPricingPolicy(request: Request, env: Env): Promise<Response> {
    const secret = env.MEDUSA_WEBHOOK_SECRET;
    const tenantId = env.MEDUSA_PRICING_TENANT_ID?.trim().toLowerCase();
    if (!secret || !tenantId || !/^[a-z0-9_-]{2,32}$/.test(tenantId)) {
        throw new ApiError('MISSING_BINDING', 503, 'Chýba overenie zdroja Medusa webhooku.');
    }
    const rawBody = await readBody(request);
    if (!(await verifyMedusaSignature(request.headers.get('x-medusa-signature'), rawBody, secret))) {
        throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatný nebo expirovaný podpis Medusa webhooku.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); }
    catch { throw new ApiError('INVALID_JSON', 400, 'Tělo požiadavky musí byť platný JSON.'); }
    const payload = (parsed ?? {}) as Record<string, unknown>;
    if (payload.tenantId !== tenantId) {
        throw new ApiError('VALIDATION_ERROR', 403, 'Tenant nezodpovedá tenantovi cenovej služby.');
    }
    const loyaltyTiers = parseLoyaltyTiers(payload.loyaltyTiers);
    await storeLoyaltyPolicy(env, tenantId, loyaltyTiers);
    return jsonResponse({ accepted: true, tenantId, tiers: Object.keys(loyaltyTiers).length });
}
