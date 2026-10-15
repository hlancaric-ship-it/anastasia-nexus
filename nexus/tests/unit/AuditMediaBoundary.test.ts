import { describe, it, expect } from 'vitest';
import { issueMediaAccess } from '../../../backend/src/modules/entitlement/media/access';
import { handleMediaDelivery } from '../../workers/api/routes/mediaDelivery.js';
import type { Env } from '../../workers/api/types.js';

// Positive exploit assertions: passing means the baseline weakness is reproduced.
// Real issuer + real Worker handler; only R2 storage and entitlement persistence are synthetic.
const secret = 'synthetic-audit-media-secret-0000000000000000';
const files: Record<string, string> = {
  'shared/owned.m3u8': '#EXTM3U\n#EXTINF:6,\nowned-segment.ts\n',
  'shared/owned-segment.ts': 'SYNTHETIC_OWNED_SEGMENT',
  'shared/unpurchased.mp4': 'SYNTHETIC_UNPURCHASED_PAID_CONTENT',
};
function environment(): Env {
  return { MEDIA_TOKEN_SECRET: secret, MEDIA_BUCKET: {
    head: async (key: string) => files[key] === undefined ? null : { size: files[key].length },
    get: async (key: string) => files[key] === undefined ? null : { body: new Response(files[key]).body, text: async () => files[key] },
  } } as unknown as Env;
}
async function issue() {
  return issueMediaAccess({
    guard: { findActiveAccess: async (customer: string, product: string) => customer === 'cus_audit_a' && product === 'prod_audit_owned' ? { id: 'ent_audit', status: 'active' } as any : null } as any,
    getProductMetadata: async () => ({ protected_media: [{ key: 'shared/owned.m3u8' }] }),
    getCustomerEmail: async () => 'synthetic@example.test', audit: () => undefined,
    secret, deliveryBaseUrl: 'https://media.example.test/api/media',
  }, { customerId: 'cus_audit_a', productId: 'prod_audit_owned', mediaKey: 'shared/owned.m3u8' });
}
describe('audit: media authorization and actual URL resolution', () => {
  it('AUD-MEDIA-01: a legitimately issued playlist token reads an unregistered paid sibling', async () => {
    const issued = await issue();
    const token = new URL(issued.url).searchParams.get('t')!;
    const response = await handleMediaDelivery(new Request(`https://media.example.test/api/media/v1/${encodeURIComponent('shared/unpurchased.mp4')}?t=${token}`), environment());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('SYNTHETIC_UNPURCHASED_PAID_CONTENT');
  });
  it('AUD-MEDIA-02: browser-relative HLS segment from the real issued URL loses its directory and is denied', async () => {
    const issued = await issue();
    const playlist = await handleMediaDelivery(new Request(issued.url), environment());
    expect(playlist.status).toBe(200);
    const segment = (await playlist.text()).split('\n').find(line => line && !line.startsWith('#'))!;
    const resolved = new URL(segment, issued.url);
    expect(resolved.pathname).toBe('/api/media/v1/owned-segment.ts');
    const response = await handleMediaDelivery(new Request(resolved), environment());
    expect(response.status).toBe(403);
  });
  it('AUD-MEDIA-03: issued bearer URL remains usable without a customer session', async () => {
    const issued = await issue();
    const response = await handleMediaDelivery(new Request(issued.url), environment());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
