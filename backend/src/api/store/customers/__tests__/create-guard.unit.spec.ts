import { requireVerifiedCustomerEmail } from '../create-guard'
function fixture(body:any, owned:any[], ctx:any={auth_identity_id:'au_1'}) {
 const auth={listProviderIdentities:jest.fn(async()=>owned)}
 const req:any={body,auth_context:ctx,scope:{resolve:()=>auth}}
 const res:any={status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,next:jest.fn()}
}
describe('customer creation is bound to the verified e-mail',()=>{
 it('refuses an e-mail that the identity did not verify (admin takeover attempt)',async()=>{
  const f=fixture({email:'boss@example.test'},[{provider:'magic-link',entity_id:'attacker@example.test'}])
  await requireVerifiedCustomerEmail(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(403);expect(f.next).not.toHaveBeenCalled()
 })
 it('does not accept an unverified emailpass identity as proof',async()=>{
  const f=fixture({email:'boss@example.test'},[{provider:'emailpass',entity_id:'boss@example.test'}])
  await requireVerifiedCustomerEmail(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(403)
 })
 it('admits the verified e-mail, normalizes it and drops client metadata',async()=>{
  const f=fixture({email:' Nova@Example.TEST ',metadata:{loyalty_tier:'vip'}},[{provider:'magic-link',entity_id:'nova@example.test'}])
  await requireVerifiedCustomerEmail(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalledTimes(1);expect(f.req.body).toEqual({email:'nova@example.test'})
 })
 it('rejects requests without identity or with an invalid e-mail',async()=>{
  const a=fixture({email:'a@b.test'},[],{});await requireVerifiedCustomerEmail(a.req,a.res,a.next);expect(a.res.status).toHaveBeenCalledWith(401)
  const b=fixture({email:'x'.repeat(5000)},[]);await requireVerifiedCustomerEmail(b.req,b.res,b.next);expect(b.res.status).toHaveBeenCalledWith(400)
 })
})
