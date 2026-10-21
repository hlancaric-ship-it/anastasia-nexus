import { verifiedCustomerEmails } from "./identity"
import { ADDRESS_ERASURE,erasedEmail } from "./policy"
/** Called inside the privacy module transaction. IDs, amounts, tax lines and financial ledgers stay intact. */
export async function anonymizeCustomer(db:any,customer:any) {
 const id=customer.id,anonymous=erasedEmail(id),now=new Date()
 const emails=await verifiedCustomerEmails(db,id)
 await db.raw("SELECT pg_advisory_xact_lock(hashtext(?))",[`chat:customer:${id}`])
 const orders=await db("order").where({customer_id:id}).select("id","shipping_address_id","billing_address_id")
 const carts=await db("cart").where({customer_id:id}).select("id","shipping_address_id","billing_address_id")
 const orderIds=orders.map((o:any)=>o.id)
 await db("customer").where({id}).update({email:anonymous,first_name:null,last_name:null,company_name:null,phone:null,has_account:false,metadata:null,updated_at:now})
 await db("customer_address").where({customer_id:id}).update({...ADDRESS_ERASURE,address_name:null,updated_at:now})
 for(const [table,rows] of [["order_address",orders],["cart_address",carts]] as const) {
  const addresses=rows.flatMap((o:any)=>[o.shipping_address_id,o.billing_address_id]).filter(Boolean)
  await db(table).where((q:any)=>{q.where({customer_id:id});if(addresses.length)q.orWhereIn("id",addresses)}).update({...ADDRESS_ERASURE,updated_at:now})
 }
 await db("order").where({customer_id:id}).update({email:anonymous,no_notification:true,metadata:null,updated_at:now})
 await db("cart").where({customer_id:id}).update({email:anonymous,metadata:null,updated_at:now})
 await db("chat_message").where({customer_id:id}).update({body:"Obsah bol odstránený na žiadosť zákazníkov.",updated_at:now})
 await db("chat_conversation").where({customer_id:id}).update({subject:null,status:"closed",closed_at:now,muted:true,updated_at:now})
 const block=await db("chat_customer_block").where({customer_id:id}).whereNull("deleted_at").first("id")
 if(block) await db("chat_customer_block").where({id:block.id}).update({blocked:true,reason:null,updated_at:now})
 else await db("chat_customer_block").insert({id:`privacy_block_${id}`,customer_id:id,blocked:true,reason:null,changed_by:"privacy",changed_at:now})
 await db("booking").where({customer_id:id}).update({notes:null,cancel_reason:null,metadata:null,updated_at:now})
 await db("customer_note").where({customer_id:id}).update({body:"Obsah bol odstránený na žiadosť zákazníkov.",updated_at:now})
 await db("legal_withdrawal").where({customer_id:id}).update({reason:null,updated_at:now})
 for(const email of emails) {
  await db("newsletter_consent").whereRaw("lower(email) = ?",[email]).update({email:anonymous,status:"unsubscribed",token_hash:nullSafeHash(id),unsubscribed_at:now,updated_at:now})
  await db("gift_voucher").whereRaw("lower(purchaser_email) = ?",[email]).update({purchaser_email:null,updated_at:now})
  await db("gift_voucher").whereRaw("lower(recipient_email) = ?",[email]).update({recipient_name:null,recipient_email:null,message:null,updated_at:now})
  await db("notification").whereRaw('lower("to") = ?',[email]).update({to:anonymous,data:null,provider_data:null,updated_at:now})
 }
 if(orderIds.length) {
  await db("gift_voucher").whereIn("source_order_id",orderIds).update({purchaser_email:null,metadata:null,updated_at:now})
  await db("notification").whereIn("resource_id",orderIds).update({to:anonymous,data:null,provider_data:null,updated_at:now})
 }
 await db("notification").where({receiver_id:id}).update({to:anonymous,data:null,provider_data:null,updated_at:now})
 const identities=await db("auth_identity").whereRaw("app_metadata->>'customer_id' = ?",[id]).select("id","app_metadata")
 const identityIds=identities.filter((i:any)=>!i.app_metadata?.user_id).map((i:any)=>i.id)
 for(const shared of identities.filter((i:any)=>i.app_metadata?.user_id)) await db("auth_identity").where({id:shared.id}).update({app_metadata:db.raw("app_metadata - 'customer_id'"),updated_at:now})
 if(identityIds.length) {
  await db("provider_identity").whereIn("auth_identity_id",identityIds).update({entity_id:db.raw("? || ':' || id",[anonymous]),user_metadata:null,provider_metadata:null,deleted_at:now,updated_at:now})
  await db("auth_password_reset_token").whereIn("auth_identity_id",identityIds).update({expires_at:now,entity_id:anonymous,token_hash:nullSafeHash(id),updated_at:now})
  await db("auth_identity").whereIn("id",identityIds).update({app_metadata:null,deleted_at:now,updated_at:now})
 }
 return {customer_id:id,orders_preserved:orders.length}
}
// A non-token marker (not a valid digest) cannot authorize any previous operation.
function nullSafeHash(id:string){return `erased:${id}`}
