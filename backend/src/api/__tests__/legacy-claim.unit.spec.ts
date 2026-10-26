import { POST } from '../store/customers/legacy-claim/route'
function fixture(opts:{rows?:any[],actor?:string,email?:string|null,taken?:any[]}={}) {
 const update=jest.fn().mockResolvedValue(1)
 const query:any={whereRaw:jest.fn().mockReturnThis(),whereNull:jest.fn().mockReturnThis(),where:jest.fn().mockReturnThis(),select:jest.fn().mockResolvedValue(opts.rows??[]),update}
 const db:any=jest.fn(()=>query)
 const auth={
  listProviderIdentities:jest.fn().mockResolvedValue(opts.email===null?[]:[{entity_id:opts.email??'Stary@Example.test'}]),
  listAuthIdentities:jest.fn().mockResolvedValue(opts.taken??[]),
  updateAuthIdentities:jest.fn().mockResolvedValue([])}
 const req:any={auth_context:{auth_identity_id:'au_1',actor_id:opts.actor??''},scope:{resolve:(k:string)=>k==='auth'?auth:db}}
 const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,auth,update}
}
const legacyRow={id:'cus_legacy',has_account:false,metadata:{legacy_customer_migration:{legacy_ids:['x']}}}
describe('legacy customer claim',()=>{
 it('binds the verified identity to the existing legacy customer',async()=>{
  const f=fixture({rows:[legacyRow]});await POST(f.req,f.res)
  expect(f.res.json).toHaveBeenCalledWith({claimed:true})
  expect(f.auth.updateAuthIdentities).toHaveBeenCalledWith([{id:'au_1',app_metadata:{customer_id:'cus_legacy'}}])
  expect(f.update).toHaveBeenCalledWith(expect.objectContaining({has_account:true}))
 })
 it('does nothing for a customer who already has an account',async()=>{
  const f=fixture({rows:[{id:'cus_a',has_account:true,metadata:null},legacyRow]});await POST(f.req,f.res)
  expect(f.res.json).toHaveBeenCalledWith({claimed:false});expect(f.auth.updateAuthIdentities).not.toHaveBeenCalled()
 })
 it('does not claim a guest that is not from the old web',async()=>{
  const f=fixture({rows:[{id:'cus_guest',has_account:false,metadata:null}]});await POST(f.req,f.res)
  expect(f.res.json).toHaveBeenCalledWith({claimed:false});expect(f.auth.updateAuthIdentities).not.toHaveBeenCalled()
 })
 it('does not claim a customer already bound to another identity',async()=>{
  const f=fixture({rows:[legacyRow],taken:[{id:'au_2',app_metadata:{customer_id:'cus_legacy'}}]});await POST(f.req,f.res)
  expect(f.res.json).toHaveBeenCalledWith({claimed:false});expect(f.auth.updateAuthIdentities).not.toHaveBeenCalled()
 })
 it('skips an already registered session and rejects a missing identity',async()=>{
  const a=fixture({actor:'cus_1'});await POST(a.req,a.res);expect(a.res.json).toHaveBeenCalledWith({claimed:false})
  const b=fixture();b.req.auth_context={};await POST(b.req,b.res);expect(b.res.status).toHaveBeenCalledWith(401)
 })
})
