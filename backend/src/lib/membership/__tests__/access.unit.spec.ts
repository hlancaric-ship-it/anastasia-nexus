import { reconcileMembershipAccess } from '../access'
import { activateMembership,type Receipt,type Terms } from '../policy'
import { loadNativeMembershipReceipt } from '../native-receipt'
jest.mock('../native-receipt',()=>({...jest.requireActual('../native-receipt'),loadNativeMembershipReceipt:jest.fn()}))
const terms:Terms={customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',version:'v1',period_days:30,amount_minor:5000,currency:'eur'}
const receipt:Receipt={order_id:'ord_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',currency:'eur',amount_minor:5000,captured_minor:5000,refunded_minor:0,paid_at:'2026-10-01T12:00:00.000Z',canceled:false,exclusive_member_order:true,checkout_key:'initial:ord_a'}
const now=new Date('2026-10-16T12:00:00Z')
function fixture(existing:boolean=true){
 const state=activateMembership('mbr_a',terms,receipt,{version:'v1',auto_renew:true},receipt.paid_at)
 let right:any=existing?{id:'ent_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',order_id:'ord_a',source:'order',status:'active',expires_at:state.period_end,granted_by:null}:null
 let stopped=false
 const rights={
  findByDedupeKey:jest.fn(async()=>right),
  grant:jest.fn(async(data:any)=>{if(!data.tenant_id)throw new Error('ENTITLEMENT_TENANT_REQUIRED');right={...data,id:'ent_a',status:'active',granted_by:null};return{entitlement:right,created:true}}),
  updateEntitlements:jest.fn(async(data:any)=>{right={...right,...data};return right}),
  revoke:jest.fn(async()=>{right={...right,status:'revoked'};return right}),
 }
 const membership={withAccessLock:jest.fn(async(_id:string,f:any)=>{const r=await f(state);stopped=r.stop_renewal;return r.value}),listMembershipReceipts:jest.fn(async()=>[{checkout_key:receipt.checkout_key}])}
 const order={id:'ord_a',customer_id:'cus_a',status:'pending',payment_collections:[{id:'paycol_a',captured_amount:50,refunded_amount:0}]}
 const query={graph:jest.fn(async({entity}:any)=>({data:entity==='order_cart'?[{cart_id:'cart_a',order_id:'ord_a'}]:[order]}))}
 const scope={resolve:(key:string)=>({membership,entitlement:rights,query} as any)[key]}
 ;(loadNativeMembershipReceipt as jest.Mock).mockResolvedValue(receipt)
 return {state,rights,membership,order,query,scope,get right(){return right},set right(v:any){right=v},get stopped(){return stopped}}
}
afterEach(()=>jest.resetAllMocks())
describe('membership access lifecycle',()=>{
 it('grants a verified paid right with the canonical native order key and exact end',async()=>{const f=fixture(false);expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('ACTIVE');expect(f.rights.grant).toHaveBeenCalledWith(expect.objectContaining({dedupe_key:'order:ord_a:prod_a',customer_id:'cus_a',expires_at:new Date(f.state.period_end)}));expect(loadNativeMembershipReceipt).toHaveBeenCalledTimes(2)})
 it('grants with a tenant_id – the entitlement service rejects a grant without it',async()=>{const f=fixture(false);expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('ACTIVE');expect(f.rights.grant).toHaveBeenCalledWith(expect.objectContaining({tenant_id:'default'}))})
 it('never reactivates a manually revoked right despite a paid order',async()=>{const f=fixture();f.right.status='revoked';expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('NEEDS_REVIEW');expect(f.stopped).toBe(true);expect(f.rights.grant).not.toHaveBeenCalled();expect(f.rights.updateEntitlements).not.toHaveBeenCalled()})
 it('caps an accidental perpetual generic grant to the agreed paid period',async()=>{const f=fixture();f.right.expires_at=null;expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('ACTIVE');expect(new Date(f.right.expires_at).toISOString()).toBe(f.state.period_end);expect(f.rights.grant).not.toHaveBeenCalled()})
 it('does not override a shorter manually adjusted period',async()=>{const f=fixture();f.right.expires_at='2026-10-20T12:00:00.000Z';expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('NEEDS_REVIEW');expect(f.rights.updateEntitlements).not.toHaveBeenCalled();expect(f.stopped).toBe(true)})
 it('keeps existing access on partial refund but stops renewal',async()=>{const f=fixture();(loadNativeMembershipReceipt as jest.Mock).mockRejectedValue(new Error('refund'));f.order.payment_collections[0].refunded_amount=5;expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('NEEDS_REVIEW');expect(f.right.status).toBe('active');expect(f.stopped).toBe(true);expect(f.rights.grant).not.toHaveBeenCalled()})
 it('revokes and stops renewal only on definite full refund/cancellation facts',async()=>{const f=fixture();(loadNativeMembershipReceipt as jest.Mock).mockRejectedValue(new Error('refund'));f.order.payment_collections[0].refunded_amount=50;expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('REVOKED');expect(f.right.status).toBe('revoked');expect(f.stopped).toBe(true)})
 it('does not report success or revoke a valid right when verification is unavailable',async()=>{const f=fixture();(loadNativeMembershipReceipt as jest.Mock).mockRejectedValue(new Error('unavailable'));f.query.graph.mockRejectedValue(new Error('database unavailable'));expect((await reconcileMembershipAccess(f.scope,'mbr_a',now)).status).toBe('PENDING_VERIFICATION');expect(f.rights.revoke).not.toHaveBeenCalled();expect(f.rights.grant).not.toHaveBeenCalled();expect(f.stopped).toBe(false)})
 it('does not create a fresh right for an already expired paid period',async()=>{const f=fixture(false);expect((await reconcileMembershipAccess(f.scope,'mbr_a',new Date('2026-11-02T12:00:00Z'))).status).toBe('EXPIRED');expect(f.rights.grant).not.toHaveBeenCalled()})
 it('rejects another owner before touching access',async()=>{const f=fixture();f.right.customer_id='cus_other';await expect(reconcileMembershipAccess(f.scope,'mbr_a',now)).rejects.toThrow('OWNER_MISMATCH');expect(loadNativeMembershipReceipt).not.toHaveBeenCalled();expect(f.rights.grant).not.toHaveBeenCalled()})
})
