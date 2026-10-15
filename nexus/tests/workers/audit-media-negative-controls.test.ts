import { describe, expect, it } from "vitest";
import { handleMediaDelivery, verifyMediaToken, isKeyAllowed, parseRange, rewritePlaylist } from "../../workers/api/routes/mediaDelivery";

const secret = "synthetic-only-audit-negative-control-secret-2026";
const encoder = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const base = () => ({v:1,c:"customer-A",p:"product-A",k:"paid/course-A/video.mp4",e:Math.floor(Date.now()/1000)+60,n:"nonce-A"});
async function mint(p: Record<string,unknown>, keySecret=secret) {
  const data=b64(encoder.encode(JSON.stringify(p)));
  const key=await crypto.subtle.importKey("raw",encoder.encode(keySecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return data+"."+b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(data))));
}
function fixture() {
  let reads=0;
  const bytes=encoder.encode("SYNTHETIC");
  return {
    env:{MEDIA_TOKEN_SECRET:secret,MEDIA_BUCKET:{
      head:async()=>{reads++;return {size:bytes.length,httpEtag:"synthetic"};},
      get:async()=>{reads++;return {body:bytes,httpEtag:"synthetic"};}
    }} as any,
    reads:()=>reads
  };
}
async function request(token:string,path="paid/course-A/video.mp4") {
  const f=fixture();
  const res=await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/"+path+"?t="+encodeURIComponent(token)),f.env);
  return {res,reads:f.reads()};
}
describe("audit: new independent negative controls (synthetic only)",()=>{
  it("NC-01 malformed token sections denied without bucket read",async()=>{
    for(const t of ["","abc","a.b.c",".abc","abc.","!!.$$"]){const x=await request(t);expect(x.res.status).toBe(403);expect(x.reads).toBe(0);}
  });
  it("NC-02 different HMAC key denied without bucket read",async()=>{
    const x=await request(await mint(base(),"synthetic-other-signing-key-long-enough"));expect(x.res.status).toBe(403);expect(x.reads).toBe(0);
  });
  it("NC-03 expired token denied without bucket read",async()=>{
    const x=await request(await mint({...base(),e:Math.floor(Date.now()/1000)-10}));expect(x.res.status).toBe(403);expect(x.reads).toBe(0);
  });
  it("NC-04 unsupported version denied",async()=>{
    expect((await verifyMediaToken(secret,await mint({...base(),v:2}))).ok).toBe(false);
  });
  it("NC-05 missing object key denied",async()=>{
    expect((await verifyMediaToken(secret,await mint({...base(),k:null}))).ok).toBe(false);
  });
  it("NC-06 foreign course path denied without bucket read",async()=>{
    const x=await request(await mint(base()),"paid/course-B/video.mp4");expect(x.res.status).toBe(403);expect(x.reads).toBe(0);
  });
  it("NC-07 dot path segments rejected",()=>{
    for(const k of ["paid/course-A/../video.mp4","paid/course-A/./video.mp4","paid//course-A/video.mp4"])expect(isKeyAllowed(k,base().k)).toBe(false);
  });
  it("NC-08 invalid range units rejected",()=>{
    for(const r of ["items=0-1","bytes=1-2,3-4","bytes=-0","bytes=10-2"])expect(parseRange(r,8)).toBe("invalid");
  });
  it("NC-09 suffix range stays inside object",()=>{
    expect(parseRange("bytes=-100",8)).toEqual({offset:0,length:8});
  });
  it("NC-10 external HLS URI never receives bearer token",()=>{
    const text=rewritePlaylist("#EXTM3U\nhttps://external.invalid/segment.ts\nsegment.ts","synthetic-token");
    expect(text).toContain("https://external.invalid/segment.ts");
    expect(text).not.toContain("external.invalid/segment.ts?t=");
    expect(text).toContain("segment.ts?t=synthetic-token");
  });
});
