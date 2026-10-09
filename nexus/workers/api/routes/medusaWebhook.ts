// Medusa.js Webhook Route Handler pre Cloudflare Workers
import { ApiError, jsonResponse, log } from '../http.js';
import type { Env } from '../types.js';

/** Deduplikácia spracovaných webhook událostí v pamäti pre Edge worker */
const processedWebhookEvents = new Set<string>();

export async function handleMedusaWebhook(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
): Promise<Response> {
    const webhookSecret = (env as unknown as Record<string, string>)['MEDUSA_WEBHOOK_SECRET'] || env.HMAC_SECRET;
    const signature = request.headers.get('x-medusa-signature') || request.headers.get('X-Nexus-Signature') || request.headers.get('authorization');

    if (webhookSecret && env.ENVIRONMENT === 'production') {
        if (!signature) {
            throw new ApiError('REJECT_SIGNATURE', 401, 'Chýba podpis Medusa webhooku.');
        }
        const token = signature.startsWith('Bearer ') ? signature.slice(7).trim() : signature.trim();
        if (token !== webhookSecret) {
            throw new ApiError('REJECT_SIGNATURE', 401, 'Neplatný podpis alebo kľúč Medusa webhooku.');
        }
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        throw new ApiError('INVALID_JSON', 400, 'Webhook požiadavka musí byť platný JSON.');
    }

    const payload = body as { event?: string; id?: string; data?: Record<string, unknown> };
    const eventName = payload.event;
    if (!eventName || typeof eventName !== 'string') {
        throw new ApiError('VALIDATION_ERROR', 422, 'Payload nesmie chýbať pole event.');
    }

    const eventId = payload.id || `${eventName}:${payload.data?.id || 'none'}`;

    // Idempotency check
    if (processedWebhookEvents.has(eventId)) {
        log('info', 'webhook.medusa.duplicate_skipped', { eventId, event: eventName });
        return jsonResponse({
            received: true,
            duplicate: true,
            event: eventName,
            timestamp: new Date().toISOString(),
        });
    }

    processedWebhookEvents.add(eventId);
    if (processedWebhookEvents.size > 2000) {
        const oldest = processedWebhookEvents.values().next().value;
        if (oldest) processedWebhookEvents.delete(oldest);
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
