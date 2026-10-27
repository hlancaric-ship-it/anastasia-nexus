import { POST } from '../store/customers/me/password/route'
function fixture(opts:{existing?:any,other?:any,admin?:any,own?:any[]}) {
 const state:any={deleted:[],created:[],updated:[],provider:[]}
 const db:any=()=>({where:()=>({whereNull:()=>({first:async()=>({email:'Boss@Example.test'})})})})
 const auth={
  listProviderIdentities:jest.fn(async(f:any)=>f.auth_identity_id?(opts.own??[]):(opts.existing?[opts.existing]:[])),
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
describe('customer password never breaks the shared administrator login',()=>{
 it('keeps the administrator credentials and shares them with the customer',async()=>{
  const f=fixture({existing:{id:'pi_1',auth_identity_id:'au_other'},other:{user_id:'user_1'},admin:{id:'user_1'}})
  await POST(f.req,f.res)
  expect(f.state.deleted).toEqual([]);expect(f.state.created).toEqual([])
  expect(f.state.updated).toEqual([{id:'au_other',app_metadata:{user_id:'user_1',customer_id:'cus_1'}}])
  expect(f.res.json).toHaveBeenCalledWith({has_password:true})
 })
 it('repairs a customer identity that already holds the password of an administrator e-mail',async()=>{
  const f=fixture({existing:{id:'pi_1',auth_identity_id:'au_own'},admin:{id:'user_1'}})
  await POST(f.req,f.res)
  expect(f.state.deleted).toEqual([]);expect(f.state.created).toEqual([])
  expect(f.state.updated).toEqual([{id:'au_own',app_metadata:{customer_id:'cus_1',user_id:'user_1'}}])
 })
 it('still replaces an orphan login that belongs to no administrator',async()=>{
  const f=fixture({existing:{id:'pi_2',auth_identity_id:'au_other'},other:{}})
  await POST(f.req,f.res)
  expect(f.state.deleted).toEqual(['pi_2']);expect(f.state.created).toHaveLength(1)
 })
 it('refuses a login that belongs to another customer',async()=>{
  const f=fixture({existing:{id:'pi_3',auth_identity_id:'au_other'},other:{customer_id:'cus_9'}})
  await POST(f.req,f.res)
  expect(f.res.status).toHaveBeenCalledWith(409);expect(f.state.deleted).toEqual([])
 })
})
