import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../edge/worker.mjs';
const html='<html><head><meta name="ana-country" content=""></head></html>';
const env=(body=html,type='text/html; charset=utf-8',status=200)=>({API_ORIGIN:'https://api.test',ASSETS:{fetch:async()=>new Response(body,{status,headers:{'content-type':type,etag:'"e1"'}})}});
test('country meta accepts only a two-letter code (spoofed header cannot inject HTML)',async()=>{
 const evil=await worker.fetch(new Request('https://shop.test/',{headers:{'CF-IPCountry':'"><script>alert(1)</script>'}}),env());
 const text=await evil.text();assert.doesNotMatch(text,/<script>/);assert.match(text,/content=""/);
 const ok=await worker.fetch(new Request('https://shop.test/',{headers:{'CF-IPCountry':'ru'}}),env());
 assert.match(await ok.text(),/content="RU"/);assert.equal(ok.headers.get('strict-transport-security'),'max-age=31536000; includeSubDomains');
});
test('media range: 206 slice is not publicly cacheable, errors are not cached, HSTS everywhere',async()=>{
 const r=await worker.fetch(new Request('https://shop.test/media/a.mp4',{headers:{Range:'bytes=2-4'}}),env('0123456789','video/mp4'));
 assert.equal(r.status,206);assert.equal(await r.text(),'234');assert.equal(r.headers.get('content-range'),'bytes 2-4/10');
 assert.doesNotMatch(r.headers.get('cache-control'),/public/);assert.equal(r.headers.get('etag'),null);
 const bad=await worker.fetch(new Request('https://shop.test/media/a.mp4',{headers:{Range:'bytes=50-60'}}),env('0123456789','video/mp4'));
 assert.equal(bad.status,416);assert.equal(bad.headers.get('cache-control'),'no-store');
 const missing=await worker.fetch(new Request('https://shop.test/media/x.mp4'),env('nf','text/plain',404));
 assert.equal(missing.status,404);assert.equal(missing.headers.get('cache-control'),'no-store');assert.ok(missing.headers.get('strict-transport-security'));
 const full=await worker.fetch(new Request('https://shop.test/media/a.mp4'),env('0123456789','video/mp4'));
 assert.equal(full.headers.get('cache-control'),'public, max-age=86400');
});
test('backend media proxy does not keep backend errors at the edge and rejects traversal',async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push(init);return new Response('x',{status:500})};
 const r=await worker.fetch(new Request('https://shop.test/backend-media/static/a.jpg'),env());
 assert.equal(r.status,502);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.deepEqual(calls[0].cf.cacheTtlByStatus,{'200-299':86400,'404':60,'500-599':0});
 assert.equal((await worker.fetch(new Request('https://shop.test/backend-media/static/..%2Fadmin.jpg'),env())).status,404);
});
