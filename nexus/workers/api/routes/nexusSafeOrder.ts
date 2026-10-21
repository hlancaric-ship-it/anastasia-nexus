// NEXUS SafeOrder 3.0 Risk API Route Handler pre Medusa.js / Cloudflare Workers
import { ApiError, jsonResponse } from '../http.js';
import type { Env } from '../types.js';
import { authenticateMedusaService } from '../medusaServiceAuth.js';

export async function handleNexusSafeOrder(request: Request, env: Env): Promise<Response> {
    const tenantId = authenticateMedusaService(request, env);
    if (request.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 405, 'SafeOrder očekává POST.');
    if ((request.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        throw new ApiError('VALIDATION_ERROR', 400, 'SafeOrder vyžaduje application/json.');
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Telo požiadavky musí byť platný JSON.');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError('VALIDATION_ERROR', 400, 'Tělo musí být objekt.');
    }
    const input = body as Record<string, unknown>;
    if (input.tenantId !== tenantId) {
        throw new ApiError('REJECT_SIGNATURE', 403, 'Tenant neodpovídá identitě služby.');
    }
    const allowedFields = ['tenantId', 'currency', 'orderSum', 'paymentMethod', 'customerEmail'];
    if (Object.keys(input).some((key) => !allowedFields.includes(key))) {
        throw new ApiError('VALIDATION_ERROR', 400, 'Nepovolené pole požadavku.');
    }
    const orderSum = input.orderSum;
    if (typeof orderSum !== 'number' || !Number.isFinite(orderSum) || orderSum < 0 || orderSum > Number.MAX_SAFE_INTEGER / 100 || input.currency !== 'eur') {
        throw new ApiError('VALIDATION_ERROR', 400, 'Neplatná částka nebo nepodporovaná měna.');
    }
    if (typeof input.paymentMethod !== 'string') {
        throw new ApiError('VALIDATION_ERROR', 400, 'Chybí platební metoda.');
    }
    const paymentMethod = input.paymentMethod.toLowerCase();
    const codMethods = ['cod', 'pp_cod_cod', 'dobierka', 'platba pri prevzatí', 'platba na dobierku'];
    // Prevod na účet: tovar ani digitálny obsah sa nevydá pred pripísaním platby (bez rizika nevyzdvihnutia).
    const bankTransferMethods = ['bank_transfer', 'pp_bank_transfer_bank_transfer', 'prevod', 'prevod na účet'];
    // pp_membership_stripe_membership: Klub ANASTASIA, kartová platba přes Stripe (manuální capture až po ALLOW).
    const onlineMethods = ['stripe', 'pp_stripe_stripe', 'pp_membership_stripe_membership', 'cardpay', 'cardpay platobná karta'];
    const isTestPayment = paymentMethod === 'pp_system_default' && ['development', 'test'].includes(env.ENVIRONMENT || '');
    if (!codMethods.includes(paymentMethod) && !onlineMethods.includes(paymentMethod) && !bankTransferMethods.includes(paymentMethod) && !isTestPayment) {
        throw new ApiError('VALIDATION_ERROR', 400, 'Nepodporovaná platební metoda.');
    }
    if (typeof input.customerEmail !== 'string' || input.customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail)) {
        throw new ApiError('VALIDATION_ERROR', 400, 'Neplatný e-mail.');
    }
    const customerEmail = input.customerEmail.toLowerCase();

    let score = 10;
    const factors: string[] = [];
    const isCod = codMethods.includes(paymentMethod);

    if (isCod) {
        score += 20;
        factors.push('Platba na dobierku (+20)');
        // Bez pevného limitu na dobierku (rozhodnutie majiteľa obchodu 21. 10. 2026): hodnota objednávky
        // sa posudzuje všeobecne (pravidlo pre sumu > 300 €), nie osobitným limitom dobierky.
    } else if (bankTransferMethods.includes(paymentMethod)) {
        factors.push('Prevod na účet – vybavenie až po pripísaní platby');
    } else {
        factors.push('Bezpečná online platba CardPay / Stripe (-10)');
        score = Math.max(0, score - 10);
    }

    const tempDomains = ['mailinator.com', 'tempmail.com', '10minutemail.com', 'trashmail.com'];
    if (tempDomains.some((d) => customerEmail.includes(d))) {
        score += 45;
        factors.push('Dočasná e-mailová adresa (+45)');
    }

    if (orderSum > 300) {
        score += 25;
        factors.push('Vysoká hodnota objednávky >300 € (+25)');
    }

    let decision: 'ALLOW' | 'REVIEW' | 'BLOCK' = 'ALLOW';
    if (score >= 70) decision = 'BLOCK';
    else if (score >= 40) decision = 'REVIEW';

    return jsonResponse({
        ok: true,
        tenantId,
        currency: input.currency,
        orderSum,
        score: Math.min(100, score),
        decision,
        factors,
        statusText: `${decision} · ${
            decision === 'ALLOW' ? 'Automaticky schválené' : decision === 'REVIEW' ? 'Vyžaduje kontrolu' : 'Zablokované'
        }`,
        timestamp: new Date().toISOString(),
    });
}
