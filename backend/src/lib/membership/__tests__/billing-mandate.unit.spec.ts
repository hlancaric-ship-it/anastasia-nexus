jest.mock('../native-receipt',()=>({loadNativeMembershipReceipt:jest.fn(async()=>({}))}))
import {saveMembershipMandate} from '../billing-mandate'
import {MEMBERSHIP_STRIPE_PROVIDER} from '../billing-guard'
function fixture(){
 const contract={cart_id:'cart_a',terms:{customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a'},consent:{auto_renew:true}}
 const checkout:any={status:'settled',membership_id:'mbr_a',order_id:'ord_a',contract}
 const session={id:'payses_a'},payment:any={id:'pay_a',provider_id:MEMBERSHIP_STRIPE_PROVIDER,captured_at:new Date(),canceled_at:null,payment_session:session,payment_collection_id:'paycol_a',data:{status:'succeeded',setup_future_usage:'off_session',customer:'cus_stripe',payment_method:{id:'pm_saved'},metadata:{session_id:'payses_a'}}}
 const holder={id:'ach_a',provider_id:MEMBERSHIP_STRIPE_PROVIDER,data:{id:'cus_stripe'}},methods:any[]=[{id:'pm_saved',data:{customer:'cus_stripe',type:'card'}}]
 const initial=[{collection_id:'paycol_a'}],service={retrieveMembership:jest.fn(async()=>({snapshot:{terms:contract.terms}})),checkoutForCustomer:jest.fn(async()=>checkout),listMembershipInitialPayments:jest.fn(async()=>initial),saveMandate:jest.fn()}
 const payments={retrievePayment:async()=>payment,listPaymentMethods:jest.fn(async()=>methods)}
 const scope:any={resolve:(key:string)=>({membership:service,payment:payments,query:{graph:async({entity}:any)=>({data:entity==='order'?[{payment_collections:[{payments:[{id:'pay_a'}]}]}]:[{id:'cus_a',account_holders:[holder]}]})}} as any)[key]}
 return {scope,service,payment,checkout,holder,methods,initial,payments}
}
test('only verified captured native ownership is saved as opaque refs',async()=>{const f=fixture();expect(await saveMembershipMandate(f.scope,'mbr_a','mck_a')).toEqual({status:'SAVED'});expect(f.service.saveMandate).toHaveBeenCalledWith({membership_id:'mbr_a',customer_id:'cus_a',checkout_id:'mck_a',provider_id:MEMBERSHIP_STRIPE_PROVIDER,account_holder_id:'ach_a',provider_customer_id:'cus_stripe',payment_method_id:'pm_saved',payment_id:'pay_a'})})
test('no auto renew consent never reads methods',async()=>{const f=fixture();f.checkout.contract.consent.auto_renew=false;expect(await saveMembershipMandate(f.scope,'mbr_a','mck_a')).toEqual({status:'NOT_REQUESTED'});expect(f.payments.listPaymentMethods).not.toHaveBeenCalled()})
test.each(['uncaptured','provider','setup','session','fence','holder','methodowner','methodtype'])('rejects invalid %s proof',async kind=>{const f=fixture();if(kind==='uncaptured')f.payment.captured_at=null;if(kind==='provider')f.payment.provider_id='pp_stripe_stripe';if(kind==='setup')f.payment.data.setup_future_usage=null;if(kind==='session')f.payment.data.metadata.session_id='payses_other';if(kind==='fence')f.initial.length=0;if(kind==='holder')f.holder.data.id='cus_other';if(kind==='methodowner')f.methods[0].data.customer='cus_other';if(kind==='methodtype')f.methods[0].data.type='bank';await expect(saveMembershipMandate(f.scope,'mbr_a','mck_a')).rejects.toThrow();expect(f.service.saveMandate).not.toHaveBeenCalled()})
