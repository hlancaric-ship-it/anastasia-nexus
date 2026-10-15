import { describe, expect, it } from "vitest";
import { handleMediaDelivery } from "../../workers/api/routes/mediaDelivery";

const secret = "synthetic-only-redteam-HLS-media-key-longer-than-32";
const enc = new TextEncoder();
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function token(key: string) {
  const body = b64(enc.encode(JSON.stringify({v:1,c:"synthetic-A",p:"product-A",k:key,e:Math.floor(Date.now()/1000)+600,n:"fixture"})));
  const k = await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return body+"."+b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(body))));
}
describe("redteam: HLS signed token sibling-object scope", () => {
  it("measures if playlist-scoped bearer token fetches an unlisted sibling object", async () => {
    const playlist="paid/course-a/index.m3u8";
    const other="paid/course-a/unlisted-bonus.mp4";
    const signed=await token(playlist);
    const requested:string[]=[];
    const payload=enc.encode("SYNTHETIC_UNLISTED_BONUS_FILE");
    const env={MEDIA_TOKEN_SECRET:secret,MEDIA_BUCKET:{
      head:async (key:string)=>{requested.push("HEAD "+key);return {size:payload.length}},
      get:async (key:string)=>{requested.push("GET "+key);return {body:payload,httpEtag:"synthetic"}}
    }} as any;
    const response=await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/"+other+"?t="+signed),env);
    const body=await response.text();
    expect(response.status).toBe(200);
    expect(body).toBe("SYNTHETIC_UNLISTED_BONUS_FILE");
    expect(requested).toEqual(["HEAD "+other,"GET "+other]);
    // This is an observed property of the HLS directory allowlist, not
    // proof that a real paid sibling is stored in the same R2 prefix.
  });
  it("does not allow the same playlist token outside its directory", async () => {
    const signed=await token("paid/course-a/index.m3u8");
    let reads=0;
    const env={MEDIA_TOKEN_SECRET:secret,MEDIA_BUCKET:{head:async()=>{reads++;return null},get:async()=>{reads++;return null}}} as any;
    const response=await handleMediaDelivery(new Request("https://synthetic.invalid/api/media/v1/paid/course-b/video.mp4?t="+signed),env);
    expect(response.status).toBe(403);
    expect(reads).toBe(0);
  });
});
