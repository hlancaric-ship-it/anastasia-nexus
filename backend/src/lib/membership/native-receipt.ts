import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import type { Receipt } from './policy'
/** Supplied by the server's persisted checkout attempt, NEVER customer JSON or cart metadata. */
export type CheckoutBinding={cart_id:string;customer_id:string;product_id:string;variant_id:string;checkout_key:string}
type Scope={resolve:(key:string)=>any}
const fail=(code:string):never=>{throw new Error(code)}
/** Exact EUR conversion on the server; missing/invalid facts never become zero. */
export function euroMinor(value:unknown):number{
 if(typeof value==='object'&&value!==null){
  const object=value as Record<string,unknown>
  for(const key of ['numeric','numeric_','value'])if(object[key]!==undefined)return euroMinor(object[key])
  return fail('INVALID_NATIVE_AMOUNT')
 }
 if(typeof value!=='number'&&typeof value!=='string')return fail('INVALID_NATIVE_AMOUNT')
 const raw=String(value)
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(raw))return fail('INVALID_NATIVE_AMOUNT')
 const [whole,fraction='']=raw.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'))
 if(!Number.isSafeInteger(minor))return fail('INVALID_NATIVE_AMOUNT')
 return minor
}
function timestamp(value:unknown):string{
 const text=value instanceof Date?value.toISOString():value
 if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text))return fail('INVALID_NATIVE_CAPTURE_TIME')
 const n=Date.parse(text),canonical=text.length===20?text.replace('Z','.000Z'):text
 if(!Number.isFinite(n)||new Date(n).toISOString()!==canonical)return fail('INVALID_NATIVE_CAPTURE_TIME')
 return canonical
}
const orderFields=['id','customer_id','status','currency_code','total','items.id','items.product_id','items.variant_id','items.quantity','*items.detail','payment_collections.id','payment_collections.captured_amount','payment_collections.refunded_amount','payment_collections.payments.id','payment_collections.payments.amount','payment_collections.payments.currency_code','payment_collections.payments.captured_at','payment_collections.payments.canceled_at']
/** Loads native order/cart links and ledger facts; no Stripe calls or grant. */
export async function loadNativeMembershipReceipt(scope:Scope,orderId:string,binding:CheckoutBinding,now=new Date()):Promise<Receipt>{
 if(![orderId,binding.cart_id,binding.customer_id,binding.product_id,binding.variant_id].every(id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id))||typeof binding.checkout_key!=='string'||!binding.checkout_key||binding.checkout_key.length>256)return fail('INVALID_CHECKOUT_BINDING')
 const query=scope.resolve(ContainerRegistrationKeys.QUERY)
 const {data:links}=await query.graph({entity:'order_cart',fields:['cart_id','order_id'],filters:{order_id:orderId}})
 if(!Array.isArray(links)||links.length!==1||links[0].order_id!==orderId||links[0].cart_id!==binding.cart_id)return fail('NATIVE_ORDER_CART_MISMATCH')
 const {data}=await query.graph({entity:'order',fields:orderFields,filters:{id:orderId}})
 if(!Array.isArray(data)||data.length!==1)return fail('NATIVE_ORDER_NOT_FOUND')
 const order=data[0]
 if(order.id!==orderId||order.customer_id!==binding.customer_id)return fail('NATIVE_ORDER_OWNER_MISMATCH')
 if(typeof order.status!=='string'||order.status==='canceled'||order.currency_code!=='eur')return fail('NATIVE_ORDER_NOT_ELIGIBLE')
 const items=order.items
 if(!Array.isArray(items)||items.length!==1||items[0].quantity!==1||items[0].product_id!==binding.product_id||items[0].variant_id!==binding.variant_id)return fail('NATIVE_MEMBERSHIP_ITEMS_MISMATCH')
 const total=euroMinor(order.total)
 if(total<=0)return fail('NATIVE_MEMBERSHIP_PAYMENT_REQUIRED')
 const collections=order.payment_collections
 if(!Array.isArray(collections)||!collections.length||collections.length>100)return fail('NATIVE_PAYMENT_NOT_VERIFIED')
 let captured=0,refunded=0,paidAmount=0,paidAt=''
 const seenCollections=new Set<string>(),seenPayments=new Set<string>()
 for(const collection of collections){
  if(!collection.id||seenCollections.has(collection.id))return fail('NATIVE_PAYMENT_NOT_VERIFIED')
  seenCollections.add(collection.id)
  captured+=euroMinor(collection.captured_amount);refunded+=euroMinor(collection.refunded_amount)
  if(!Array.isArray(collection.payments)||collection.payments.length>100)return fail('NATIVE_PAYMENT_NOT_VERIFIED')
  for(const payment of collection.payments){
   if(!payment.captured_at)continue
   if(!payment.id||seenPayments.has(payment.id)||payment.canceled_at||payment.currency_code!=='eur')return fail('NATIVE_PAYMENT_NOT_VERIFIED')
   seenPayments.add(payment.id)
   paidAmount+=euroMinor(payment.amount)
   const at=timestamp(payment.captured_at)
   if(at>now.toISOString())return fail('NATIVE_PAYMENT_IN_FUTURE')
   if(!paidAt||at>paidAt)paidAt=at
  }
 }
 if(captured!==total||paidAmount!==captured||refunded!==0||!paidAt)return fail('NATIVE_PAYMENT_NOT_VERIFIED')
 return {order_id:orderId,customer_id:order.customer_id,product_id:items[0].product_id,variant_id:items[0].variant_id,currency:'eur',amount_minor:total,captured_minor:captured,refunded_minor:refunded,paid_at:paidAt,canceled:false,exclusive_member_order:true,checkout_key:binding.checkout_key}
}
