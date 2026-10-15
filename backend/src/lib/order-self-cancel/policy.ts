import { LegalError } from "../../modules/legal/policy"
export function bookingCancellationHours(value=process.env.ORDER_SELF_CANCEL_BOOKING_HOURS) {
 if(value===undefined || value.trim()==="")return 24
 if(!/^\d+$/.test(value.trim()) || Number(value)>720)throw new LegalError("ORDER_CANCEL_NOT_CONFIGURED",503)
 return Number(value)
}
export function assertSelfCancelable(order:any,customerId:string,signals:{entitlements:any[];bookings:any[];issuedVouchers:any[]},now=new Date()) {
 if(!order || order.customer_id!==customerId)throw new LegalError("ORDER_NOT_FOUND",404)
 if(!["pending","requires_action"].includes(order.status) || order.is_draft_order)throw new LegalError("ORDER_CANCEL_NOT_AVAILABLE",409)
 // Native cancel also refuses uncanceled fulfillment; never imply that only shipping matters.
 if((order.fulfillments ?? []).some((f:any)=>!f.canceled_at || f.shipped_at || f.delivered_at))throw new LegalError("ORDER_ALREADY_FULFILLED",409)
 // Revoked/expired grants still prove this order has made the content available in the past.
 if(signals.entitlements.length)throw new LegalError("DIGITAL_CONTENT_ALREADY_AVAILABLE",409)
 // An issued bearer code is already available outside this account. A pre-refund balance check
 // cannot exclude concurrent redemption; leave these orders to existing admin cancellation.
 if(signals.issuedVouchers.length)throw new LegalError("ISSUED_VOUCHER_ALREADY_DELIVERED",409)
 const hours=bookingCancellationHours()
 for(const booking of signals.bookings) {
  if(booking.customer_id!==customerId)throw new LegalError("ORDER_CANCEL_NOT_AVAILABLE",409)
  if(booking.status==="canceled")continue
  const starts=new Date(booking.starts_at).getTime()
  if(booking.status==="completed" || !Number.isFinite(starts) || starts<=now.getTime()+hours*3600000)throw new LegalError("BOOKING_CANCEL_TOO_LATE",409)
 }
}
