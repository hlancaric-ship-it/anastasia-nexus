import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { asValue } from '@medusajs/framework/awilix'
import { ContainerRegistrationKeys, Modules, generateJwtToken } from '@medusajs/framework/utils'
import { createProductsWorkflow } from '@medusajs/medusa/core-flows'
import bootstrap, { API_KEY_TITLE, SALES_CHANNEL_NAME, DIGITAL_PROFILE_NAME } from '../../src/scripts/anastasia-bootstrap'
import { verifyQrBrowser } from '../../scripts/qr-browser'
import { syntheticBuyer, associateCart } from './customer-fixtures'

if(process.env.CI!=='true'||process.env.DB_USERNAME!=='qr_synthetic'||process.env.DB_HOST!=='localhost'||process.env.DB_TEMP_NAME!=='anastasia_qr_ci')throw Error('Use the isolated QR CI workflow only')
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return (listen as any).apply(this,args)} as any
jest.setTimeout(180000)
medusaIntegrationTestRunner({dbName:'anastasia_qr_ci',testSuite:({api,getContainer,dbConnection})=>{
 afterAll(()=>{Server.prototype.listen=listen})
 it('persists new/legacy QR, redownloads without reissuing discounts, and applies both through actual NEXUS pricing',async()=>{
  const container=getContainer(),logger=container.resolve(ContainerRegistrationKeys.LOGGER)
  container.register({[ContainerRegistrationKeys.LOGGER]:asValue({info(){},warn(){},error(){},debug(){},log(){}})})
  try{await bootstrap({container})}finally{container.register({[ContainerRegistrationKeys.LOGGER]:asValue(logger)})}
  const query=container.resolve(ContainerRegistrationKeys.QUERY)
  const entity=async(entity:string,filters:any,fields:string[])=>(await query.graph({entity,filters,fields})).data[0] as any
  const key=await entity('api_key',{title:API_KEY_TITLE},['token'])
  const channel=await entity('sales_channel',{name:SALES_CHANNEL_NAME},['id'])
  const profile=await entity('shipping_profile',{name:DIGITAL_PROFILE_NAME},['id'])
  const region=await entity('region',{name:'Slovensko'},['id'])
  const store={validateStatus:()=>true,headers:{'x-publishable-api-key':key.token}}
  const buyer=await syntheticBuyer(container,store,'qr-buyer@example.test')
  const [user]=await container.resolve(Modules.USER).createUsers([{email:'qr-admin@example.test'}])
  const admin={validateStatus:()=>true,headers:{Authorization:`Bearer ${generateJwtToken({actor_id:user.id,actor_type:'user',auth_identity_id:'qr-synthetic',app_metadata:{user_id:user.id}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}}
  const {result:[product]}=await createProductsWorkflow(container).run({input:{products:[{title:'Synthetic QR product',handle:'synthetic-qr',status:'published',shipping_profile_id:profile.id,sales_channels:[{id:channel.id}],options:[{title:'Default',values:['Default']}],variants:[{title:'Default',sku:'QR-SYNTHETIC',manage_inventory:false,options:{Default:'Default'},prices:[{amount:50,currency_code:'eur'}]}]}]}})
  const promotions=container.resolve(Modules.PROMOTION)
  const promo=await promotions.createPromotions({code:'QR-SYNTHETIC10',type:'standard',status:'active',limit:20,application_method:{type:'percentage',value:10,target_type:'items',allocation:'across'}})
  // Existing native usage must survive QR creation, import and repeated download.
  for(let i=0;i<3;i++)await promotions.registerUsage([{code:promo.code!,amount:5}],{customer_id:null,customer_email:null})
  expect((await promotions.retrievePromotion(promo.id)).used).toBe(3)
  const input={produkt:'QR-SYNTHETIC',kupon:'QR-SYNTHETIC10',ks:1,format:'svg'}
  expect((await api.get('/admin/coupon-links',{validateStatus:()=>true})).status).toBe(401)
  expect((await api.get('/admin/coupon-links',buyer.options)).status).toBe(401)
  const concurrent=await Promise.all(Array.from({length:4},()=>api.post('/admin/coupon-links',input,admin)))
  expect(concurrent.map(r=>r.status)).toEqual([200,200,200,200])
  expect(concurrent.filter(r=>r.data.created)).toHaveLength(1)
  const generated=concurrent[0].data.record
  expect(new Set(concurrent.map(r=>r.data.record.id)).size).toBe(1)
  expect((await api.get('/admin/coupon-links',admin)).data.count).toBe(1)
  expect(await (container.resolve('coupon_link') as any).retrieveCouponLinkRecord(generated.id)).toMatchObject({url:generated.url,source:'generated'})
  const legacy='https://old.example/eshop/kosik?kupon=QR-SYNTHETIC10&produkt=QR-SYNTHETIC&ks=1'
  const importBody={links:[{url:legacy}]}
  const preview=await api.post('/admin/coupon-links/import',importBody,admin)
  expect(preview.status).toBe(200);expect(preview.data).toMatchObject({dry_run:true,created:1})
  expect((await api.get('/admin/coupon-links',admin)).data.count).toBe(1)
  const imported=await Promise.all([1,2].map(()=>api.post('/admin/coupon-links/import',{...importBody,dry_run:false},admin)))
  expect(imported.map(r=>r.status)).toEqual([200,200]);expect(imported.reduce((n,r)=>n+r.data.created,0)).toBe(1)
  const listed=await api.get('/admin/coupon-links?limit=1&offset=0',admin)
  expect(listed.data.count).toBe(2);expect(listed.data.links).toHaveLength(1)
  const all=(await api.get('/admin/coupon-links',admin)).data.links
  const old=all.find((r:any)=>r.source==='legacy');expect(old.issued_at).toBeNull()
  // A fresh ORM service read and independent SQL query see persisted records, not browser/local memory.
  expect(Number((await dbConnection.raw('select count(*) as count from coupon_link_record')).rows[0].count)).toBe(2)
  const origin=process.env.COUPON_LINK_STOREFRONT_ORIGIN
  process.env.COUPON_LINK_STOREFRONT_ORIGIN='https://changed.example'
  try{
   const qr=await api.get(`/admin/coupon-links/${old.id}/qr?format=png`,admin)
   expect(qr.status).toBe(200);expect(qr.data.url).toBe(legacy)
   expect(Buffer.from(qr.data.qr.base64,'base64').subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a')
  }finally{process.env.COUPON_LINK_STOREFRONT_ORIGIN=origin}
  const tenant=process.env.NEXUS_TENANT_ID
  process.env.NEXUS_TENANT_ID='another-synthetic-tenant'
  try{expect((await api.get(`/admin/coupon-links/${old.id}`,admin)).status).toBe(404);expect((await api.get('/admin/coupon-links',admin)).data.count).toBe(0)}finally{process.env.NEXUS_TENANT_ID=tenant}
  for(const url of [generated.url,legacy]){
   const p=new URL(url).searchParams
   const preflight=await api.post('/store/coupon-links',{produkt:p.get('produkt'),kupon:p.get('kupon'),ks:Number(p.get('ks'))},store)
   expect(preflight.status).toBe(200);expect(preflight.data.code_valid).toBe(true)
   const cart=await api.post('/store/carts',{region_id:region.id,email:buyer.customer.email},buyer.options)
   expect(cart.status).toBe(200);const id=cart.data.cart.id
   await associateCart(api,id,buyer.options)
   expect((await api.post(`/store/carts/${id}/line-items`,{variant_id:product.variants[0].id,quantity:1},store)).status).toBe(200)
   const priced=await api.post('/store/nexus-cart',{cart_id:id,couponCode:p.get('kupon')},buyer.options)
   expect(priced.status).toBe(200)
   const persisted=await entity('cart',{id},['id','items.unit_price','metadata'])
   expect(Number(persisted.items[0].unit_price)).toBe(45)
  }
  expect((await promotions.retrievePromotion(promo.id)).used).toBe(3)
  expect(await verifyQrBrowser(api,admin,buyer.options,region.id)).toMatchObject({status:'PASS',widths:[1440,390]})
  const wrong=await api.post(`/admin/coupon-links/${old.id}/deactivate`,{confirmation:'WRONG'},admin)
  expect(wrong.status).toBe(409);expect((await promotions.retrievePromotion(promo.id)).status).toBe('active')
  expect((await api.post(`/admin/coupon-links/${old.id}/deactivate`,{confirmation:input.kupon},admin)).status).toBe(200)
  expect((await promotions.retrievePromotion(promo.id)).status).toBe('inactive')
  expect((await api.post('/admin/coupon-links',input,admin)).status).toBe(422)
  expect((await api.get(`/admin/coupon-links/${old.id}/qr`,admin)).status).toBe(200)
  expect((await api.post('/store/coupon-links',{produkt:input.produkt,kupon:input.kupon,ks:1},store)).data.code_valid).toBe(false)
  expect((await promotions.retrievePromotion(promo.id)).used).toBe(3)
  expect((await api.post('/admin/coupon-links/import',{...importBody,dry_run:false},admin)).data).toMatchObject({created:0,existing:1})
 })
}})
