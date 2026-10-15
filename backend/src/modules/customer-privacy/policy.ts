import { tokenHash,LegalError } from "../legal/policy"
export const erasedEmail=(id:string)=>`erased-${tokenHash(id).slice(0,32)}@example.invalid`
export function noteBody(value:unknown) {
 if(typeof value!=="string" || !value.trim() || value.trim().length>5000) throw new LegalError("INVALID_CUSTOMER_NOTE",400)
 return value.trim()
}
export const ADDRESS_ERASURE={company:null,first_name:null,last_name:null,address_1:null,address_2:null,city:null,province:null,postal_code:null,phone:null,metadata:null}
/** Country is retained for tax/accounting; no street/locality or person remains. */
export function confirmErasure(body:any,id:string) {
 if(body?.confirm!==true || body?.customer_id!==id) throw new LegalError("ERASURE_CONFIRMATION_REQUIRED",422)
}
export function safeVoucher(row:any,email:string) {
 const ownRecipient=!!email && typeof row.recipient_email==="string" && row.recipient_email.toLowerCase()===email.toLowerCase()
 return {id:row.id,code_last4:row.code_last4,source_order_id:row.source_order_id,currency_code:row.currency_code,initial_amount_minor:row.initial_amount,balance_minor:row.balance,status:row.status,issued_at:row.issued_at,expires_at:row.expires_at,...(ownRecipient?{recipient_name:row.recipient_name,recipient_email:row.recipient_email,message:row.message}:{})}
}
