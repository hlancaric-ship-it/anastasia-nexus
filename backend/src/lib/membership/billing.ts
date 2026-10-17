import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { createCartWorkflow,createPaymentCollectionForCartWorkflow,completeCartWorkflow } from '@medusajs/medusa/core-flows'
import { MEMBERSHIP_MODULE } from '../../modules/membership'
import type MembershipModuleService from '../../modules/membership/service'
import { repriceCart } from '../../api/store/nexus-cart/route'
import { isCurrentConsent } from '../../modules/legal/policy'
import { loadNativeMembershipReceipt,euroMinor } from './native-receipt'
import { reconcileMembershipAccess } from './access'
import { MEMBERSHIP_STRIPE_PROVIDER } from './billing-guard'
import { saveMembershipMandate } from './billing-mandate'
const address=(v:any)=>v?Object.fromEntries(['first_name','last_name','company','address_1','address_2','city','country_code','province','postal_code','phone'].filter(k=>typeof v[k]==='string').map(k=>[k,v[k]])):undefined
/** Every provider effect follows a durable fence. Unknown never creates a second payment. */
export async function runMembershipBilling(scope:any,membershipId:string,now=new Date()){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 let attempt=await service.reserveBilling(membershipId,now.toISOString())
 if(!attempt)return {status:'NOT_DUE'}
 if(['settled','review'].includes(attempt.stage))return {status:attempt.stage.toUpperCase()}
 const terms=(attempt.snapshot as any).terms,query=scope.resolve(ContainerRegistrationKeys.QUERY)
 const review=async()=>{attempt=await service.advanceBilling(attempt!.id,attempt!.stage,'review');await service.reviewBillingMembership(membershipId);return {status:'REVIEW'}}
 const settle=async()=>{
  if(!attempt!.cart_id)return null
  const {data:orders}=await query.graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{cart_id:attempt!.cart_id}})
  if(orders.length>1)throw new Error('MEMBERSHIP_NATIVE_ORDER_AMBIGUOUS')
  if(!orders.length)return null
  const orderId=orders[0].order_id
  const receipt=await loadNativeMembershipReceipt(scope,orderId,{cart_id:attempt!.cart_id!,customer_id:terms.customer_id,product_id:terms.product_id,variant_id:terms.variant_id,checkout_key:attempt!.renewal_key},now)
  await service.applyReceipt(membershipId,receipt,now.toISOString())
  attempt=await service.advanceBilling(attempt!.id,attempt!.stage,'settled',{order_id:orderId})
  return {status:'SETTLED',membership_id:membershipId,access:await reconcileMembershipAccess(scope,membershipId,now)}
 }
 if(['unknown','completing'].includes(attempt.stage)){const result=await settle();return result||{status:'RECONCILIATION_REQUIRED'}}
 if(['cart_requested','payment_requested'].includes(attempt.stage))return {status:'RECONCILIATION_REQUIRED'}
 const [mandate]=await service.listMembershipMandates({id:(attempt.snapshot as any).mandate_id,membership_id:membershipId},{take:1})
 if(!mandate||mandate.provider_id!==MEMBERSHIP_STRIPE_PROVIDER)return review()
 const checkout=await service.checkoutForCustomer(mandate.checkout_id,terms.customer_id)
 if(!checkout)return review()
 const legal=scope.resolve('legal'),[consent]=await legal.listLegalConsents({cart_id:checkout.contract.cart_id},{take:1})
 try{isCurrentConsent(consent,terms.customer_id)}catch{return review()}
 const product=await scope.resolve(Modules.PRODUCT).retrieveProduct(terms.product_id,{select:['id','status','metadata']})
 if(product.status!=='published'||product.metadata?.membership?.version!==terms.version||product.metadata.membership.period_days!==terms.period_days)return review()
 const {data:customers}=await query.graph({entity:'customer',fields:['id','account_holders.*'],filters:{id:terms.customer_id}})
 const holder=customers[0]?.account_holders?.find((h:any)=>h.id===mandate.account_holder_id&&h.provider_id===mandate.provider_id&&h.data?.id===mandate.provider_customer_id)
 if(!holder)return review()
 const payment=scope.resolve(Modules.PAYMENT),methods=await payment.listPaymentMethods({provider_id:mandate.provider_id,context:{account_holder:holder}})
 if(!methods.some((m:any)=>m.id===mandate.payment_method_id&&m.data?.customer===mandate.provider_customer_id&&m.data?.type==='card'))return review()
 if(attempt.stage==='planned'){
  const source=await scope.resolve(Modules.CART).retrieveCart(checkout.contract.cart_id,{relations:['shipping_address','billing_address','items']})
  if(source.customer_id!==terms.customer_id||source.items?.length!==1||source.items[0].requires_shipping!==false)return review()
  attempt=await service.advanceBilling(attempt.id,'planned','cart_requested')
  try{
   const {result:cart}=await createCartWorkflow(scope).run({input:{customer_id:terms.customer_id,region_id:source.region_id,currency_code:'eur',sales_channel_id:source.sales_channel_id,email:source.email,shipping_address:address(source.shipping_address),billing_address:address(source.billing_address),items:[{variant_id:terms.variant_id,quantity:1}]}})
   attempt=await service.advanceBilling(attempt.id,'cart_requested','cart_ready',{cart_id:cart.id})
  }catch{await service.advanceBilling(attempt.id,'cart_requested','unknown');return {status:'RECONCILIATION_REQUIRED'}}
 }
 if(attempt.stage==='cart_ready'){
  await repriceCart(attempt.cart_id!,scope,true,undefined,terms.customer_id)
  const cart=await scope.resolve(Modules.CART).retrieveCart(attempt.cart_id,{select:['id','customer_id','currency_code','total']})
  if(cart.customer_id!==terms.customer_id||cart.currency_code!=='eur'||euroMinor(cart.total)!==terms.amount_minor)return review()
  // Preserve actual original acceptance, never manufacture a new customer's acceptance timestamp.
  const existing=await legal.listLegalConsents({cart_id:cart.id},{take:2})
  if(!existing.length)await legal.createLegalConsents({cart_id:cart.id,customer_id:terms.customer_id,terms_version:consent.terms_version,privacy_version:consent.privacy_version,accepted_at:consent.accepted_at})
  else if(existing.length!==1||existing[0].terms_version!==consent.terms_version||existing[0].privacy_version!==consent.privacy_version||new Date(existing[0].accepted_at).getTime()!==new Date(consent.accepted_at).getTime())return review()
  const {data:paymentCarts}=await query.graph({entity:'cart',fields:['id','payment_collection.id','payment_collection.payment_sessions.id','payment_collection.payments.id'],filters:{id:cart.id}})
  if(!Array.isArray(paymentCarts)||paymentCarts.length!==1||paymentCarts[0].id!==cart.id)throw new Error('MEMBERSHIP_RENEWAL_CART_CHANGED')
  const priorCollection=paymentCarts[0].payment_collection
  if(priorCollection&&(!Array.isArray(priorCollection.payment_sessions)||priorCollection.payment_sessions.length||!Array.isArray(priorCollection.payments)||priorCollection.payments.length))return review()
  const collection=priorCollection?await payment.retrievePaymentCollection(priorCollection.id):(await createPaymentCollectionForCartWorkflow(scope).run({input:{cart_id:cart.id}})).result
  if(euroMinor(collection.amount)!==terms.amount_minor||collection.currency_code!=='eur')return review()
  attempt=await service.advanceBilling(attempt.id,'cart_ready','payment_requested',{collection_id:collection.id})
  try{
   const session=await payment.createPaymentSession(collection.id,{provider_id:mandate.provider_id,currency_code:'eur',amount:terms.amount_minor/100,context:{account_holder:holder,idempotency_key:attempt.renewal_key},data:{membership_renewal:true,payment_method:mandate.payment_method_id,capture_method:'manual'}})
   attempt=await service.advanceBilling(attempt.id,'payment_requested','payment_ready',{session_id:session.id})
  }catch{await service.advanceBilling(attempt.id,'payment_requested','unknown');return {status:'RECONCILIATION_REQUIRED'}}
 }
 if(attempt.stage==='needs_action'){
  const session=await payment.retrievePaymentSession(attempt.session_id)
  if(session.id!==attempt.session_id||session.payment_collection_id!==attempt.collection_id)return review()
  attempt=await service.advanceBilling(attempt.id,'needs_action','payment_ready')
 }
 if(attempt.stage==='payment_ready'){
  const state=await service.findForCustomer(membershipId,terms.customer_id)
  if(!state?.renew)return review()
  attempt=await service.advanceBilling(attempt.id,'payment_ready','completing')
  try{
   await completeCartWorkflow(scope).run({input:{id:attempt.cart_id!}})
   const result=await settle();if(result)return result
   await service.advanceBilling(attempt.id,'completing','unknown');return {status:'RECONCILIATION_REQUIRED'}
  }catch{
   const sessions=await payment.listPaymentSessions({payment_collection_id:attempt.collection_id},{take:2})
   const needsAction=sessions.length===1&&sessions[0].id===attempt.session_id&&sessions[0].status==='requires_more'
   await service.advanceBilling(attempt.id,'completing',needsAction?'needs_action':'unknown')
   return {status:needsAction?'NEEDS_ACTION':'RECONCILIATION_REQUIRED'}
  }
 }
 return {status:'RECONCILIATION_REQUIRED'}
}
export async function recoverMembershipMandates(scope:any){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 let cursor:string|undefined
 for(;;){
  const rows=await service.listMembershipCheckouts({status:'settled',...(cursor?{id:{$gt:cursor}}:{})},{take:50,order:{id:'ASC'}})
  for(const row of rows){
   if(!(row.snapshot as any).consent?.auto_renew)continue
   const [old]=await service.listMembershipMandates({membership_id:row.membership_id!},{take:1})
   if(!old)try{await saveMembershipMandate(scope,row.membership_id!,row.id)}catch{/* No verified mandate means no charge. */}
  }
  if(rows.length<50)break;cursor=rows[rows.length-1].id
 }
}

