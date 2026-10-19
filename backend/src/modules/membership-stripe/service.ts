import StripeProvider from '@medusajs/payment-stripe/dist/services/stripe-provider'
import type { InitiatePaymentInput, AuthorizePaymentInput, AuthorizePaymentOutput, GetPaymentStatusInput, UpdatePaymentInput } from '@medusajs/framework/types'
/** Native Stripe provider with deferred off-session confirmation. No Subscription API.
 * Membership checkout guard MUST verify the persisted native session before this authorization.
 * Native initiation never charges: validation/SafeOrder/legal run before authorizePayment.
 */
export default class MembershipStripe extends StripeProvider {
 static identifier='membership_stripe'
 /** Medusa replaces session.data on authorization/update; retain only our validated operation flag.
  * All authoritative PI fields (including setup_future_usage and native metadata) come fresh from Stripe.
  */
 private operationData<T extends {data?:Record<string,unknown>}>(input:Record<string,unknown>|undefined,result:T):T{
  return {...result,data:{...(input?.membership_renewal===true?{membership_renewal:true}:{}),...result.data}}
 }
 async getPaymentStatus(input:GetPaymentStatusInput){
  return this.operationData(input.data,await super.getPaymentStatus(input))
 }
 async updatePayment(input:UpdatePaymentInput){
  return this.operationData(input.data,await super.updatePayment(input))
 }
 async initiatePayment(input:InitiatePaymentInput){
  if(input.data?.confirm||input.data?.off_session)throw new Error('MEMBERSHIP_EARLY_CHARGE_FORBIDDEN')
  return super.initiatePayment({...input,data:{...input.data,confirm:false,capture_method:'manual',payment_method_types:['card'],automatic_payment_methods:{enabled:false}}})
 }
 async authorizePayment(input:AuthorizePaymentInput):Promise<AuthorizePaymentOutput>{
  const id=input.data?.id,sessionId=input.data?.metadata&&typeof input.data.metadata==='object'?(input.data.metadata as Record<string,unknown>).session_id:undefined
  if(typeof id!=='string'||!/^pi_[A-Za-z0-9]+$/.test(id)||typeof sessionId!=='string'||input.context?.idempotency_key!==sessionId)throw new Error('MEMBERSHIP_NATIVE_SESSION_REQUIRED')
  const intent=await this.stripe_.paymentIntents.retrieve(id)
  if(input.data?.membership_renewal===true&&intent.status==='requires_confirmation'){
   try{await this.stripe_.paymentIntents.confirm(id,{off_session:true},{idempotencyKey:`membership-confirm:${sessionId}`})}
   catch(error:any){
    // Card/3DS errors retain the same intent. Network errors remain unknown, never create another PI.
    if(error?.type!=='StripeCardError')throw new Error('MEMBERSHIP_CONFIRMATION_UNKNOWN')
   }
  }
  let current=await this.stripe_.paymentIntents.retrieve(id)
  // Banka odmietla off-session platbu bez overenia: Stripe vráti PI do requires_payment_method.
  // Ten istý PI sa znovu potvrdí s tou istou kartou, aby prešiel do requires_action (3DS v účte členky).
  // Nikdy nový PI ani nová karta; manual capture ostáva, peniaze sa bez overenia nestrhnú.
  const authError=current.last_payment_error,authMethod=authError?.payment_method
  const methodId=typeof authMethod==='string'?authMethod:authMethod?.id
  if(input.data?.membership_renewal===true&&current.status==='requires_payment_method'&&authError?.code==='authentication_required'&&typeof methodId==='string'&&/^pm_[A-Za-z0-9]+$/.test(methodId)){
   try{await this.stripe_.paymentIntents.confirm(id,{payment_method:methodId},{idempotencyKey:`membership-authenticate:${sessionId}`})}
   catch(error:any){if(error?.type!=='StripeCardError')throw new Error('MEMBERSHIP_CONFIRMATION_UNKNOWN')}
   current=await this.stripe_.paymentIntents.retrieve(id)
  }
  if(current.status==='requires_capture'){
   try{await this.stripe_.paymentIntents.capture(id,{},{idempotencyKey:`membership-capture:${sessionId}`})}
   catch{throw new Error('MEMBERSHIP_CAPTURE_UNKNOWN')}
  }
  return this.getPaymentStatus(input)
 }
}
