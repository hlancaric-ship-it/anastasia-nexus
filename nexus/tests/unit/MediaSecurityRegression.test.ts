import { describe, it, expect } from 'vitest';
import { handleMediaDelivery, rewritePlaylist, verifyMediaToken } from '../../workers/api/routes/mediaDelivery.js';
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const secret = 'synthetic-media-security-key-'.repeat(2);
async function mint(key: string, extra = {}) {
  const body = b64(new TextEncoder().encode(JSON.stringify({ v: 1, c: 'cus_synthetic', p: 'prod_synthetic', k: key, n: 'nonce', e: Math.floor(Date.now()/1000)+600, ...extra })));
  const signing = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', signing, new TextEncoder().encode(body))))}`;
}
function environment(files: Record<string,string>) {
  const reads: string[] = [];
  return { reads, env: { MEDIA_TOKEN_SECRET: secret, MEDIA_BUCKET: {
    head: async (key: string) => files[key] === undefined ? null : { size: files[key].length },
    get: async (key: string) => { reads.push(key); return files[key] === undefined ? null : { body: new Response(files[key]).body, text: async () => files[key] }; },
  }} as any };
}
describe('media security regressions', () => {
  it('denies unlisted paid siblings and resolves listed segments from the encoded issuer URL', async () => {
    const token = await mint('shared/owned.m3u8');
    const {env, reads} = environment({'shared/owned.m3u8':'#EXTM3U\n#EXTINF:6,\nsegment.ts\n', 'shared/segment.ts':'OWNED', 'shared/unpurchased.mp4':'PRIVATE'});
    const url = `https://synthetic.invalid/api/media/v1/shared%2Fowned.m3u8?t=${token}`;
    const playlist = await handleMediaDelivery(new Request(url),env);
    expect(playlist.status).toBe(200);
    const segment = (await playlist.text()).split('\n').find(line=>line && !line.startsWith('#'))!;
    expect(await (await handleMediaDelivery(new Request(new URL(segment,url)),env)).text()).toBe('OWNED');
    expect((await handleMediaDelivery(new Request(`https://synthetic.invalid/api/media/v1/shared/unpurchased.mp4?t=${token}`),env)).status).toBe(403);
    expect(reads).not.toContain('shared/unpurchased.mp4');
  });
  it('follows explicit variant playlists and keys, never the entire directory', async () => {
    const token = await mint('course/master.m3u8');
    const {env} = environment({'course/master.m3u8':'#EXTM3U\nvariant/index.m3u8\n','course/variant/index.m3u8':'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nsegment.m4s\n', 'course/variant/key.bin':'KEY','course/variant/segment.m4s':'SEG','course/variant/other.m4s':'OTHER'});
    for (const [key,status] of [['course/variant/key.bin',200],['course/variant/segment.m4s',200],['course/variant/other.m4s',403]] as const) {
      expect((await handleMediaDelivery(new Request(`https://synthetic.invalid/api/media/v1/${key}?t=${token}`),env)).status).toBe(status);
    }
  });
  it('does not leak bearer tokens to external URLs and preserves query and fragment', () => {
    const text = rewritePlaylist('#EXTM3U\n//evil.invalid/x\nhttps://evil.invalid/x\nseg.ts?x=1#part','TOKEN','course/main.m3u8');
    expect(text).toContain('//evil.invalid/x\nhttps://evil.invalid/x\n');
    expect(text).toContain('/api/media/v1/course/seg.ts?x=1&t=TOKEN#part');
  });
  it('bounds playlist cycles and rejects malformed or excessively long-lived claims', async () => {
    const token=await mint('course/a.m3u8');
    const {env,reads}=environment({'course/a.m3u8':'#EXTM3U\nb.m3u8','course/b.m3u8':'#EXTM3U\na.m3u8'});
    expect((await handleMediaDelivery(new Request(`https://synthetic.invalid/api/media/v1/course/unlisted.mp4?t=${token}`),env)).status).toBe(403);
    expect(reads.length).toBeLessThanOrEqual(2);
    expect((await verifyMediaToken(secret,await mint('x',{c:''}))).ok).toBe(false);
    expect((await verifyMediaToken(secret,await mint('x',{e:Math.floor(Date.now()/1000)+3600}))).ok).toBe(false);
  });
});
