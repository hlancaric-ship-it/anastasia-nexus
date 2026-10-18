jest.mock('../checkout',()=>({membershipOffer:jest.fn(async()=>({amount_minor:5000})),prepareMembershipCheckout:jest.fn(),settleMembershipCheckout:jest.fn(async()=>({status:'PENDING'}))}))
jest.mock('../initial-payment',()=>({createMembershipInitialPayment:jest.fn(async()=>({checkout_id:'mck_a'}))}))
import {GET as list} from '../../../api/store/memberships/route'
import {GET as offer} from '../../../api/store/memberships/offer/route'
import {POST as prepare} from '../../../api/store/memberships/checkout/route'
import {POST as payment} from '../../../api/store/memberships/checkouts/[id]/payment-session/route'
import {POST as settle} from '../../../api/store/memberships/checkouts/[id]/settle/route'
import {POST as stop} from '../../../api/store/memberships/[id]/stop/route'
import {prepareMembershipCheckout,settleMembershipCheckout} from '../checkout'
import {createMembershipInitialPayment} from '../initial-payment'
function response(){const r:any={code:200,body:null,setHeader:jest.fn(),status:(n:number)=>{r.code=n;return r},json:(b:any)=>{r.body=b;return r}};return r}
function request(){return {auth_context:{actor_type:'customer',actor_id:'cus_a'},params:{id:'mck_a'},query:{cart_id:'cart_a'},body:{},scope:{resolve:jest.fn()}} as any}
beforeEach(()=>jest.clearAllMocks())
it.each([list,offer,prepare,payment,settle,stop])('requires actual customer auth and no-store on every handler',async handler=>{const req=request(),res=response();req.auth_context={actor_type:'user',actor_id:'usr_admin'};await handler(req,res);expect(res.code).toBe(401);expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');expect(req.scope.resolve).not.toHaveBeenCalled()})
it('lists only authenticated customer records and never returns mandate/payment snapshots',async()=>{
 const req=request(),res=response(),listAndCountMemberships=jest.fn(async()=>[[{id:'mbr_a',status:'active',period_end:'2026-11-17',snapshot:{renew:true,terms:{product_id:'prod_a',variant_id:'var_a'},secret:'not-visible'}}],1])
 req.query={customer_id:'cus_other'};req.scope.resolve.mockReturnValue({listAndCountMemberships});await list(req,res)
 expect(listAndCountMemberships).toHaveBeenCalledWith({customer_id:'cus_a'},expect.anything());expect(JSON.stringify(res.body)).not.toContain('secret')
})
it('rejects client-authoritative fields instead of passing them to the checkout boundary',async()=>{const req=request(),res=response();req.body={cart_id:'cart_a',version:'v1',amount_minor:5000,auto_renew:true,customer_id:'cus_other',price:0};await prepare(req,res);expect(res.code).toBe(422);expect(prepareMembershipCheckout).not.toHaveBeenCalled()})
it('payment setup accepts neither provider nor method from customer input',async()=>{const req=request(),res=response();req.body={provider_id:'pp_system_default',payment_method:'pm_foreign',amount:0};await payment(req,res);expect(createMembershipInitialPayment).toHaveBeenCalledWith(req.scope,'mck_a','cus_a')})
it('settlement looks up native receipt itself rather than accepting one from request',async()=>{const req=request(),res=response();req.body={order_id:'ord_foreign',captured_minor:999999};await settle(req,res);expect(settleMembershipCheckout).toHaveBeenCalledWith(req.scope,'mck_a','cus_a')})
it('cannot stop another customer membership',async()=>{const req=request(),res=response(),service={findForCustomer:jest.fn(async()=>null),stop:jest.fn()};req.scope.resolve.mockReturnValue(service);await stop(req,res);expect(res.code).toBe(404);expect(service.findForCustomer).toHaveBeenCalledWith('mck_a','cus_a');expect(service.stop).not.toHaveBeenCalled()})
