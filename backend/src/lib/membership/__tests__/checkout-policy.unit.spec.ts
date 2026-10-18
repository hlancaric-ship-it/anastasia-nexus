import {assertCheckoutContract,assertCheckoutReceipt,type CheckoutContract} from '../checkout-policy'
import type { Receipt } from '../policy'
const contract=():CheckoutContract=>({cart_id:'cart_a',terms:{customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',version:'v1',period_days:30,amount_minor:5000,currency:'eur'},consent:{version:'v1',auto_renew:true},accepted_at:'2026-10-17T10:00:00.000Z'})
const receipt=():Receipt=>({order_id:'ord_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',currency:'eur',amount_minor:5000,captured_minor:5000,refunded_minor:0,paid_at:'2026-10-17T10:01:00.000Z',canceled:false,exclusive_member_order:true,checkout_key:'initial:ord_a'})
describe('immutable membership checkout agreement',()=>{
 it('accepts a server-owned exact contract and payment after agreement',()=>{expect(()=>assertCheckoutContract(contract())).not.toThrow();expect(()=>assertCheckoutReceipt(contract(),receipt())).not.toThrow()})
 it.each(['cart','customer','version','consent','renew','zero','negative','fraction','currency','days','time','calendar'])('refuses invalid agreement %s',kind=>{
  const c:any=contract()
  if(kind==='cart')c.cart_id='../bad'
  if(kind==='customer')c.terms.customer_id=''
  if(kind==='version')c.terms.version='bad version'
  if(kind==='consent')c.consent.version='v2'
  if(kind==='renew')c.consent.auto_renew='yes'
  if(kind==='zero')c.terms.amount_minor=0
  if(kind==='negative')c.terms.amount_minor=-1
  if(kind==='fraction')c.terms.amount_minor=5000.1
  if(kind==='currency')c.terms.currency='usd'
  if(kind==='days')c.terms.period_days=0
  if(kind==='time')c.accepted_at='2026-10-17 10:00:00'
  if(kind==='calendar')c.accepted_at='2026-02-30T10:00:00.000Z'
  expect(()=>assertCheckoutContract(c)).toThrow()
 })
 it.each(['before','invalid-time','owner','variant','renewal-key'])('rejects unrelated or historical paid receipt %s',kind=>{
  const r=receipt()
  if(kind==='before')r.paid_at='2026-10-17T09:59:59.999Z'
  if(kind==='invalid-time')r.paid_at='not-a-date'
  if(kind==='owner')r.customer_id='cus_other'
  if(kind==='variant')r.variant_id='var_other'
  if(kind==='renewal-key')r.checkout_key='membership:mbr_a:2026-10-17T10:00:00.000Z'
  expect(()=>assertCheckoutReceipt(contract(),r)).toThrow()
 })
})
