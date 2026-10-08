import { describe, it, expect } from 'vitest';
import { handleNexusSafeOrder } from '../../workers/api/routes/nexusSafeOrder.js';
import type { Env } from '../../workers/api/types.js';

describe('handleNexusSafeOrder Route Handler', () => {
    it('vyhodnotí bezpečnú Stripe platbu ako ALLOW', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/safeorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderSum: 50,
                paymentMethod: 'stripe',
                customerEmail: 'klientka@anastasia.sk',
            }),
        });

        const res = await handleNexusSafeOrder(req, {} as Env);
        expect(res.status).toBe(200);

        const data = (await res.json()) as { ok: boolean; decision: string; score: number };
        expect(data.ok).toBe(true);
        expect(data.decision).toBe('ALLOW');
        expect(data.score).toBe(0);
    });

    it('zablokuje podvodnú dobierkovú objednávku s dočasným mailom', async () => {
        const req = new Request('https://nexus-api.internal/api/nexus/safeorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderSum: 250,
                paymentMethod: 'dobierka',
                customerEmail: 'fake@tempmail.com',
            }),
        });

        const res = await handleNexusSafeOrder(req, {} as Env);
        expect(res.status).toBe(200);

        const data = (await res.json()) as { ok: boolean; decision: string; score: number };
        expect(data.ok).toBe(true);
        expect(data.decision).toBe('BLOCK');
        expect(data.score).toBeGreaterThanOrEqual(70);
    });
});
