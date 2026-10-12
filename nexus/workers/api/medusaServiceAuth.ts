import { ApiError } from './http.js';
import type { Env } from './types.js';

/** One server credential belongs to exactly one tenant in this deployment. */
export function authenticateMedusaService(request: Request, env: Env): string {
    const key = env.MEDUSA_PRICING_API_KEY;
    const tenant = env.MEDUSA_PRICING_TENANT_ID?.trim().toLowerCase();
    if (!key || !key.trim() || !tenant || !/^[a-z0-9_-]{2,32}$/.test(tenant)) {
        throw new ApiError('MISSING_BINDING', 503, 'Chybí platná identita Medusa služby.');
    }
    const actual = new TextEncoder().encode(request.headers.get('authorization') || '');
    const expected = new TextEncoder().encode(`Bearer ${key}`);
    let difference = actual.length ^ expected.length;
    for (let index = 0; index < Math.max(actual.length, expected.length); index++) {
        difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
    }
    if (difference !== 0) throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatná identita Medusa služby.');
    return tenant;
}
