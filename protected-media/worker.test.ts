import { it, expect, describe, vi } from 'vitest'
import worker, { type MediaEnv } from './worker'
import { createHmac } from 'node:crypto'
const secret = 'synthetic-private-media-test-secret-only-40'
const payload = (key: string, overrides = {}) => {
 const body = Buffer.from(JSON.stringify({ v:1,c:'cus_a',p:'prod_a',k:key,e:Math.floor(Date.now()/1000)+60,n:'synthetic-nonce',...overrides })).toString('base64url')
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url')
}
function fixture() {
 const objects: Record<string,string> = {'paid/a.mp3':'0123456789','paid/book.pdf':'%PDF-1.4 private','paid/other.mp3':'other'}
 const bucket = {head:vi.fn(async(k:string)=>objects[k]===undefined?null:{size:objects[k].length,httpEtag:'"synthetic"'}),get:vi.fn(async(k:string,options?:any)=>objects[k]===undefined?null:{body:options?.range?objects[k].slice(options.range.offset,options.range.offset+options.range.length):objects[k],text:async()=>objects[k]})}
 return {bucket,env:{MEDIA_BUCKET:bucket,MEDIA_TOKEN_SECRET:secret,ALLOWED_ORIGINS:'https://shop.example.test'} as MediaEnv}
}
const request = (key:string,token=payload(key),extra:RequestInit={}) => new Request('https://media.example.test/api/media/v1/'+encodeURIComponent(key)+'?t='+token,extra)
const play=(extra:Record<string,string>={}):RequestInit=>({headers:{Origin:'https://shop.example.test','Sec-Fetch-Dest':'video',...extra}})
describe('private R2 gateway',()=>{
 it('serves only a signed exact object, privately and without public bucket URLs',async()=>{
  const f=fixture(),r=await worker.fetch(request('paid/a.mp3',undefined,play()),f.env)
  expect(r.status).toBe(200);expect(await r.text()).toBe('0123456789');expect(r.headers.get('cache-control')).toBe('private, no-store')
 })
 it('supports ranged media reads and HEAD without returning the body',async()=>{
  const f=fixture(),r=await worker.fetch(request('paid/a.mp3',undefined,play({Range:'bytes=2-4'})),f.env)
  expect(r.status).toBe(206);expect(await r.text()).toBe('234');expect(r.headers.get('content-range')).toBe('bytes 2-4/10')
  const head=await worker.fetch(request('paid/book.pdf',undefined,{method:'HEAD'}),f.env);expect(head.headers.get('content-type')).toBe('application/pdf');expect(await head.text()).toBe('')
 })
 it.each(['bad',payload('paid/a.mp3',{e:Math.floor(Date.now()/1000)-1}),payload('paid/other.mp3')])('denies invalid, expired and different-object tokens',async token=>{
  const f=fixture();expect((await worker.fetch(request('paid/a.mp3',token),f.env)).status).toBe(403);expect(f.bucket.head).not.toHaveBeenCalled()
 })
 it('does not reveal missing objects',async()=>{expect((await worker.fetch(request('paid/missing.mp3'),fixture().env)).status).toBe(403)})
 it('allows only configured CORS origins, including ranged preflights',async()=>{
  const f=fixture();const good=await worker.fetch(request('paid/a.mp3',undefined,{headers:{Origin:'https://shop.example.test'}}),f.env)
  expect(good.headers.get('access-control-allow-origin')).toBe('https://shop.example.test')
  expect((await worker.fetch(request('paid/a.mp3',undefined,{headers:{Origin:'https://evil.example.test'}}),f.env)).status).toBe(403)
  const preflight=await worker.fetch(request('paid/a.mp3','',{method:'OPTIONS',headers:{Origin:'https://shop.example.test'}}),f.env);expect(preflight.status).toBe(204);expect(preflight.headers.get('access-control-allow-headers')).toBe('Range')
 })
 it('fails closed without the bucket and has no public list or upload routes',async()=>{
  expect((await worker.fetch(request('paid/a.mp3',undefined,play()),{ALLOWED_ORIGINS:'https://shop.example.test'})).status).toBe(503)
  expect((await worker.fetch(new Request('https://media.example.test/'),fixture().env)).status).toBe(404)
  expect((await worker.fetch(request('paid/a.mp3',undefined,{method:'PUT',...play()}),fixture().env)).status).toBe(405)
 })
 it('refuses direct opening, Save as and download managers for audio/video',async()=>{
  const f=fixture()
  expect((await worker.fetch(request('paid/a.mp3'),f.env)).status).toBe(403)
  expect((await worker.fetch(request('paid/a.mp3',undefined,{headers:{Origin:'https://shop.example.test','Sec-Fetch-Dest':'document'}}),f.env)).status).toBe(403)
  const ok=await worker.fetch(request('paid/a.mp3',undefined,play({'Sec-Fetch-Dest':'audio'})),f.env);expect(ok.status).toBe(200);expect(ok.headers.get('content-disposition')).toBe('inline')
  expect((await worker.fetch(request('paid/book.pdf'),f.env)).status).toBe(200)
 })
 it('reads the private bucket first so a same-key object in the main bucket cannot shadow protected content',async()=>{
  const f=fixture()
  const main={head:vi.fn(async()=>({size:6,httpEtag:'"main"'})),get:vi.fn(async()=>({body:'public',text:async()=>'public'}))}
  const env={...f.env,MEDIA_BUCKET:main,MEDIA_BUCKET_PROTECTED:f.bucket} as unknown as MediaEnv
  const r=await worker.fetch(request('paid/book.pdf'),env)
  expect(r.status).toBe(200);expect(await r.text()).toBe('%PDF-1.4 private');expect(main.get).not.toHaveBeenCalled()
 })
 it('sends HSTS on every response and a sandboxing CSP on media (not on PDFs, which Chrome would block)',async()=>{
  for(const r of [await worker.fetch(request('paid/a.mp3',undefined,play()),fixture().env),await worker.fetch(request('paid/a.mp3','bad'),fixture().env)]){
   expect(r.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
  }
  expect((await worker.fetch(request('paid/a.mp3',undefined,play()),fixture().env)).headers.get('content-security-policy')).toContain('sandbox')
  expect((await worker.fetch(request('paid/book.pdf'),fixture().env)).headers.get('content-security-policy')).toBeNull()
 })
})
