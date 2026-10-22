import { describe, it, expect, vi } from 'vitest';
import { handleMedusaWebhook } from '../../workers/api/routes/medusaWebhook.js';
import type { Env } from '../../workers/api/types.js';
import { signedMedusaWebhook, webhookTestSecret } from '../helpers/medusaWebhookRequest.js';

const context = { waitUntil: vi.fn() };
const event = (id = 'evt_test') => ({ id, type: 'order.placed', data: { id: 'ord_synthetic' } });
function fixture() {
    const inbox = new Map<string, string>();
    const prepare = vi.fn((sql: string) => ({ bind: (...values: string[]) => ({ first: async () => {
        if (sql.includes('medusa_webhook_receipts')) return null;
        const key = JSON.stringify(values.slice(0, 2));
        if (sql.startsWith('INSERT')) {
            if (inbox.has(key)) return null;
            inbox.set(key, values[4]!);
            return { event_id: values[1] };
        }
        return inbox.has(key) ? { envelope_hash: inbox.get(key) } : null;
    } }) }));
    const env = { DB: { prepare }, MEDUSA_PRICING_TENANT_ID: 'synthetic',
        MEDUSA_WEBHOOK_SECRET: webhookTestSecret, ENVIRONMENT: 'production' } as unknown as Env;
    return { env, inbox, prepare };
}

describe('durable Medusa event intake', () => {
    it('rejects unsigned production requests before database access', async () => {
        const { env, prepare } = fixture();
        await expect(handleMedusaWebhook(new Request('https://nexus.test', { method: 'POST', body: JSON.stringify(event()) }), env, context))
            .rejects.toMatchObject({ status: 401, code: 'REJECT_SIGNATURE' });
        expect(prepare).not.toHaveBeenCalled();
    });
    it('verifies HMAC with the timestamp and rejects a stale signed event', async () => {
        const { env } = fixture();
        expect((await handleMedusaWebhook(await signedMedusaWebhook(event()), env, context)).status).toBe(200);
        await expect(handleMedusaWebhook(await signedMedusaWebhook(event(), Math.floor(Date.now() / 1000) - 301), env, context))
            .rejects.toMatchObject({ status: 401 });
    });
    it('persists before acknowledgement and acknowledges a matching replay', async () => {
        const { env, inbox } = fixture();
        context.waitUntil.mockClear();
        const first = await handleMedusaWebhook(await signedMedusaWebhook(event()), env, context);
        expect(first.status).toBe(200);
        expect(inbox.size).toBe(1);
        // Spracovanie beží po potvrdení cez waitUntil (záznam je už v inboxe), duplikát ho znova nespúšťa.
        expect(context.waitUntil).toHaveBeenCalledTimes(1);
        const second = await handleMedusaWebhook(await signedMedusaWebhook(event()), env, context);
        expect(await second.json()).toMatchObject({ received: true, duplicate: true });
        expect(inbox.size).toBe(1);
        expect(context.waitUntil).toHaveBeenCalledTimes(1);
    });
    it('rejects a reused delivery id for a different target', async () => {
        const { env } = fixture();
        await handleMedusaWebhook(await signedMedusaWebhook(event()), env, context);
        await expect(handleMedusaWebhook(await signedMedusaWebhook({ ...event(), data: { id: 'other_order' } }), env, context))
            .rejects.toMatchObject({ status: 409, code: 'WEBHOOK_CONFLICT' });
    });
    it.each([null, [], 1, {}, { ...event(), id: 1 }, { ...event(), data: { id: 'private@example.test' } },
        { ...event(), event: 'customer.created' }])('rejects malformed envelopes %j', async payload => {
        const { env, prepare } = fixture();
        await expect(handleMedusaWebhook(await signedMedusaWebhook(payload), env, context)).rejects.toMatchObject({ status: 422 });
        expect(prepare).not.toHaveBeenCalled();
    });
    it('does not acknowledge an unavailable store', async () => {
        const { env } = fixture();
        const broken = { ...env, DB: { prepare: () => { throw new Error('private details'); } } } as unknown as Env;
        await expect(handleMedusaWebhook(await signedMedusaWebhook(event()), broken, context))
            .rejects.toMatchObject({ status: 503, code: 'STORAGE_UNAVAILABLE' });
    });
    it.each(['MEDUSA_WEBHOOK_SECRET', 'MEDUSA_PRICING_TENANT_ID'] as const)('fails closed without %s', async missing => {
        const { env, prepare } = fixture();
        await expect(handleMedusaWebhook(await signedMedusaWebhook(event()), { ...env, [missing]: undefined }, context))
            .rejects.toMatchObject({ status: 503, code: 'MISSING_BINDING' });
        expect(prepare).not.toHaveBeenCalled();
    });
    it('rejects an oversized body without scheduling work', async () => {
        const { env, prepare } = fixture();
        const request = new Request('https://nexus.test', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
        await expect(handleMedusaWebhook(request, env, context)).rejects.toMatchObject({ status: 413 });
        expect(prepare).not.toHaveBeenCalled();
    });
});
