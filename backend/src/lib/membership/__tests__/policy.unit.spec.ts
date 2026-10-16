import { activateMembership, applyRenewalReceipt, markRenewalUnknown, planRenewal, stopRenewal, type Terms, type Receipt } from '../policy'
const now='2026-10-01T12:00:00.000Z'
const terms:Terms={customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',version:'v1',period_days:30,amount_minor:5000,currency:'eur'}
const receipt:Receipt={order_id:'ord_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',currency:'eur',amount_minor:5000,captured_minor:5000,refunded_minor:0,paid_at:now,canceled:false,exclusive_member_order:true,checkout_key:'initial:ord_a'}
const consent={version:'v1',auto_renew:true}
const active=()=>activateMembership('mem_a',terms,receipt,consent,now)
const current={version:'v1',amount_minor:5000,currency:'eur'}
describe('fixed-day membership policy, no financial side effects',()=>{
 it('anchors the purchased period to the actual payment, not retry or processing time',()=>{expect(activateMembership('mem_a',terms,receipt,consent,'2026-10-05T12:00:00Z').period_end).toBe('2026-10-31T12:00:00.000Z')})
 it.each([{customer_id:'cus_other'},{product_id:'prod_other'},{variant_id:'var_other'}])('rejects another owner/product/variant %j',patch=>expect(()=>activateMembership('mem_a',terms,{...receipt,...patch},consent,now)).toThrow('OWNER_MISMATCH'))
 it.each([{captured_minor:0},{captured_minor:4999},{captured_minor:5001},{captured_minor:NaN},{amount_minor:4999},{refunded_minor:1},{currency:'usd'},{canceled:true},{exclusive_member_order:false}])('rejects unverified payment %j',patch=>expect(()=>activateMembership('mem_a',terms,{...receipt,...patch},consent,now)).toThrow('PAYMENT_NOT_VERIFIED'))
 it.each([{amount_minor:0},{amount_minor:1.2},{period_days:0},{period_days:1.5},{period_days:3651},{version:''}])('rejects unsafe terms %j',patch=>expect(()=>activateMembership('mem_a',{...terms,...patch},receipt,consent,now)).toThrow('INVALID_TERMS'))
 it('requires matching consent and refuses future-dated receipts',()=>{expect(()=>activateMembership('mem_a',terms,receipt,{...consent,version:'v0'},now)).toThrow('CONSENT_REQUIRED');expect(()=>activateMembership('mem_a',terms,{...receipt,paid_at:'2026-10-02T12:00:00Z'},consent,now)).toThrow('FUTURE')})
 it('does not renew before due or after a stop request',()=>{expect(planRenewal(active(),now,current).action).toBe('NONE');expect(planRenewal(stopRenewal(active()),'2026-11-01T12:00:00Z',current).action).toBe('NONE')})
 it.each([{amount_minor:5100},{amount_minor:4900},{currency:'usd'},{version:'v2'}])('requires review instead of silently changing the agreed renewal %j',patch=>expect(planRenewal(active(),'2026-10-31T12:00:00Z',{...current,...patch}).action).toBe('REVIEW'))
 it('uses one stable key and reconciles after a repeated or unknown execution',()=>{
  const due='2026-10-31T12:00:00Z',first=planRenewal(active(),due,current)
  expect(first.action).toBe('ENQUEUE_NATIVE_CHECKOUT');expect(first.key).toBe('membership:mem_a:2026-10-31T12:00:00.000Z')
  expect(planRenewal(first.state,due,current)).toMatchObject({action:'RECONCILE_NATIVE_CHECKOUT',key:first.key})
  expect(planRenewal(markRenewalUnknown(first.state),due,current).action).toBe('RECONCILE_NATIVE_CHECKOUT')
  expect(planRenewal(stopRenewal(first.state),due,current).action).toBe('RECONCILE_NATIVE_CHECKOUT')
 })
 it('extends access only from a bound verified renewal; replay never extends it twice',()=>{
  const pending=planRenewal(active(),'2026-10-31T12:00:00Z',current).state
  const paid={...receipt,order_id:'ord_b',paid_at:'2026-11-02T12:00:00Z',checkout_key:pending.renewal_key!}
  const result=applyRenewalReceipt(markRenewalUnknown(pending),paid,'2026-11-03T12:00:00Z')
  expect(result.period_end).toBe('2026-12-02T12:00:00.000Z')
  expect(applyRenewalReceipt(result,paid,'2026-11-04T12:00:00Z')).toBe(result)
  expect(()=>applyRenewalReceipt(pending,{...paid,checkout_key:'other'},paid.paid_at)).toThrow('BINDING_MISMATCH')
  expect(()=>applyRenewalReceipt(pending,{...paid,order_id:'ord_a'},paid.paid_at)).toThrow('ORDER_ALREADY_USED')
 })
 it('does not reapply a delayed old receipt while a new period is renewing',()=>{
  const pending=planRenewal(active(),'2026-10-31T12:00:00Z',current).state
  expect(applyRenewalReceipt(pending,receipt,'2026-11-01T12:00:00Z')).toBe(pending)
 })
 it.each(['2026-10-01T12:00:00','2026-02-30T12:00:00Z','not-a-date'])('refuses ambiguous or invalid native timestamp %s',paid_at=>expect(()=>activateMembership('mem_a',terms,{...receipt,paid_at},consent,now)).toThrow('INVALID_DATE'))
 it('fails closed for a corrupted saved state or renewal key',()=>{
  expect(()=>planRenewal({...active(),status:'corrupt' as any},now,current)).toThrow('INVALID_MEMBERSHIP')
  const pending=planRenewal(active(),'2026-10-31T12:00:00Z',current).state
  expect(()=>planRenewal({...pending,renewal_key:'another-membership'},now,current)).toThrow('INVALID_RENEWAL_KEY')
 })

 it('never enrolls a renewal order as a second initial membership',()=>expect(()=>activateMembership('mem_b',terms,{...receipt,checkout_key:'membership:mem_a:period'},consent,now)).toThrow('INITIAL_BINDING_MISMATCH'))

})
