import { euroMinor,loadNativeMembershipReceipt,type CheckoutBinding } from '../native-receipt'
const binding:CheckoutBinding={cart_id:'cart_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',checkout_key:'initial:ord_a'}
const now=new Date('2026-10-16T12:00:00.000Z')
function fixture(){
 const payment={id:'pay_a',amount:50,currency_code:'eur',captured_at:'2026-10-16T11:00:00.000Z',canceled_at:null}
 const collection={id:'paycol_a',captured_amount:50,refunded_amount:0,payments:[payment]}
 const order={id:'ord_a',customer_id:'cus_a',status:'pending',currency_code:'eur',total:50,items:[{id:'item_a',product_id:'prod_a',variant_id:'var_a',quantity:1}],payment_collections:[collection],metadata:{membership_key:'client-forged-key'}}
 const links=[{cart_id:'cart_a',order_id:'ord_a'}]
 const query={graph:jest.fn(async({entity}:any)=>({data:entity==='order_cart'?links:[order]}))}
 return {payment,collection,order,links,query,scope:{resolve:()=>query}}
}
describe('native membership receipt authority',()=>{
 it.each([undefined,null,NaN,Infinity,-1,'-1','1e2','50.001','050','',{},true])('refuses missing/ambiguous amount %j',value=>expect(()=>euroMinor(value)).toThrow('INVALID_NATIVE_AMOUNT'))
 it('converts exact native major amounts to integer cents without rounding',()=>{expect(euroMinor('50.01')).toBe(5001);expect(euroMinor(19.9)).toBe(1990);expect(euroMinor({numeric:'50.00'})).toBe(5000);expect(euroMinor(0)).toBe(0)})
 it('uses actual cart link, own order, exclusive item and fully captured native ledger',async()=>{
  const f=fixture(),receipt=await loadNativeMembershipReceipt(f.scope,'ord_a',binding,now)
  expect(receipt).toMatchObject({order_id:'ord_a',captured_minor:5000,paid_at:f.payment.captured_at,checkout_key:binding.checkout_key})
  expect(f.query.graph.mock.calls[0][0].entity).toBe('order_cart')
  expect(receipt.checkout_key).not.toBe(f.order.metadata.membership_key)
 })
 it('does not trust matching client metadata when the native cart link differs',async()=>{const f=fixture();f.links[0].cart_id='cart_other';f.order.metadata.membership_key=binding.checkout_key;await expect(loadNativeMembershipReceipt(f.scope,'ord_a',binding,now)).rejects.toThrow('ORDER_CART_MISMATCH');expect(f.query.graph).toHaveBeenCalledTimes(1)})
 it.each(['owner','variant','quantity','mixed','canceled','currency','zero'])('rejects wrong native order facts: %s',async kind=>{
  const f=fixture()
  if(kind==='owner')f.order.customer_id='cus_other'
  if(kind==='variant')f.order.items[0].variant_id='var_other'
  if(kind==='quantity')f.order.items[0].quantity=2
  if(kind==='mixed')f.order.items.push({...f.order.items[0],id:'item_b'})
  if(kind==='canceled')f.order.status='canceled'
  if(kind==='currency')f.order.currency_code='usd'
  if(kind==='zero')f.order.total=0
  await expect(loadNativeMembershipReceipt(f.scope,'ord_a',binding,now)).rejects.toThrow()
 })
 it.each(['partial','overcapture','refund','missing-capture','duplicate-collection','duplicate-payment','wrong-payment-currency','canceled-payment','future','invalid-time','missing-summary'])('fails closed for payment inconsistency: %s',async kind=>{
  const f=fixture()
  if(kind==='partial')f.collection.captured_amount=49
  if(kind==='overcapture')f.collection.captured_amount=51
  if(kind==='refund')f.collection.refunded_amount=1
  if(kind==='missing-capture')f.payment.captured_at=''
  if(kind==='duplicate-collection')f.order.payment_collections.push(f.collection)
  if(kind==='duplicate-payment')f.collection.payments.push(f.payment)
  if(kind==='wrong-payment-currency')f.payment.currency_code='usd'
  if(kind==='canceled-payment')(f.payment as any).canceled_at=now.toISOString()
  if(kind==='future')f.payment.captured_at='2026-10-17T12:00:00.000Z'
  if(kind==='invalid-time')f.payment.captured_at='2026-10-16 11:00:00'
  if(kind==='missing-summary')(f.collection as any).captured_amount=undefined
  await expect(loadNativeMembershipReceipt(f.scope,'ord_a',binding,now)).rejects.toThrow()
 })
})
