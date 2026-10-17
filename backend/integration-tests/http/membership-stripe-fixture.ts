/** Synthetic external Stripe protocol only. Native Medusa modules, guards, workflows and PG stay real.
 * No HTTP/socket call is implemented; unexpected methods fail instead of contacting Stripe. */
export function syntheticMembershipStripe(){
 const intents=new Map<string,any>(),customers=new Map<string,any>(),methods=new Map<string,any>(),keys=new Map<string,string>()
 let intentSerial=0,customerSerial=0,methodSerial=0,refundSerial=0,captures=0,refunds=0
 const clone=<T>(v:T):T=>structuredClone(v)
 const intent=(id:string)=>{const value=intents.get(id);if(!value)throw new Error('SYNTHETIC_INTENT_NOT_FOUND');return value}
 const confirm=(id:string)=>{const value=intent(id);if(!value.customer||!customers.has(value.customer))throw new Error('SYNTHETIC_NATIVE_CUSTOMER_REQUIRED')
  if(!value.payment_method){const method={id:`pm_Synthetic${++methodSerial}`,object:'payment_method',type:'card',customer:value.customer,card:{brand:'visa',last4:'4242'}};methods.set(method.id,method);value.payment_method=method.id}
  const method=methods.get(value.payment_method)
  if(!method||method.customer!==value.customer)throw new Error('SYNTHETIC_METHOD_OWNER_MISMATCH')
  value.status='requires_capture';value.amount_capturable=value.amount;return clone(value)
 }
 const sdk={
  paymentIntents:{
   create:async(input:any,options:any={})=>{const key=options.idempotencyKey;if(key&&keys.has(key))return clone(intent(keys.get(key)!));if(!Number.isSafeInteger(input.amount)||input.amount<=0||input.currency!=='eur'||input.confirm||input.off_session)throw new Error('SYNTHETIC_UNSAFE_INITIATION');const value={...clone(input),id:`pi_Synthetic${++intentSerial}`,object:'payment_intent',status:input.payment_method?'requires_confirmation':'requires_payment_method',client_secret:`pi_Synthetic${intentSerial}_secret_synthetic`,amount_received:0,amount_capturable:0,amount_refunded:0,created:Math.floor(Date.now()/1000)};intents.set(value.id,value);if(key)keys.set(key,value.id);return clone(value)},
   retrieve:async(id:string)=>clone(intent(id)),
   confirm:async(id:string)=>confirm(id),
   capture:async(id:string)=>{const value=intent(id);if(value.status==='succeeded')return clone(value);if(value.status!=='requires_capture')throw new Error('SYNTHETIC_CAPTURE_BEFORE_CONFIRMATION');value.status='succeeded';value.amount_received=value.amount;value.amount_capturable=0;captures++;return clone(value)},
   cancel:async(id:string)=>{const value=intent(id);if(value.status==='succeeded')throw new Error('SYNTHETIC_CANNOT_CANCEL_CAPTURED');value.status='canceled';return clone(value)},
   update:async(id:string,input:any)=>{const value=intent(id);if(value.status==='succeeded')throw new Error('SYNTHETIC_CANNOT_CHANGE_CAPTURED');Object.assign(value,clone(input));return clone(value)},
  },
  customers:{
   create:async(input:any)=>{const value={...clone(input),id:`cus_Synthetic${++customerSerial}`,object:'customer'};customers.set(value.id,value);return clone(value)},
   update:async(id:string,input:any)=>{const value=customers.get(id);if(!value)throw new Error('SYNTHETIC_CUSTOMER_NOT_FOUND');Object.assign(value,clone(input));return clone(value)},
   del:async(id:string)=>({id,deleted:customers.delete(id)}),
   listPaymentMethods:async(id:string)=>({data:[...methods.values()].filter(method=>method.customer===id).map(clone)}),
  },
  paymentMethods:{retrieve:async(id:string)=>{const value=methods.get(id);if(!value)throw new Error('SYNTHETIC_METHOD_NOT_FOUND');return clone(value)}},
  refunds:{create:async(input:any)=>{const value=intent(input.payment_intent);if(value.status!=='succeeded'||!Number.isSafeInteger(input.amount)||input.amount<=0||value.amount_refunded+input.amount>value.amount_received)throw new Error('SYNTHETIC_INVALID_REFUND');value.amount_refunded+=input.amount;refunds++;return {id:`re_Synthetic${++refundSerial}`,object:'refund',status:'succeeded',...clone(input)}}},
 }
 return {sdk,clientConfirm:confirm,stats:()=>({intents:intents.size,captures,refunds}),intent:(id:string)=>clone(intent(id))}
}