/** Recovery only: an existing native order/receipt is reconciled, never another charge or checkout. */
export async function reconcileMembershipBilling(scope:any,attemptId:string,now=new Date()){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 const attempt=await service.retrieveMembershipBillingAttempt(attemptId)
 if(!attempt.cart_id)return {status:'RECONCILIATION_REQUIRED'}
 const {data:orders}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{cart_id:attempt.cart_id}})
 if(!Array.isArray(orders)||orders.length>1)throw new Error('MEMBERSHIP_NATIVE_ORDER_AMBIGUOUS')
 if(!orders.length)return {status:'RECONCILIATION_REQUIRED'}
 const terms=(attempt.snapshot as any).terms,orderId=orders[0].order_id
 const receipt=await loadNativeMembershipReceipt(scope,orderId,{cart_id:attempt.cart_id,customer_id:terms.customer_id,product_id:terms.product_id,variant_id:terms.variant_id,checkout_key:attempt.renewal_key},now)
 await service.applyReceipt(attempt.membership_id,receipt,now.toISOString())
 if(attempt.stage!=='settled')await service.advanceBilling(attempt.id,attempt.stage,'settled',{order_id:orderId})
 return {status:'SETTLED',membership_id:attempt.membership_id,access:await reconcileMembershipAccess(scope,attempt.membership_id,now)}
}
/** Return only an already-created own native PaymentIntent secret to resume 3DS; never method IDs. */
export async function resumeMembershipPayment(scope:any,membershipId:string,actorId:string){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 const state=await service.findForCustomer(membershipId,actorId)
 if(!state)throw new Error('MEMBERSHIP_NOT_FOUND')
 const [attempt]=await service.listMembershipBillingAttempts({membership_id:membershipId},{take:1,order:{created_at:'DESC'}})
 if(!attempt||attempt.stage!=='needs_action'||!attempt.session_id||!state.renew)throw new Error('MEMBERSHIP_PAYMENT_NOT_RESUMABLE')
 const session=await scope.resolve(Modules.PAYMENT).retrievePaymentSession(attempt.session_id)
 if(session.provider_id!==MEMBERSHIP_STRIPE_PROVIDER||session.payment_collection_id!==attempt.collection_id||session.data?.membership_renewal!==true||typeof session.data?.client_secret!=='string'||!session.data.client_secret.startsWith('pi_'))throw new Error('MEMBERSHIP_PAYMENT_NOT_RESUMABLE')
 return {attempt_id:attempt.id,client_secret:session.data.client_secret}
}
/** Explicit customer continuation may complete the EXISTING 3DS intent, never start a new cycle. */
export async function continueMembershipPayment(scope:any,membershipId:string,actorId:string){
 const service=scope.resolve(MEMBERSHIP_MODULE) as MembershipModuleService
 if(!await service.findForCustomer(membershipId,actorId))throw new Error('MEMBERSHIP_NOT_FOUND')
 const [attempt]=await service.listMembershipBillingAttempts({membership_id:membershipId},{take:1,order:{created_at:'DESC'}})
 if(!attempt)throw new Error('MEMBERSHIP_PAYMENT_NOT_RESUMABLE')
 if(attempt.stage==='needs_action')return runMembershipBilling(scope,membershipId)
 return reconcileMembershipBilling(scope,attempt.id)
}
