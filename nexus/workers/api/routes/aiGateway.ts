/**
 * POST /api/ai/query
 *
 * AI Gateway – asistent ekosystému ANASTASIA (Fáza 2).
 *
 * BEZPEČNOSTNÍ PODMÍNKY (uzavřené 21. 10. 2026):
 *  1) AUTENTIFIKACE -- endpoint je server-to-server. Vyžaduje TYTĚŽ
 *     credential jako cenová služba (`MEDUSA_PRICING_API_KEY` v hlavičce
 *     `Authorization: Bearer ...`) a tenant z `MEDUSA_PRICING_TENANT_ID`.
 *     Bez credentialu je odpověď 401, bez konfigurace identity 503.
 *     Dřívější verze endpointu byla veřejná (jen publishable klíč webu),
 *     což znamenalo veřejný placený endpoint.
 *  2) RATE LIMIT -- atomický, přes Durable Object `VOUCHER_SECURITY`
 *     (stejný jako u poukazů), dvě úrovně: per IP a per tenant.
 *     Bez úložiště je odpověď 503, nikoli "limit neplatí" (fail-closed).
 *  3) KLÍČ POSKYTOVATELE -- bez `AI_API_KEY` je odpověď 503. Volání AI se
 *     nikdy neobjedná bez explicitního klíče vlastníka.
 *  4) GDPR -- souhlas je povinný, jinak 403. Obsah dotazu se neloguje.
 *  5) NÁKLAD -- `max_tokens` je tvrdě omezený na 512.
 *
 * Podpisy a tenant se ověřují PŘED čtením těla požiadavky: chybný podpis
 * nesmí vracet jinou odpoveď než 401 (rozdiel by prozradil parsovaní).
 *
 * Odpověď NIKDY neobsahuje detaily chyby poskytovatele ani klíč.
 */

import { ApiError, jsonResponse, log } from '../http.js';
import { authenticateMedusaService } from '../medusaServiceAuth.js';
import { resolveRateLimiter } from '../rate-limit-store.js';
import type { Env } from '../types.js';

type Persona = 'pharmacist' | 'wellness';

interface AIQueryRequest {
    query: string;
    persona?: Persona;
    /** ISO language code: sk | en | ru */
    lang?: string;
    /** GDPR consent – MUST be true, otherwise 403 */
    gdprConsent: boolean;
}

const SYSTEM_PROMPTS: Record<Persona, string> = {
    pharmacist:
        'Si AI lekárenský poradca pre e-shop ANASTASIA. Odpovedáš len na otázky o produktoch, dávkovaní a interakciách. Nikdy nediagnostikuješ. Ak ide o vážny zdravotný problém, odporuč lekára. Odpoveď stručne, max 3 odseky.',
    wellness:
        'Si AI wellness coach pre programy ANASTASIA. Radíš o meditácii, dýchaní a celostnom zdraví. Nikdy nediagnostikuješ ani nenahrádzaš lekára. Odpoveďaj pokojne, v 2–4 vetách.',
};

/**
 * Limity. Per IP zastaví jednotlivého útočníka, per tenant botnet
 * rozprostřený po mnoha IP, kde je každá jednotlivá IP pod limitem.
 * Obě úrovně musí projít.
 */
const AI_RATE_LIMIT_PER_IP = 10;
const AI_RATE_LIMIT_PER_TENANT = 60;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;

const MAX_TOKENS = 512;
const MAX_QUERY_LENGTH = 1000;

export async function handleAIQuery(
    request: Request,
    env: Env,
    fetchImpl: typeof fetch = fetch,
): Promise<Response> {
    // 1) AUTENTIFIKACE -- stejná credential jako cenová služba.
    const tenantId = authenticateMedusaService(request, env);

    // 2) KLÍČ POSKYTOVATELE -- bez něj se AI nevolá (a neplatí se).
    const aiKey = env.AI_API_KEY?.trim();
    if (!aiKey) {
        log('error', 'ai.query.not_configured', { tenantId, alert: true });
        throw new ApiError('MISSING_BINDING', 503, 'AI služba nie je nakonfigurovaná (chýba AI_API_KEY).');
    }

    // 3) RATE LIMIT -- před jakoukoli prací s tělem a před voláním AI.
    const limiter = resolveRateLimiter(env);
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';

    const perIp = await limiter.checkRateLimit(
        `ai:ip:${tenantId}:${clientIp}`,
        AI_RATE_LIMIT_PER_IP,
        AI_RATE_LIMIT_WINDOW_MS,
    );
    if (!perIp.allowed) {
        log('warn', 'ai.query.rate_limited', { scope: 'ip', tenantId, alert: true });
        return rateLimitedResponse(perIp.retryAfterSeconds);
    }

    const perTenant = await limiter.checkRateLimit(
        `ai:tenant:${tenantId}`,
        AI_RATE_LIMIT_PER_TENANT,
        AI_RATE_LIMIT_WINDOW_MS,
    );
    if (!perTenant.allowed) {
        log('warn', 'ai.query.rate_limited', { scope: 'tenant', tenantId, alert: true });
        return rateLimitedResponse(perTenant.retryAfterSeconds);
    }

    // 4) TĚLO -- teď až po ověření identity.
    let body: AIQueryRequest;
    try {
        body = (await request.json()) as AIQueryRequest;
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Tělo požiadavky musí byť platný JSON.');
    }

    // 5) GDPR -- souhlas je povinný. Obsah dotazu se NELOGUJE.
    if (body?.gdprConsent !== true) {
        throw new ApiError('VALIDATION_ERROR', 403, 'GDPR súhlas je povinný pre použitie AI poradcu.');
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > MAX_QUERY_LENGTH) {
        throw new ApiError('VALIDATION_ERROR', 422, `Dotaz musí mať 1–${MAX_QUERY_LENGTH} znakov.`);
    }

    const persona: Persona = body.persona === 'pharmacist' ? 'pharmacist' : 'wellness';
    const systemPrompt = SYSTEM_PROMPTS[persona];

    // 6) VOLÁNÍ POSKYTOVATELE -- chyba poskytovatele se ven nepropírá.
    const geminiRes = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: query }] }],
                generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.4 },
            }),
        },
    );

    if (!geminiRes.ok) {
        log('error', 'ai.query.upstream_failed', { tenantId, status: geminiRes.status, alert: true });
        throw new ApiError('INTERNAL_ERROR', 502, 'AI služba momentálne neodpovedá.');
    }

    const geminiData = (await geminiRes.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const answer =
        geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Odpoveď nie je dostupná.';

    log('info', 'ai.query.answered', { tenantId, persona, lang: body.lang ?? 'sk' });

    return jsonResponse({
        ok: true,
        tenantId,
        persona,
        answer,
        lang: body.lang ?? 'sk',
        timestamp: new Date().toISOString(),
    });
}

/** 429 s hlavičkou `Retry-After` -- tvar odpovědi jako u `routes/voucher.ts`. */
function rateLimitedResponse(retryAfterSeconds: number | undefined): Response {
    const retryAfter = retryAfterSeconds ?? Math.ceil(AI_RATE_LIMIT_WINDOW_MS / 1000);
    return new Response(
        JSON.stringify({
            ok: false,
            error: 'RATE_LIMITED',
            message: 'Príliš veľa dotazov. Skúste to znova o chvíľu.',
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Retry-After': String(retryAfter),
            },
        },
    );
}
