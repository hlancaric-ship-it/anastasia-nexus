import { describe, it, expect } from 'vitest';
import { handleMediaDelivery } from '../../workers/api/routes/mediaDelivery.js';

// Chránený PDF z knižnice: krátkodobý podpísaný odkaz, náhľad v prehliadači
// (nie zadanie na stiahnutie) a prístup len s platným oprávnením.
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const secret = 'synthetic-media-document-key-'.repeat(2);

async function mint(key: string, extra = {}) {
  const body = b64(new TextEncoder().encode(JSON.stringify({ v: 1, c: 'cus_synthetic', p: 'prod_synthetic', k: key, n: 'nonce', e: Math.floor(Date.now() / 1000) + 600, ...extra })));
  const signing = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', signing, new TextEncoder().encode(body))))}`;
}

function environment(files: Record<string, string>) {
  const reads: string[] = [];
  return {
    reads,
    env: {
      MEDIA_TOKEN_SECRET: secret,
      MEDIA_BUCKET: {
        head: async (key: string) => (files[key] === undefined ? null : { size: files[key].length }),
        get: async (key: string) => {
          reads.push(key);
          if (files[key] === undefined) return null;
          return { body: new Response(files[key]).body, text: async () => files[key]! };
        },
      },
    } as any,
  };
}

const PDF = '%PDF-1.4 private document';

describe('chránený PDF z knižnice', () => {
  it('sa zobrazí v prehliadači ako PDF, nie ako stiahnutie', async () => {
    const token = await mint('paid/book.pdf');
    const { env } = environment({ 'paid/book.pdf': PDF });
    const response = await handleMediaDelivery(
      new Request(`https://synthetic.invalid/api/media/v1/paid%2Fbook.pdf?t=${token}`),
      env,
    );
    expect(response.status).toBe(200);
    // Bez `application/pdf` by prehliadač súbor stiahol (application/octet-stream).
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(PDF);
  });

  it('HEAD vráti hlavičky bez tela', async () => {
    const token = await mint('paid/book.pdf');
    const { env } = environment({ 'paid/book.pdf': PDF });
    const response = await handleMediaDelivery(
      new Request(`https://synthetic.invalid/api/media/v1/paid%2Fbook.pdf?t=${token}`, { method: 'HEAD' }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(await response.text()).toBe('');
  });

  it('bez platného podpisu sa PDF nedostane ani na jeden bajt', async () => {
    const { env, reads } = environment({ 'paid/book.pdf': PDF });
    expect((await handleMediaDelivery(new Request('https://synthetic.invalid/api/media/v1/paid%2Fbook.pdf'), env)).status).toBe(403);
    expect(reads).toEqual([]);
  });

  it('podpis na iný objekt PDF neodomikne', async () => {
    const token = await mint('paid/other.pdf');
    const { env, reads } = environment({ 'paid/book.pdf': PDF, 'paid/other.pdf': PDF });
    expect((await handleMediaDelivery(new Request(`https://synthetic.invalid/api/media/v1/paid%2Fbook.pdf?t=${token}`), env)).status).toBe(403);
    expect(reads).toEqual([]);
  });

  it('vypršaný podpis PDF sa odmietne', async () => {
    const token = await mint('paid/book.pdf', { e: Math.floor(Date.now() / 1000) - 1 });
    const { env } = environment({ 'paid/book.pdf': PDF });
    expect((await handleMediaDelivery(new Request(`https://synthetic.invalid/api/media/v1/paid%2Fbook.pdf?t=${token}`), env)).status).toBe(403);
  });

  it('názov sťahovania je inline pre všetky typy (žiadny attachment)', async () => {
    const token = await mint('paid/a.mp3');
    const { env } = environment({ 'paid/a.mp3': '0123456789' });
    const response = await handleMediaDelivery(
      new Request(`https://synthetic.invalid/api/media/v1/paid%2Fa.mp3?t=${token}`),
      env,
    );
    expect(response.headers.get('content-disposition')).toBe('inline');
  });
});
