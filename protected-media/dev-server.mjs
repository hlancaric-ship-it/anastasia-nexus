// Local-only gateway to the existing private R2 bucket. No public bucket URL or upload route.
import http from 'node:http';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import worker from '../backend/data-private/protected-library/worker.mjs';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {S3Client,HeadObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
if(process.env.S3_BUCKET!=='anastasia-media'||!process.env.S3_ENDPOINT||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY||String(process.env.MEDIA_TOKEN_SECRET||'').length<32)throw Error('Private media configuration is incomplete');
const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'auto',forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});
const missing=e=>e?.$metadata?.httpStatusCode===404||['NoSuchKey','NotFound'].includes(e?.name);
const bucket={
 async head(Key){try{const r=await client.send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET,Key}));return {size:r.ContentLength,httpEtag:r.ETag};}catch(e){if(missing(e))return null;throw e;}},
 async get(Key,options){try{const range=options?.range;const r=await client.send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key,...(range?{Range:`bytes=${range.offset}-${range.length?range.offset+range.length-1:''}`}:{})}));return {get body(){return r.Body.transformToWebStream();},text:()=>r.Body.transformToString('utf8')};}catch(e){if(missing(e))return null;throw e;}},
};
const env={MEDIA_BUCKET:bucket,MEDIA_TOKEN_SECRET:process.env.MEDIA_TOKEN_SECRET,ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS||'http://127.0.0.1:4174,http://localhost:4174'};
const port=Number(process.env.MEDIA_LOCAL_PORT||9191);
const server=http.createServer(async(req,res)=>{
 try{
  // The shared handler already HEADs the object. Avoid opening an unused S3 body on HEAD.
  const requestBucket=req.method==='HEAD'?{...bucket,get:(key,options)=>key.endsWith('.m3u8')?bucket.get(key,options):Promise.resolve({body:null})}:bucket;
  const response=await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers}),{...env,MEDIA_BUCKET:requestBucket});res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body){const stream=Readable.fromWeb(response.body);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);}else res.end();
 }
 catch{if(!res.headersSent)res.writeHead(503,{'Cache-Control':'private, no-store'});res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Private R2 media listening on 127.0.0.1:${port}`));
const close=()=>server.close(()=>{client.destroy();process.exit(0);});process.on('SIGTERM',close);process.on('SIGINT',close);
