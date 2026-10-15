// Doručování chráněných médií (A-07): GET/HEAD /api/media/v1/<klíč>?t=<token>
//
// Token vydává Medusa backend (`POST /store/media-access`), formát `base64url(JSON).base64url(HMAC-SHA256)`.
// Worker NIKDY nevěří klientovi: ověří podpis, expiraci a že požadovaný objekt patří tokenu.
// Soubor leží v SOUKROMÉM R2 bucketu bez veřejné adresy; bez platného tokenu se nedá načíst.
// HLS: playlist (.m3u8) se přepíše tak, aby každý segment nesl tentýž token; segmenty smí ležet
// jen v explicitně odkazovaném playlistovém stromu, nikoli libovolně ve složce.
//
// NEŘEŠÍ (a netvrdí): natáčení obrazovky, limit souběžných přehrávání (zatím jen audit v logu).

import { ApiError, log } from '../http.js';
import type { Env } from '../types.js';

export const MEDIA_PATH_PREFIX = '/api/media/v1/';

type MediaTokenPayload = { v: 1; c: string; p: string; k: string; e: number; n: string };

const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export type TokenResult = { ok: true; payload: MediaTokenPayload } | { ok: false };

/** Ověření HMAC-SHA256 tokenu (konstantní čas přes crypto.subtle.verify) + expirace. */
export async function verifyMediaToken(secret: string, token: string, nowMs = Date.now()): Promise<TokenResult> {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9_-]+$/.test(parts[0] + parts[1])) return { ok: false };
    try {
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(parts[1]), encoder.encode(parts[0]));
        if (!valid) return { ok: false };
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as MediaTokenPayload;
        if (payload?.v !== 1 || !Number.isSafeInteger(payload.e) || typeof payload.k !== 'string' || !payload.k ||
            ![payload.c, payload.p, payload.n].every(value => typeof value === 'string' && value.length > 0)) return { ok: false };
        if (payload.e * 1000 <= nowMs || payload.e > Math.floor(nowMs / 1000) + 900) return { ok: false };
        return { ok: true, payload };
    } catch {
        return { ok: false };
    }
}

/** Exact-object match only. HLS children need explicit playlist membership below. */
export function isKeyAllowed(requestedKey: string, tokenKey: string): boolean {
    if (!requestedKey || /[\\\u0000-\u001f\u007f]/.test(requestedKey) || requestedKey.startsWith('/') || requestedKey.split('/').some(s => s === '..' || s === '.' || s === '')) return false;
    return requestedKey === tokenKey;
}

/** Resolve only relative storage URIs; never append a bearer token to another origin. */
function localUri(uri: string, playlistKey: string): URL | null {
    if (!uri || /^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(uri)) return null;
    try {
        const encoded = playlistKey.split('/').map(encodeURIComponent).join('/');
        const resolved = new URL(uri, `https://hls.invalid/${encoded}`);
        const key = decodeURIComponent(resolved.pathname.slice(1));
        if (!isKeyAllowed(key, key)) return null;
        return resolved;
    } catch { return null; }
}

function playlistUris(text: string): string[] {
    const result: string[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('#')) {
            for (const match of line.matchAll(/URI="([^"]+)"/g)) result.push(match[1]);
        } else if (line.trim()) result.push(line.trim());
    }
    return result;
}

/** Bounded traversal of trusted R2 playlists, not a blanket directory grant. */
async function isPlaylistMember(key: string, root: string, bucket: NonNullable<Env['MEDIA_BUCKET']>): Promise<boolean> {
    if (!isKeyAllowed(key, key) || !root.endsWith('.m3u8')) return false;
    const directory = root.slice(0, root.lastIndexOf('/') + 1);
    const pending = [{ key: root, depth: 0 }];
    const seen = new Set<string>();
    let entries = 0;
    while (pending.length) {
        const current = pending.pop()!;
        if (seen.has(current.key)) continue;
        seen.add(current.key);
        if (seen.size > 32 || current.depth > 6) return false;
        const object = await bucket.get(current.key);
        if (!object) continue;
        const text = await object.text();
        if (text.length > 1_048_576 || !text.startsWith('#EXTM3U')) return false;
        for (const uri of playlistUris(text)) {
            if (++entries > 10000) return false;
            const resolved = localUri(uri, current.key);
            if (!resolved) continue;
            const child = decodeURIComponent(resolved.pathname.slice(1));
            if (!child.startsWith(directory)) continue;
            if (child === key) return true;
            if (child.endsWith('.m3u8')) pending.push({ key: child, depth: current.depth + 1 });
        }
    }
    return false;
}

