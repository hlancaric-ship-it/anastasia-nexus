import { POST } from '../store/customers/me/password/route'
const VERIFIED=[{id:'pi_ml',entity_id:'boss@example.test',provider:'magic-link'}]
function fixture(opts:{existing?:any,other?:any,admin?:any,own?:any[]}) {
 const state:any={deleted:[],created:[],updated:[],provider:[]}
 const db:any=()=>({where:()=>({whereNull:()=>({first:async()=>({email:'Boss@Example.test'})})})})
 db.raw=jest.fn(async()=>({rows:[{epoch:1}]}))
 const auth={
  listProviderIdentities:jest.fn(async(f:any)=>f.auth_identity_id?(opts.own??VERIFIED):(opts.existing?[opts.existing]:[])),
  listAuthIdentities:jest.fn(async(f:any)=>f.id==='au_other'?[{id:'au_other',app_metadata:opts.other??{}}]:[{id:f.id,app_metadata:{customer_id:'cus_1'}}]),
  deleteProviderIdentities:jest.fn(async(ids:string[])=>{state.deleted.push(...ids)}),
  createProviderIdentities:jest.fn(async(x:any)=>{state.created.push(x)}),
  updateAuthIdentities:jest.fn(async(x:any)=>{state.updated.push(...x)}),
  updateProvider:jest.fn(async()=>({success:true}))}
 const users={listUsers:jest.fn(async()=>opts.admin?[opts.admin]:[])}
 const req:any={body:{password:'dobre-heslo-123'},auth_context:{actor_type:'customer',actor_id:'cus_1',auth_identity_id:'au_own'},
  scope:{resolve:(k:string)=>k==='auth'?auth:k==='user'?users:db}}
 const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,auth,state}
}
describe('customer password can never take over an administrator login',()=>{
 it('refuses to set a password for an administrator e-mail and changes nothing',async()=>{
  const f=fixture({existing:{id:'pi_1',auth_identity_id:'au_other'},other:{user_id:'user_1'},admin:{id:'user_1'}})
  await POST(f.req,f.res)
  expect(f.res.status).toHaveBeenCalledWith(409)
  expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({error:'ADMIN_EMAIL_USE_ADMIN_FLOW'}))
  expect(f.auth.updateProvider).not.toHaveBeenCalled()
  expect(f.state.deleted).toEqual([]);expect(f.state.created).toEqual([]);expect(f.state.updated).toEqual([])
 })
 it('refuses when the customer identity never verified the account e-mail (forged customer e-mail)',async()=>{
  const f=fixture({own:[{id:'pi_ml',entity_id:'attacker@example.test',provider:'magic-link'}]})
  await POST(f.req,f.res)
  expect(f.res.status).toHaveBeenCalledWith(409)
  expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({error:'PASSWORD_EMAIL_NOT_VERIFIED'}))
  expect(f.auth.updateProvider).not.toHaveBeenCalled()
 })
 it('never deletes a login linked to an administrator even without a matching user row',async()=>{
  const f=fixture({existing:{id:'pi_1',auth_identity_id:'au_other'},other:{user_id:'user_1'}})
  await POST(f.req,f.res)
  expect(f.res.status).toHaveBeenCalledWith(409);expect(f.state.deleted).toEqual([])
  expect(f.auth.updateProvider).not.toHaveBeenCalled()
 })
 it('still replaces an orphan login that belongs to nobody',async()=>{
  const f=fixture({existing:{id:'pi_2',auth_identity_id:'au_other'},other:{}})
  await POST(f.req,f.res)
  expect(f.state.deleted).toEqual(['pi_2']);expect(f.state.created).toEqual([expect.objectContaining({auth_identity_id:'au_own',entity_id:'boss@example.test'})])
  expect(f.res.json).toHaveBeenCalledWith({has_password:true})
 })
 it('refuses a login that belongs to another customer',async()=>{
  const f=fixture({existing:{id:'pi_3',auth_identity_id:'au_other'},other:{customer_id:'cus_9'}})
  await POST(f.req,f.res)
  expect(f.res.status).toHaveBeenCalledWith(409);expect(f.state.deleted).toEqual([])
 })
})
