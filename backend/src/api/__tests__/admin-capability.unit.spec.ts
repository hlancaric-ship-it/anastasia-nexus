const retrieveUser=jest.fn()
import { adminCapabilityMiddlewares, bodyTouchesPrices, rejectAssistantPriceChange, requireCapability } from '../admin-capability-middlewares'
function fixture(ctx:any, body:any={}) {
 const req:any={auth_context:ctx,body,scope:{resolve:()=>({retrieveUser})}}
 const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,next:jest.fn()}
}
beforeEach(()=>retrieveUser.mockReset())
describe('server-side admin roles',()=>{
 it('denies an assistant pricing, access and roles capabilities with 403',async()=>{
  retrieveUser.mockResolvedValue({id:'user_a',metadata:{anastasia_role:'assistant'}})
  for(const cap of ['pricing','access','roles'] as const){
   const f=fixture({actor_type:'user',actor_id:'user_a'});await requireCapability(cap)(f.req,f.res,f.next)
   expect(f.res.status).toHaveBeenCalledWith(403);expect(f.next).not.toHaveBeenCalled()
  }
 })
 it('admits the owner and the assistant for daily work',async()=>{
  retrieveUser.mockResolvedValue({id:'user_o',metadata:{anastasia_role:'owner'}})
  const o=fixture({actor_type:'user',actor_id:'user_o'});await requireCapability('pricing')(o.req,o.res,o.next);expect(o.next).toHaveBeenCalled()
  retrieveUser.mockResolvedValue({id:'user_a',metadata:{anastasia_role:'assistant'}})
  const a=fixture({actor_type:'user',actor_id:'user_a'});await requireCapability('orders')(a.req,a.res,a.next);expect(a.next).toHaveBeenCalled()
 })
 it('fails closed: unknown user is treated as assistant, missing actor gets 401',async()=>{
  retrieveUser.mockRejectedValue(new Error('not found'))
  const f=fixture({actor_type:'user',actor_id:'user_x'});await requireCapability('pricing')(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(403)
  const c=fixture({actor_type:'customer',actor_id:'cus_1'});await requireCapability('pricing')(c.req,c.res,c.next);expect(c.res.status).toHaveBeenCalledWith(401)
 })
 it('lets a secret admin API key through (keys are owner-only)',async()=>{
  const f=fixture({actor_type:'api-key',actor_id:'apk_1'});await requireCapability('pricing')(f.req,f.res,f.next);expect(f.next).toHaveBeenCalled()
 })
 it('blocks assistant price changes in product payloads but not plain edits',async()=>{
  retrieveUser.mockResolvedValue({id:'user_a',metadata:{anastasia_role:'assistant'}})
  const p=fixture({actor_type:'user',actor_id:'user_a'},{variants:[{id:'v1',prices:[{amount:1,currency_code:'eur'}]}]})
  await rejectAssistantPriceChange(p.req,p.res,p.next);expect(p.res.status).toHaveBeenCalledWith(403)
  const t=fixture({actor_type:'user',actor_id:'user_a'},{title:'Nový názov',variants:[{title:'Štandard',prices:[]}]})
  await rejectAssistantPriceChange(t.req,t.res,t.next);expect(t.next).toHaveBeenCalled()
  expect(bodyTouchesPrices({update:[{prices:[{amount:2}]}]})).toBe(true)
 })
 it('covers coupon, voucher, price, entitlement and api-key routes',()=>{
  const matchers=adminCapabilityMiddlewares.map(r=>r.matcher)
  for(const m of ['/admin/coupon-links*','/admin/vouchers*','/admin/shop-prices*','/admin/promotions*','/admin/price-lists*','/admin/entitlements*','/admin/api-keys*'])expect(matchers).toContain(m)
 })
})
