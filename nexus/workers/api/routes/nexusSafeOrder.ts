// NEXUS SafeOrder 3.0 Risk API Route Handler pre Medusa.js / Cloudflare Workers
import { ApiError, jsonResponse } from '../http.js';
import type { Env } from '../types.js';
import { RiskEngineRule } from '../../../domains/safeorder/RiskEngineRule.js';

export async function handleNexusSafeOrder(request: Request, _env: Env): Promise<Response> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Telo požiadavky musí byť platný JSON.');
    }

    const input = body as Record<string, unknown>;
    const orderSum = Number(input.orderSum ?? input.amount ?? 0);
    const paymentMethod = String(input.paymentMethod ?? '');
    const customerEmail = String(input.customerEmail ?? '').toLowerCase();
    const codLimit = Number(input.codLimit ?? 120);

    let score = 10;
    const factors: string[] = [];
    const isCod = paymentMethod.includes('prevzatí') || paymentMethod.includes('dobierk') || paymentMethod.includes('cod');

    if (isCod) {
        score += 20;
        factors.push('Platba na dobierku (+20)');
        if (orderSum > codLimit) {
            score += 35;
            factors.push(`Dobierka nad limit ${codLimit} € (+35)`);
        }
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
        score: Math.min(100, score),
        decision,
        factors,
        statusText: `${decision} · ${
            decision === 'ALLOW' ? 'Automaticky schválené' : decision === 'REVIEW' ? 'Vyžaduje kontrolu' : 'Zablokované'
        }`,
        timestamp: new Date().toISOString(),
    });
}
