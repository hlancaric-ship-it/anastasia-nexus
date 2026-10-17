import type { Env } from '../types';

/** Retired: recurring payments must belong to the same Medusa/NEXUS checkout
 * and order ledger as every other purchase. Never call Stripe from this legacy
 * route, even if the old key is still configured or a caller retries an old URL.
 * This response does not imply that native recurring billing is implemented. */
export async function handleKlubSubscribe(_request: Request, _env: Env): Promise<Response> {
    return Response.json(
        {
            ok: false,
            error: 'LEGACY_SUBSCRIPTION_RETIRED',
            message: 'Tento spôsob objednania členstva už nie je dostupný. Členstvo musí prejsť objednávkou v obchode.',
        },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
}
