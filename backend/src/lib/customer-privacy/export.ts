import { LegalError } from "../../modules/legal/policy"
import { verifiedCustomerEmails } from "../../modules/customer-privacy/identity"
import { safeVoucher } from "../../modules/customer-privacy/policy"
/** Consistent read snapshot, customer predicates on every relation, no internal notes/auth secrets. */
export async function exportCustomerData(db:any,customerId:string) {
 return db.transaction(async(tx:any)=>{
  await tx.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  const customer=await tx("customer").where({id:customerId}).whereNull("deleted_at").first("id","email","first_name","last_name","phone","company_name","created_at","updated_at")
  if(!customer)throw new LegalError("CUSTOMER_NOT_FOUND",404)
  const read=async(table:string,filter:any,columns:string[])=>{
   const rows=await tx(table).where(filter).select([...columns,"deleted_at"]).limit(10001)
   if(rows.length>10000)throw new LegalError("EXPORT_TOO_LARGE",413)
   return rows
  }
  const addresses=await read("customer_address",{customer_id:customerId},["id","address_name","first_name","last_name","company","address_1","address_2","city","country_code","province","postal_code","phone"])
  const orders=await read("order",{customer_id:customerId},["id","display_id","status","email","currency_code","created_at","canceled_at"])
  const orderIds=orders.map((o:any)=>o.id)
  // Native order module supplies authoritative totals/items separately in the route.
  const bookings=await read("booking",{customer_id:customerId},["id","product_id","order_id","status","starts_at","ends_at","notes","cancel_reason","created_at"])
  const entitlements=await read("entitlement",{customer_id:customerId},["id","product_id","variant_id","order_id","status","source","granted_at","expires_at","revoked_at"])
  // Zrkadielko (RESET 40+): údaje o energii, spánku a strese patria zákazníkovi – musia byť v jeho exporte.
  // Tabuľka môže chýbať, kým nie je nasadená migrácia – export právo zákazníka nesmie spadnúť.
  const resetJournal=await tx.schema.hasTable("reset_journal_entry")?await read("reset_journal_entry",{customer_id:customerId},["id","program","week","entry_date","metrics","created_at"]):[]
  const conversations=await read("chat_conversation",{customer_id:customerId},["id","subject","order_id","booking_id","status","created_at","closed_at"])
  const messages=await read("chat_message",{customer_id:customerId},["id","conversation_id","author_type","body","created_at"])
  const consents=await read("legal_consent",{customer_id:customerId},["id","cart_id","order_id","terms_version","privacy_version","accepted_at"])
  const withdrawals=await read("legal_withdrawal",{customer_id:customerId},["id","order_id","items","reason","status","created_at"])
  const verifiedEmails=await verifiedCustomerEmails(tx,customerId)
  const newsletter=verifiedEmails.length?await tx("newsletter_consent").whereIn("email",verifiedEmails).select("id","email","status","source","text_version","consented_at","unsubscribed_at").limit(10001):[]
  if(newsletter.length>10000)throw new LegalError("EXPORT_TOO_LARGE",413)
  const history=newsletter.length?await tx("newsletter_consent_event").whereIn("consent_id",newsletter.map((n:any)=>n.id)).whereNull("deleted_at").select("consent_id","status","source","text_version","occurred_at").limit(10001):[]
  if(history.length>10000)throw new LegalError("EXPORT_TOO_LARGE",413)
  const voucherRows=await tx("gift_voucher").where((q:any)=>{q.whereRaw("false");if(verifiedEmails.length)q.orWhereIn(tx.raw("lower(recipient_email)"),verifiedEmails);if(orderIds.length)q.orWhereIn("source_order_id",orderIds)}).select("id","code_last4","source_order_id","currency_code","initial_amount","balance","status","issued_at","expires_at","recipient_email","recipient_name","message").limit(10001)
  if(voucherRows.length>10000)throw new LegalError("EXPORT_TOO_LARGE",413)
  return {exported_at:new Date().toISOString(),customer,addresses,orders,bookings,entitlements,reset_journal:resetJournal,chat:{conversations,messages},consents,withdrawals,newsletter,newsletter_history:history,vouchers:voucherRows.map((v:any)=>safeVoucher(v,verifiedEmails.includes(v.recipient_email?.toLowerCase())?v.recipient_email:""))}
 })
}
