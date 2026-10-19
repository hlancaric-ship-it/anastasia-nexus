import { assertMembershipRenewalCart,MEMBERSHIP_STRIPE_PROVIDER } from '../billing-guard'
jest.mock('../../legal/checkout',()=>({assertCartConsent:jest.fn(async()=>{})}))
function fixture(){
 const terms={customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',version:'v1',period_days:30,amount_minor:5000,currency:'eur'}
 const state={id:'mbr_a',terms,renew:true,status:'renewing',period_end:'2026-10-17T00:00:00.000Z',last_order_id:'ord_old',last_checkout_key:'initial:ord_old',renewal_key:'membership:mbr_a:2026-10-17T00:00:00.000Z'}
 const attempt={id:'mba_a',membership_id:state.id,renewal_key:state.renewal_key,stage:'completing',cart_id:'cart_a',collection_id:'paycol_a',session_id:'payses_a',snapshot:{terms,mandate_id:'mmd_a'}}
 const mandate={provider_id:MEMBERSHIP_STRIPE_PROVIDER,payment_method_id:'pm_saved',provider_customer_id:'cus_stripe'}
 const session={id:'payses_a',provider_id:MEMBERSHIP_STRIPE_PROVIDER,currency_code:'eur',amount:50,data:{membership_renewal:true,capture_method:'manual',payment_method:'pm_saved',customer:'cus_stripe'}}
 const cart:any={id:'cart_a',customer_id:'cus_a',currency_code:'eur',total:50,items:[{product_id:'prod_a',variant_id:'var_a',quantity:1}],payment_collection:{id:'paycol_a',payment_sessions:[session]}}
 const product={status:'published',metadata:{membership:{version:'v1',period_days:30}}}
 const service={listMembershipBillingAttempts:jest.fn(async()=>[attempt]),retrieveMembership:jest.fn(async()=>({snapshot:state})),listMembershipMandates:jest.fn(async()=>[mandate])}
 const scope:any={resolve:(key:string)=>key==='membership'?service:{retrieveProduct:async()=>product}}
 return {scope,cart,state,attempt,product,session,service}
}
test('native renewal cart and persisted method pass',async()=>{const f=fixture();expect(await assertMembershipRenewalCart(f.scope,f.cart)).toBe(true)})
test('ordinary cart has no renewal authority',async()=>{const f=fixture();f.service.listMembershipBillingAttempts.mockResolvedValueOnce([]);expect(await assertMembershipRenewalCart(f.scope,f.cart)).toBe(false)})
test.each(['customer','amount','quantity','variant','session','method','provider','earlyconfirm','period','stopped','key','stage'])('rejects changed %s before charge',async kind=>{const f=fixture();switch(kind){case'customer':f.cart.customer_id='cus_other';break;case'amount':f.cart.total=49;break;case'quantity':f.cart.items[0].quantity=2;break;case'variant':f.cart.items[0].variant_id='var_other';break;case'session':f.session.id='payses_spoof';break;case'method':f.session.data.payment_method='pm_other';break;case'provider':f.session.provider_id='pp_stripe_stripe';break;case'earlyconfirm':(f.session.data as any).confirm=true;break;case'period':f.product.metadata.membership.period_days=365;break;case'stopped':f.state.renew=false;break;case'key':f.attempt.renewal_key='forged';break;case'stage':f.attempt.stage='planned'}await expect(assertMembershipRenewalCart(f.scope,f.cart)).rejects.toThrow()})

test('native Stripe expanded payment method is accepted by exact ID',async()=>{const f=fixture();(f.session.data as any).payment_method={id:'pm_saved',type:'card'};expect(await assertMembershipRenewalCart(f.scope,f.cart)).toBe(true)})
