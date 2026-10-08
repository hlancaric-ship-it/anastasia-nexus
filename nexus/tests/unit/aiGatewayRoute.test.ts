import { describe, it, expect } from 'vitest';
import { handleAIQuery } from '../../workers/api/routes/aiGateway.js';
import type { Env } from '../../workers/api/types.js';

describe('handleAIQuery Route Handler', () => {
    it('vracia 403 ak chýba GDPR súhlas', async () => {
        const req = new Request('https://nexus-api.internal/api/ai/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: 'Dávkovanie omega 3',
                gdprConsent: false,
            }),
        });

        const res = await handleAIQuery(req, {} as Env);
        expect(res.status).toBe(403);
        const data = await res.json() as { ok: boolean; error: string };
        expect(data.ok).toBe(false);
        expect(data.error).toContain('GDPR');
    });

    it('vracia 422 pre prázdny dopyt', async () => {
        const req = new Request('https://nexus-api.internal/api/ai/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: '   ',
                gdprConsent: true,
            }),
        });

        const res = await handleAIQuery(req, {} as Env);
        expect(res.status).toBe(422);
        const data = await res.json() as { ok: boolean; error: string };
        expect(data.ok).toBe(false);
    });
});
