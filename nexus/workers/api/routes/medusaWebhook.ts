// Medusa.js Webhook Route Handler pre Cloudflare Workers
import { ApiError, jsonResponse, log } from '../http.js';
import type { Env } from '../types.js';

export async function handleMedusaWebhook(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
): Promise<Response> {
    const webhookSecret = env.MEDUSA_WEBHOOK_SECRET;
    if (!webhookSecret && env.ENVIRONMENT === 'production') {
        throw new ApiError('MISSING_BINDING', 503, 'Chybí secret pro podpis Medusa webhooku.');
    }
    const rawBody = await request.text();
    if (webhookSecret && !(await verifyMedusaSignature(request.headers.get('x-medusa-signature'), rawBody, webhookSecret))) {
        throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatný nebo expirovaný podpis Medusa webhooku.');
    }
    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Webhook požiadavka musí byť platný JSON.');
    }

    const payload = body as { event?: string; type?: string; id?: string; data?: Record<string, unknown> };
    const eventName = payload.event || payload.type;
    if (!eventName || typeof eventName !== 'string') {
        throw new ApiError('VALIDATION_ERROR', 422, 'Payload nesmie chýbať pole event.');
    }

    const eventId = request.headers.get('x-medusa-delivery') || payload.id;
    if (!eventId) throw new ApiError('VALIDATION_ERROR', 422, 'Webhook payload musí obsahovat id události.');

    if (!env.DB) throw new ApiError('MISSING_BINDING', 503, 'Chýba D1 úložiště idempotence webhooků.');
    let receipt: { event_id: string } | null;
    try {
        receipt = await env.DB.prepare(
            'INSERT INTO medusa_webhook_receipts (event_id, event_type) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING RETURNING event_id'
        ).bind(eventId, eventName).first<{ event_id: string }>();
    } catch {
        throw new ApiError('STORAGE_UNAVAILABLE', 503, 'Nelze bezpečně ověřit opakované doručení webhooku.');
    }
    if (!receipt) {
        log('info', 'webhook.medusa.duplicate_skipped', { eventId, event: eventName });
        return jsonResponse({
            received: true,
            duplicate: true,
            event: eventName,
            timestamp: new Date().toISOString(),
        });
    }

    log('info', 'webhook.medusa.received', {
        event: eventName,
        eventId,
        dataId: payload.data?.id,
    });

    // Asynchrónne spracovanie po odoslaní HTTP 200 OK (Medusa webhook SLA)
    ctx.waitUntil(
        (async () => {
            try {
                if (eventName === 'order.placed') {
                    log('info', 'medusa.order_placed.processed', { orderId: payload.data?.id });
                } else if (eventName === 'customer.created') {
                    log('info', 'medusa.customer_created.processed', { customerId: payload.data?.id });
                }
            } catch (err) {
                log('error', 'medusa.webhook_async_failed', {
                    event: eventName,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })()
    );

    return jsonResponse({
        received: true,
        event: eventName,
        eventId,
        timestamp: new Date().toISOString(),
    });
}

async function verifyMedusaSignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
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
