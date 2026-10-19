import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(process.env.CI!=='true')throw Error('CI-only synthetic membership Worker bridge');
const root=resolve(process.argv[2]);
const {default:worker}=await import(pathToFileURL(join(root,'worker.mjs')).href);
let blocked=false;
const bindings={ENVIRONMENT:'test',HMAC_SECRET:'synthetic-membership-hmac',MEDUSA_PRICING_API_KEY:'synthetic-membership-service',MEDUSA_PRICING_TENANT_ID:'anastasia',MEDUSA_PRICING_POLICY_JSON:JSON.stringify({loyaltyTiers:{},brandLimits:{},categoryLimits:{},brandSaleDiscounts:{}}),DB:{prepare(){throw Error('Unexpected voucher DB access')}}};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  if(req.url==='/synthetic-control'){blocked=JSON.parse(body).blocked;res.writeHead(200);res.end('{}');return}
  let response;
  if(blocked&&req.url.startsWith('/api/nexus/safeorder'))response=new Response('{}',{status:503});
  else response=await worker.fetch(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,body:req.method==='GET'?undefined:body}),bindings,{waitUntil(){}});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch{res.writeHead(500);res.end('{}')}
});
server.listen(0,'127.0.0.1',()=>writeFileSync(join(root,'ready.json'),JSON.stringify({port:server.address().port})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0))});