export type ParsedRange = { offset: number; length?: number } | 'invalid' | null;

export function parseRange(header: string | null, size: number): ParsedRange {
    if (!header) return null;
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
    let start: number;
    let end: number;
    if (m[1] === '') {
        const suffix = Number(m[2]);
        if (suffix <= 0) return 'invalid';
        start = Math.max(size - suffix, 0);
        end = size - 1;
    } else {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (!Number.isFinite(start) || start >= size || end < start) return 'invalid';
    return { offset: start, length: end - start + 1 };
}

function denied(): Response {
    return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function baseHeaders(): Headers {
    return new Headers({
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        'Cross-Origin-Resource-Policy': 'same-site',
    });
}

function contentType(key: string): string {
    const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    return (
        { m3u8: 'application/vnd.apple.mpegurl', ts: 'video/mp2t', m4s: 'video/iso.segment', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', key: 'application/octet-stream' } as Record<string, string>
    )[ext] ?? 'application/octet-stream';
}

/** Root-relative delivery URLs also work when the issuer encoded the entire object key. */
export function rewritePlaylist(text: string, token: string, playlistKey?: string): string {
    const addToken = (uri: string) => {
        if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(uri)) return uri;
        if (playlistKey) {
            const resolved = localUri(uri, playlistKey);
            if (!resolved) return uri;
            resolved.searchParams.set('t', token);
            return `${MEDIA_PATH_PREFIX}${resolved.pathname.slice(1)}${resolved.search}${resolved.hash}`;
        }
        // Kept for callers that only need token rewriting; production always supplies the key.
        const resolved = new URL(uri, 'https://hls.invalid/');
        resolved.searchParams.set('t', token);
        const path = uri.split(/[?#]/)[0];
        return `${path}${resolved.search}${resolved.hash}`;
    };
    return text.split(/\r?\n/).map(line => {
        if (line.trim() === '') return line;
        if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${addToken(uri)}"`);
        return addToken(line.trim());
    }).join('\n');
}

export async function handleMediaDelivery(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new ApiError('METHOD_NOT_ALLOWED', 405, 'Povolen je jen GET a HEAD.');
    }
    if (!env.MEDIA_BUCKET || !env.MEDIA_TOKEN_SECRET || env.MEDIA_TOKEN_SECRET.length < 32) {
        throw new ApiError('MISSING_BINDING', 503, 'Doručování médií není nakonfigurováno.');
    }
    const url = new URL(request.url);
    let key: string;
    try {
        key = decodeURIComponent(url.pathname.slice(MEDIA_PATH_PREFIX.length));
    } catch {
        return denied();
    }
    const token = url.searchParams.get('t') ?? '';
    const verified = await verifyMediaToken(env.MEDIA_TOKEN_SECRET, token);
    // Stejná odpověď pro neplatný token, cizí objekt i neexistující soubor: nedá se zjišťovat, co existuje.
    if (!verified.ok || (!isKeyAllowed(key, verified.payload.k) && !await isPlaylistMember(key, verified.payload.k, env.MEDIA_BUCKET))) {
        log('warn', 'media.denied', { key });
        return denied();
    }

    const head = await env.MEDIA_BUCKET.head(key);
    if (!head) return denied();
    const range = parseRange(request.headers.get('range'), head.size);
    if (range === 'invalid') {
        const h = baseHeaders();
        h.set('Content-Range', `bytes */${head.size}`);
        return new Response(null, { status: 416, headers: h });
    }

    log('info', 'media.deliver', { key, customer: verified.payload.c, product: verified.payload.p, nonce: verified.payload.n, ranged: Boolean(range) });
    const headers = baseHeaders();
    headers.set('Content-Type', contentType(key));

    if (key.endsWith('.m3u8')) {
        const object = await env.MEDIA_BUCKET.get(key);
        if (!object) return denied();
        const body = rewritePlaylist(await object.text(), token, key);
        return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
    }

    const object = await env.MEDIA_BUCKET.get(key, range ? { range } : undefined);
    if (!object) return denied();
    if (range) {
        headers.set('Content-Range', `bytes ${range.offset}-${range.offset + (range.length ?? 0) - 1}/${head.size}`);
        headers.set('Content-Length', String(range.length));
    } else {
        headers.set('Content-Length', String(head.size));
    }
    if (head.httpEtag) headers.set('ETag', head.httpEtag);
    return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
}
