export const webhookTestSecret = 'synthetic-webhook-signing-secret';
export async function signedMedusaWebhook(payload: unknown, timestamp = Math.floor(Date.now() / 1000), secret = webhookTestSecret) {
    const body = JSON.stringify(payload);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    const signature = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return new Request('https://nexus.test/api/webhooks/medusa', { method: 'POST', body,
        headers: { 'content-type': 'application/json', 'x-medusa-signature': `t=${timestamp},v1=${signature}` } });
}
