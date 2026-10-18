jest.mock('@medusajs/medusa/core-flows',()=>({createPaymentCollectionForCartWorkflow:jest.fn(),createPaymentSessionsWorkflow:jest.fn()}))
jest.mock('../../legal/checkout',()=>({assertCartConsent:jest.fn(async()=>{})}))
jest.mock('../../../api/store/nexus-cart/route',()=>({repriceCart:jest.fn(async()=>({pricesChanged:false}))}))
import {createMembershipInitialPayment} from '../initial-payment'
import {createPaymentSessionsWorkflow} from '@medusajs/medusa/core-flows'
import {repriceCart} from '../../../api/store/nexus-cart/route'
import {assertCartConsent} from '../../legal/checkout'
const provider='pp_membership_stripe_membership'
function fixture(){
 const contract={cart_id:'cart_a',terms:{customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',amount_minor:5000},consent:{auto_renew:true}}
 const cart={id:'cart_a',customer_id:'cus_a',currency_code:'eur',completed_at:null,total:50,items:[{product_id:'prod_a',variant_id:'var_a',quantity:1}]}
 const session:any={id:'payses_a',provider_id:provider,currency_code:'eur',amount:50,data:{capture_method:'manual',setup_future_usage:'off_session',client_secret:'pi_synthetic_secret_synthetic'},context:{idempotency_key:'membership-initial:mck_a'}}
 const collection:any={id:'paycol_a',amount:50,currency_code:'eur',payment_sessions:[]}
 const reservation:any={action:'CREATE',key:'membership-initial:mck_a',payment:{session_id:null}}
 const service={checkoutForCustomer:jest.fn(async()=>({id:'mck_a',status:'prepared',contract})),reserveInitialPayment:jest.fn(async()=>reservation),completeInitialPayment:jest.fn(),unknownInitialPayment:jest.fn()}
 const scope:any={resolve:(k:string)=>({membership:service,locking:{execute:async(_id:string,f:any)=>f()},cart:{retrieveCart:async()=>cart},query:{graph:async()=>({data:[{id:'cart_a',payment_collection:collection}]})},payment:{retrievePaymentSession:async()=>session}} as any)[k]}
 const run=jest.fn(async()=>({result:session}));jest.mocked(createPaymentSessionsWorkflow).mockReturnValue({run} as any)
 return {scope,service,cart,collection,session,reservation,run}
}
beforeEach(()=>{jest.clearAllMocks();jest.mocked(repriceCart).mockResolvedValue({pricesChanged:false} as any);jest.mocked(assertCartConsent).mockResolvedValue(undefined)})
it('uses native customer workflow and server-only deferred capture settings',async()=>{const f=fixture();expect(await createMembershipInitialPayment(f.scope,'mck_a','cus_a')).toMatchObject({checkout_id:'mck_a',payment_session:{id:'payses_a'}});expect(f.run).toHaveBeenCalledWith({input:expect.objectContaining({provider_id:provider,customer_id:'cus_a',context:{idempotency_key:f.reservation.key},data:{capture_method:'manual',payment_method_types:['card'],setup_future_usage:'off_session'}})});expect(f.service.completeInitialPayment).toHaveBeenCalledWith('mck_a','cus_a','payses_a')})
it('returns the same persisted session on replay without recreating native effects',async()=>{const f=fixture();f.reservation.action='RECONCILE';f.reservation.payment.session_id='payses_a';f.collection.payment_sessions=[f.session];await createMembershipInitialPayment(f.scope,'mck_a','cus_a');expect(f.run).not.toHaveBeenCalled()})
it('recovers a lost response only through the native server context key',async()=>{const f=fixture();f.reservation.action='RECONCILE';f.collection.payment_sessions=[f.session];await createMembershipInitialPayment(f.scope,'mck_a','cus_a');expect(f.run).not.toHaveBeenCalled();expect(f.service.completeInitialPayment).toHaveBeenCalled()})
it('never retries native creation when an earlier provider result is unknown',async()=>{const f=fixture();f.run.mockRejectedValueOnce(new Error('network'));await expect(createMembershipInitialPayment(f.scope,'mck_a','cus_a')).rejects.toThrow('RECONCILIATION_REQUIRED');expect(f.service.unknownInitialPayment).toHaveBeenCalled();f.reservation.action='RECONCILE';await expect(createMembershipInitialPayment(f.scope,'mck_a','cus_a')).rejects.toThrow('RECONCILIATION_REQUIRED');expect(f.run).toHaveBeenCalledTimes(1)})
it('rejects a forged native Store session that lacks the server context key',async()=>{const f=fixture();f.reservation.action='RECONCILE';f.collection.payment_sessions=[f.session];f.session.context.idempotency_key='forged';await expect(createMembershipInitialPayment(f.scope,'mck_a','cus_a')).rejects.toThrow('RECONCILIATION_REQUIRED');expect(f.run).not.toHaveBeenCalled()})
it.each(['owner','amount','legal','pricing','other-session'])('fails before creating provider effects for %s',async kind=>{const f=fixture();if(kind==='owner')f.cart.customer_id='cus_other';if(kind==='amount')f.cart.total=40;if(kind==='legal')jest.mocked(assertCartConsent).mockRejectedValueOnce(Error('TERMS_NOT_ACCEPTED'));if(kind==='pricing')jest.mocked(repriceCart).mockResolvedValueOnce({pricesChanged:true} as any);if(kind==='other-session')f.collection.payment_sessions=[{id:'foreign'}];await expect(createMembershipInitialPayment(f.scope,'mck_a','cus_a')).rejects.toThrow();expect(f.run).not.toHaveBeenCalled()})
