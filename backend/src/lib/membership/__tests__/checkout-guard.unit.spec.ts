jest.mock('../customer-guard',()=>({assertMembershipCustomerAvailable:jest.fn(async()=>{})}))
jest.mock('../billing-guard',()=>({assertMembershipRenewalCart:jest.fn(async()=>false)}))
import {assertMembershipCheckoutCart,MEMBERSHIP_PROVIDER} from '../checkout-guard'
import {assertMembershipRenewalCart} from '../billing-guard'
function fixture(){
 const terms={customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',version:'v1',period_days:30,amount_minor:5000,currency:'eur'}
 const contract={cart_id:'cart_a',terms,consent:{version:'v1',auto_renew:true},accepted_at:'2026-10-17T10:00:00.000Z'}
 const session:any={id:'payses_a',provider_id:MEMBERSHIP_PROVIDER,data:{capture_method:'manual',setup_future_usage:'off_session'}}
 const cart:any={id:'cart_a',customer_id:'cus_a',currency_code:'eur',total:50,items:[{product_id:'prod_a',variant_id:'var_a',quantity:1}],payment_collection:{id:'paycol_a',payment_sessions:[session]}}
 const product:any={id:'prod_a',metadata:{membership:{version:'v1',period_days:30}}}
 const checkouts:any[]=[{id:'mck_a'}]
 const fence:any={status:'ready',session_id:'payses_a',collection_id:'paycol_a'}
 const service={listMembershipCheckouts:async()=>checkouts,checkoutForCustomer:async()=>({id:'mck_a',contract,status:'prepared'}),listMembershipInitialPayments:async()=>[fence]}
 const scope:any={hasRegistration:()=>true,resolve:(k:string)=>k==='query'?{graph:async()=>({data:[product]})}:service}
 return {cart,session,product,checkouts,fence,scope,contract}
}
beforeEach(()=>jest.clearAllMocks())
it('guards the exact persisted agreement/session before authorization',async()=>{const f=fixture();await expect(assertMembershipCheckoutCart(f.scope,f.cart)).resolves.toBeUndefined()})
it.each(['owner','price','variant','quantity','mixed','version','days','provider','marker','capture','setup','session','collection'])('rejects a bypass/change %s',async kind=>{
 const f=fixture()
 if(kind==='owner')f.cart.customer_id='cus_other'
 if(kind==='price')f.cart.total=49
 if(kind==='variant')f.cart.items[0].variant_id='var_other'
 if(kind==='quantity')f.cart.items[0].quantity=2
 if(kind==='mixed')f.cart.items.push({...f.cart.items[0]})
 if(kind==='version')f.product.metadata.membership.version='v2'
 if(kind==='days')f.product.metadata.membership.period_days=365
 if(kind==='provider')f.session.provider_id='pp_system_default'
 if(kind==='marker')f.session.data.membership_renewal=true
 if(kind==='capture')f.session.data.capture_method='automatic'
 if(kind==='setup')delete f.session.data.setup_future_usage
 if(kind==='session')f.fence.session_id='payses_other'
 if(kind==='collection')f.fence.collection_id='paycol_other'
 await expect(assertMembershipCheckoutCart(f.scope,f.cart)).rejects.toThrow('MEMBERSHIP_')
})
it('rejects a configured membership when the application module is not installed',async()=>{const f=fixture();f.scope.hasRegistration=()=>false;await expect(assertMembershipCheckoutCart(f.scope,f.cart)).rejects.toThrow('NOT_CONFIGURED')})
it('does not allow arbitrary membership provider use on ordinary products',async()=>{const f=fixture();f.checkouts.length=0;delete f.product.metadata.membership;await expect(assertMembershipCheckoutCart(f.scope,f.cart)).rejects.toThrow('CONSENT_REQUIRED')})
it('allows ordinary purchases with ordinary providers unchanged',async()=>{const f=fixture();f.checkouts.length=0;delete f.product.metadata.membership;f.session.provider_id='pp_stripe_stripe';await expect(assertMembershipCheckoutCart(f.scope,f.cart)).resolves.toBeUndefined()})
it('delegates a durable renewal cart to the strict native billing guard',async()=>{const f=fixture();f.checkouts.length=0;jest.mocked(assertMembershipRenewalCart).mockResolvedValueOnce(true);await expect(assertMembershipCheckoutCart(f.scope,f.cart)).resolves.toBeUndefined();expect(assertMembershipRenewalCart).toHaveBeenCalledWith(f.scope,f.cart)})
