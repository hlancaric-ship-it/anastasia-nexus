import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { asValue } from '@medusajs/framework/awilix'
import { ContainerRegistrationKeys,Modules } from '@medusajs/framework/utils'
import { createProductsWorkflow,updateRegionsWorkflow } from '@medusajs/medusa/core-flows'
import bootstrap,{API_KEY_TITLE,SALES_CHANNEL_NAME,DIGITAL_PROFILE_NAME} from '../../src/scripts/anastasia-bootstrap'
import { syntheticBuyer,associateCart } from './customer-fixtures'
import { acceptCheckoutConsent } from './legal-fixtures'
import { syntheticMembershipStripe } from './membership-stripe-fixture'
import { reconcileMembershipAccess } from '../../src/lib/membership/access'
import { orderDedupeKey } from '../../src/modules/entitlement/policy'
if(process.env.CI!=='true'||process.env.DB_USERNAME!=='membership_synthetic'||process.env.DB_HOST!=='localhost'||process.env.DB_TEMP_NAME!=='anastasia_membership_e2e_ci')throw new Error('Run only in isolated membership checkout E2E CI')
const pricing=process.env.NEXUS_PRICING_URL,safeorder=process.env.NEXUS_SAFEORDER_URL
if(!pricing?.startsWith('http://127.0.0.1:')||!safeorder?.startsWith('http://127.0.0.1:'))throw new Error('Synthetic real Worker bridge required')
if(process.env.NEXUS_PRICING_API_KEY!=='synthetic-membership-service')throw new Error('Synthetic Worker service credential required')
const workerOrigin=new URL(pricing).origin
if(new URL(safeorder).origin!==workerOrigin)throw new Error('Synthetic Worker origin mismatch')
const providerId='pp_membership_stripe_membership'
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return(listen as any).apply(this,args)} as any
jest.setTimeout(600_000)
medusaIntegrationTestRunner({dbName:'anastasia_membership_e2e_ci',hooks:{beforeServerStart:async container=>{
 const config=container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as any
 config.modules.membership={resolve:'./src/modules/membership'}
 const current=config.modules[Modules.PAYMENT]??{resolve:'@medusajs/medusa/payment',options:{}}
 config.modules[Modules.PAYMENT]={...current,options:{...current.options,providers:[...(current.options?.providers??[]).filter((provider:any)=>provider.id!=='membership'),{resolve:'./src/modules/membership-stripe',id:'membership',options:{apiKey:'sk_test_synthetic_membership_only',webhookSecret:'whsec_synthetic_membership_only',capture:true}}]}}
}},testSuite:({api,getContainer})=>{
 afterAll(()=>{Server.prototype.listen=listen})
 it('one native checkout ledger enforces SafeOrder before capture and supports renewal, replay, ownership, stopping and refunds',async()=>{
  const container=getContainer(),payment=container.resolve(Modules.PAYMENT) as any,query=container.resolve(ContainerRegistrationKeys.QUERY) as any
  const stripe=syntheticMembershipStripe()
  payment.paymentProviderService_.retrieveProvider(providerId).stripe_=stripe.sdk
  const logger=container.resolve(ContainerRegistrationKeys.LOGGER)
  container.register({[ContainerRegistrationKeys.LOGGER]:asValue({info(){},warn(){},error(){},debug(){},log(){}})})
  try{await bootstrap({container})}finally{container.register({[ContainerRegistrationKeys.LOGGER]:asValue(logger)})}
  const one=async(entity:string,filters:any,fields:string[])=>{const {data}=await query.graph({entity,filters,fields});expect(data).toHaveLength(1);return data[0]}
  const key=await one('api_key',{title:API_KEY_TITLE},['token']),channel=await one('sales_channel',{name:SALES_CHANNEL_NAME},['id']),profile=await one('shipping_profile',{name:DIGITAL_PROFILE_NAME},['id']),region=await one('region',{name:'Slovensko'},['id','payment_providers.id'])
  await updateRegionsWorkflow(container).run({input:{selector:{id:region.id},update:{payment_providers:[...new Set([...region.payment_providers.map((p:any)=>p.id),providerId])]}}})
  const {result:products}=await createProductsWorkflow(container).run({input:{products:[{title:'Synthetic membership E2E',handle:'synthetic-membership-e2e',status:'published',shipping_profile_id:profile.id,metadata:{membership:{version:'v1',period_days:30}},sales_channels:[{id:channel.id}],options:[{title:'Default',values:['Default']}],variants:[{title:'Default',sku:'SYNTHETIC-MEMBERSHIP-E2E',manage_inventory:false,options:{Default:'Default'},prices:[{amount:50,currency_code:'eur'}]}]}]}})
  const product=products[0],variant=product.variants[0]
  const options={headers:{'x-publishable-api-key':key.token},validateStatus:()=>true}
  const buyer=await syntheticBuyer(container,options,'membership-e2e@example.test'),other=await syntheticBuyer(container,options,'membership-foreign@example.test')
  const post=async(path:string,body:any,auth=buyer.options)=>{const result=await api.post(path,body,auth);expect({path,status:result.status,error:result.data.error}).toEqual({path,status:200,error:undefined});return result.data}
  const control=async(blocked:boolean)=>{const result=await fetch(`${workerOrigin}/synthetic-control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocked})});expect(result.status).toBe(200)}
  const knex=container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const orderCount=async()=>Number((await knex('order').count('* as n').first()).n)
  const cartData=await post('/store/carts',{region_id:region.id,email:'membership-e2e@example.test',shipping_address:{first_name:'Synthetic',last_name:'Test',address_1:'Synthetic 1',city:'Bratislava',postal_code:'81101',country_code:'sk'}})
  const cartId=cartData.cart.id
  await associateCart(api,cartId,buyer.options)
  await acceptCheckoutConsent(api,cartId,buyer.options)
  await post(`/store/carts/${cartId}/line-items`,{variant_id:variant.id,quantity:1})
  await post('/store/nexus-cart',{cart_id:cartId})
  const offerResponse=await api.get(`/store/memberships/offer?cart_id=${cartId}`,buyer.options)
  expect(offerResponse.status).toBe(200)
  const offer=offerResponse.data.offer
  expect(offer).toMatchObject({product_id:product.id,variant_id:variant.id,version:'v1',period_days:30,amount_minor:5000,currency:'eur'})
  const prepared=await post('/store/memberships/checkout',{cart_id:cartId,version:offer.version,amount_minor:offer.amount_minor,auto_renew:true})
  const checkoutId=prepared.checkout.id
  const foreignPrepare=await api.post('/store/memberships/checkout',{cart_id:cartId,version:'v1',amount_minor:5000,auto_renew:true},other.options)
  expect(foreignPrepare.status).toBeGreaterThanOrEqual(400)
  const foreignSession=await api.post(`/store/memberships/checkouts/${checkoutId}/payment-session`,{},other.options)
  expect(foreignSession.status).toBeGreaterThanOrEqual(400)
  const session=await post(`/store/memberships/checkouts/${checkoutId}/payment-session`,{})
  const replaySession=await post(`/store/memberships/checkouts/${checkoutId}/payment-session`,{})
  expect(replaySession.payment_session.id).toBe(session.payment_session.id)
  expect(stripe.stats()).toMatchObject({intents:1,captures:0})
  const nativeSession=await payment.retrievePaymentSession(session.payment_session.id)
  stripe.clientConfirm(nativeSession.data.id)
  expect(stripe.intent(nativeSession.data.id).status).toBe('requires_capture')
  await control(true)
  const denied=await api.post('/store/nexus-checkout',{cart_id:cartId},buyer.options)
  expect(denied.status).toBe(503);expect(denied.data.error).toBe('SAFEORDER_UNAVAILABLE')
  expect(await orderCount()).toBe(0);expect(stripe.stats().captures).toBe(0)
  await control(false)
  const completed=await post('/store/nexus-checkout',{cart_id:cartId})
  expect(await orderCount()).toBe(1);expect(stripe.stats()).toMatchObject({intents:1,captures:1})
  const settled=await post(`/store/memberships/checkouts/${checkoutId}/settle`,{})
  expect(settled).toMatchObject({status:'SETTLED',access:{status:'ACTIVE'},mandate:{status:'SAVED'}})
  const memberId=settled.membership_id,service=container.resolve('membership') as any
  const initial=await service.findForCustomer(memberId,buyer.customer.id)
  expect(initial.last_order_id).toBe(completed.order.id)
  const list=await api.get('/store/memberships',buyer.options),foreignList=await api.get('/store/memberships',other.options)
  expect(list.status).toBe(200);expect(list.data.memberships.map((m:any)=>m.id)).toContain(memberId)
  expect(foreignList.status).toBe(200);expect(foreignList.data.memberships).toEqual([])
  expect((await api.post(`/store/memberships/checkouts/${checkoutId}/settle`,{},other.options)).status).toBeGreaterThanOrEqual(400)
  expect((await post(`/store/memberships/checkouts/${checkoutId}/settle`,{})).membership_id).toBe(memberId)
  expect(stripe.stats()).toMatchObject({intents:1,captures:1});expect(await orderCount()).toBe(1)
  expect(await service.listMembershipMandates({membership_id:memberId})).toHaveLength(1)
  // Explicit synthetic time fixture: move BOTH durable projections to a due period, not a wall-clock/calendar-month claim.
  const due=new Date(Date.now()-60_000).toISOString(),dueState={...initial,period_end:due}
  await service.updateMemberships({id:memberId,period_end:new Date(due),snapshot:dueState})
  const {runMembershipBilling}=require('../../src/lib/membership/billing') as {runMembershipBilling:(scope:any,id:string)=>Promise<any>}
  const renewed=await runMembershipBilling(container,memberId)
  expect(renewed).toMatchObject({status:'SETTLED',access:{status:'ACTIVE'}})
  expect(await orderCount()).toBe(2);expect(stripe.stats()).toMatchObject({intents:2,captures:2})
  let current=await service.findForCustomer(memberId,buyer.customer.id)
  expect(current.last_order_id).not.toBe(initial.last_order_id)
  expect(await service.listMembershipReceipts({membership_id:memberId})).toHaveLength(2)
  expect((await runMembershipBilling(container,memberId)).status).toBe('NOT_DUE')
  expect(stripe.stats()).toMatchObject({intents:2,captures:2});expect(await orderCount()).toBe(2)
  // The bank asks for 3DS on an existing third intent; continuation must not create another intent.
  // A new cycle needs its own period end: renewal keys are idempotent per period, so reusing `due` replays cycle 2.
  const due3=new Date(Date.now()-30_000).toISOString()
  await service.updateMemberships({id:memberId,period_end:new Date(due3),snapshot:{...current,period_end:due3}})
  stripe.requireNextAction()
  expect((await runMembershipBilling(container,memberId)).status).toBe('NEEDS_ACTION')
  expect(stripe.stats()).toMatchObject({intents:3,captures:2})
  expect((await api.get(`/store/memberships/${memberId}/payment`,other.options)).status).toBeGreaterThanOrEqual(400)
  const challenge=await api.get(`/store/memberships/${memberId}/payment`,buyer.options)
  expect(challenge.status).toBe(200)
  expect(challenge.data.client_secret).toMatch(/^pi_.*_secret_/)
  stripe.clientConfirm(challenge.data.client_secret.split('_secret_')[0])
  expect(await post(`/store/memberships/${memberId}/reconcile`,{})).toMatchObject({status:'SETTLED'})
  expect(stripe.stats()).toMatchObject({intents:3,captures:3})
  expect(await orderCount()).toBe(3)
  current=await service.findForCustomer(memberId,buyer.customer.id)
  expect((await api.post(`/store/memberships/${memberId}/stop`,{},other.options)).status).toBeGreaterThanOrEqual(400)
  await post(`/store/memberships/${memberId}/stop`,{})
  const stopped=await service.findForCustomer(memberId,buyer.customer.id)
  await service.updateMemberships({id:memberId,period_end:new Date(due),snapshot:{...stopped,period_end:due}})
  expect((await runMembershipBilling(container,memberId)).status).toBe('NOT_DUE')
  expect(stripe.stats()).toMatchObject({intents:3,captures:3});expect(await orderCount()).toBe(3)
  // Restore paid-period projection for native refund lifecycle checks; no new charge is initiated.
  await service.updateMemberships({id:memberId,period_end:new Date(current.period_end),snapshot:{...current,renew:false}})
  const latest=await one('order',{id:current.last_order_id},['id','payment_collections.payments.id'])
  const paymentId=latest.payment_collections[0].payments[0].id
  const entitlement=container.resolve('entitlement') as any,keyRight=orderDedupeKey(current.last_order_id,product.id)
  const right=await entitlement.findByDedupeKey(keyRight)
  await payment.refundPayment({payment_id:paymentId,amount:5})
  expect((await reconcileMembershipAccess(container,memberId)).status).toBe('NEEDS_REVIEW')
  expect((await entitlement.retrieveEntitlement(right.id)).status).toBe('active')
  await payment.refundPayment({payment_id:paymentId,amount:45})
  expect((await reconcileMembershipAccess(container,memberId)).status).toBe('REVOKED')
  expect((await entitlement.retrieveEntitlement(right.id)).status).toBe('revoked')
  expect(stripe.stats()).toEqual({intents:3,captures:3,refunds:2})
  expect(await orderCount()).toBe(3)
 })
}})
