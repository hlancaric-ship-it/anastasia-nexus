// Read-only check of the actual target Store API. Never creates carts/accounts or sends messages.
import {pathToFileURL} from 'node:url';
import {publicBuildConfig} from '../../storefront-prototype/src/lib/build-config.mjs';

export async function checkStore(config, request=fetch){
 const checks=[];
 const record=(id,ok,count=null)=>checks.push({id,status:ok?'PASS':'BLOCKED',count});
 record('stripe_test_configuration', /^pk_test_[A-Za-z0-9_]+$/.test(config.stripePublishableKey||''));
 if(checks[0].status==='BLOCKED')return {status:'BLOCKED',checks};
 const get=async path=>{
  const response=await request(config.apiBaseUrl+path,{method:'GET',redirect:'error',headers:{'x-publishable-api-key':config.publishableKey},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Store API unavailable');
  return response.json();
 };
 try{
  const {region}=await get('/store/regions/'+encodeURIComponent(config.regionId));
  record('eur_region',region?.id===config.regionId&&region?.currency_code==='eur');
 }catch{record('eur_region',false);}
 let products=[];
 try{
  for(let offset=0; ; offset+=50){
   const data=await get('/store/products?region_id='+encodeURIComponent(config.regionId)+'&limit=50&offset='+offset+'&fields=*variants.calculated_price,*categories,+metadata');
   if(!Array.isArray(data.products)||!Number.isSafeInteger(data.count)||data.count<0||data.count>2000)throw Error('Incomplete catalog');
   products.push(...data.products);
   if(products.length>=data.count)break;
   if(!data.products.length||offset>=1950)throw Error('Incomplete catalog');
  }
  if(new Set(products.map(p=>p.id)).size!==products.length)throw Error('Duplicate catalog pages');
  record('catalog',products.length>0,products.length);
  record('priced_variants',products.length>0&&products.every(p=>p.variants?.length&&p.variants.every(v=>Number.isFinite(v.calculated_price?.calculated_amount)&&v.calculated_price.calculated_amount>=0)));
  record('product_photos',products.length>0&&products.every(p=>Boolean(p.thumbnail||p.images?.length)));
  const bookings=products.filter(p=>p.metadata?.booking&&p.metadata.booking.archived!==true);
  const memberships=products.filter(p=>p.metadata?.membership);
  const vouchers=products.filter(p=>p.handle==='darkovy-poukaz'&&p.variants?.length);
  record('booking_offers',bookings.length>0,bookings.length);
  checks.push({id:'membership_offers',status:'OUT_OF_SCOPE',count:memberships.length});
  record('voucher_offers',vouchers.length>0,vouchers.length);
 }catch{record('complete_catalog',false);}
 return {status:checks.every(c=>c.status==='PASS'||c.status==='OUT_OF_SCOPE')?'PASS':'BLOCKED',checks,
  scope:'Read-only catalog prerequisites only; payment, availability, login and private media require separate end-to-end verification.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const config=publicBuildConfig(process.env);
  if(config.offline||!config.stripePublishableKey.startsWith('pk_test_'))throw Error('TEST configuration required');
  const report=await checkStore(config);
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=1;
 }catch{console.error('BLOCKED: provide the four explicit public TEST build settings; no credentials or API responses are logged.');process.exitCode=1;}
}
