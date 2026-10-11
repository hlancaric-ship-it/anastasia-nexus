import { describe, it, expect } from 'vitest';
import { handleMediaDelivery, isKeyAllowed, parseRange, rewritePlaylist, verifyMediaToken } from '../../workers/api/routes/mediaDelivery.js';
import type { Env } from '../../workers/api/types.js';

const SECRET = 'x'.repeat(40);
const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('base64url');

async function makeToken(key: string, expSec = Math.floor(Date.now() / 1000) + 600, secret = SECRET) {
    const body = b64u(Buffer.from(JSON.stringify({ v: 1, c: 'cus_1', p: 'p_1', k: key, e: expSec, n: 'n1' })));
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
    return `${body}.${b64u(sig)}`;
}

function makeEnv(files: Record<string, string>): Env {
    return {
        MEDIA_TOKEN_SECRET: SECRET,
        MEDIA_BUCKET: {
            head: async (key: string) => {
                const content = files[key];
                return typeof content === 'string' ? { size: content.length, httpEtag: '"e"' } : null;
            },
            get: async (key: string, opts?: { range?: { offset?: number; length?: number } }) => {
                const full = files[key];
                if (typeof full !== 'string') return null;
                const part = opts?.range ? full.slice(opts.range.offset ?? 0, (opts.range.offset ?? 0) + (opts.range.length ?? full.length)) : full;
                return { body: new Response(part).body, size: full.length, text: async () => full };
            },
        },
    } as unknown as Env;
}
const req = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Request(`https://w.example/api/media/v1/${path}`, { method, headers });

describe('media delivery', () => {
    const files = { 'ep001/t1.mp3': '0123456789', 'ep001/list.m3u8': '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.key"\n#EXTINF:6,\nseg1.ts\nhttps://cdn.example/x.ts\n', 'ep001/seg1.ts': 'SEG', 'jine/tajne.mp3': 'XXX' };

    it('platný token doručí soubor bez možnosti cachování', async () => {
        const t = await makeToken('ep001/t1.mp3');
        const r = await handleMediaDelivery(req(`ep001%2Ft1.mp3?t=${t}`), makeEnv(files));
        expect(r.status).toBe(200);
        expect(r.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await r.text()).toBe('0123456789');
    });
    it('Range vrací 206 s Content-Range, neplatný 416', async () => {
        const t = await makeToken('ep001/t1.mp3');
        const r = await handleMediaDelivery(req(`ep001%2Ft1.mp3?t=${t}`, { range: 'bytes=2-4' }), makeEnv(files));
        expect(r.status).toBe(206);
        expect(r.headers.get('Content-Range')).toBe('bytes 2-4/10');
        expect(await r.text()).toBe('234');
        const bad = await handleMediaDelivery(req(`ep001%2Ft1.mp3?t=${t}`, { range: 'bytes=50-60' }), makeEnv(files));
        expect(bad.status).toBe(416);
    });
    it('bez tokenu, cizí tajemství, expirovaný nebo jiný objekt: 403', async () => {
        const env = makeEnv(files);
        expect((await handleMediaDelivery(req('ep001%2Ft1.mp3'), env)).status).toBe(403);
        expect((await handleMediaDelivery(req(`ep001%2Ft1.mp3?t=${await makeToken('ep001/t1.mp3', undefined, 'y'.repeat(40))}`), env)).status).toBe(403);
        expect((await handleMediaDelivery(req(`ep001%2Ft1.mp3?t=${await makeToken('ep001/t1.mp3', Math.floor(Date.now() / 1000) - 5)}`), env)).status).toBe(403);
        expect((await handleMediaDelivery(req(`jine%2Ftajne.mp3?t=${await makeToken('ep001/t1.mp3')}`), env)).status).toBe(403);
    });
    it('neexistující objekt s platným tokenem vrací stejné 403', async () => {
        expect((await handleMediaDelivery(req(`ep001%2Fnic.mp3?t=${await makeToken('ep001/nic.mp3')}`), makeEnv(files))).status).toBe(403);
    });
    it('HLS: playlist se přepíše tokenem, segment ze stejné složky projde, cizí složka ne', async () => {
        const t = await makeToken('ep001/list.m3u8');
        const env = makeEnv(files);
        const pl = await (await handleMediaDelivery(req(`ep001%2Flist.m3u8?t=${t}`), env)).text();
        expect(pl).toContain(`seg1.ts?t=${t}`);
        expect(pl).toContain(`URI="k.key?t=${t}"`);
        expect(pl).toContain('https://cdn.example/x.ts');
        expect((await handleMediaDelivery(req(`ep001%2Fseg1.ts?t=${t}`), env)).status).toBe(200);
        expect((await handleMediaDelivery(req(`jine%2Ftajne.mp3?t=${t}`), env)).status).toBe(403);
    });
    it('nenakonfigurováno a špatná metoda', async () => {
        await expect(handleMediaDelivery(req('a'), {} as Env)).rejects.toMatchObject({ status: 503 });
        await expect(handleMediaDelivery(req('a', {}, 'POST'), makeEnv(files))).rejects.toMatchObject({ status: 405 });
    });
});

describe('helpers', () => {
    it('isKeyAllowed blokuje traversal', () => {
        expect(isKeyAllowed('../x', '../x')).toBe(false);
        expect(isKeyAllowed('a//b', 'a//b')).toBe(false);
        expect(isKeyAllowed('ep/seg.ts', 'ep/list.m3u8')).toBe(true);
        expect(isKeyAllowed('ep/seg.ts', 'ep/t.mp3')).toBe(false);
    });
    it('parseRange', () => {
        expect(parseRange(null, 10)).toBeNull();
        expect(parseRange('bytes=-3', 10)).toEqual({ offset: 7, length: 3 });
        expect(parseRange('bytes=5-', 10)).toEqual({ offset: 5, length: 5 });
        expect(parseRange('bytes=0-0,5-6', 10)).toBe('invalid');
    });
    it('verifyMediaToken a rewritePlaylist', async () => {
        expect((await verifyMediaToken(SECRET, 'a.b')).ok).toBe(false);
        expect(rewritePlaylist('#EXTM3U\nseg.ts', 'T')).toBe('#EXTM3U\nseg.ts?t=T');
    });
});
