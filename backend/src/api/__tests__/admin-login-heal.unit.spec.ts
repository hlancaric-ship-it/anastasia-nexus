import { healSharedAdminLogin } from '../auth-magic-link-middlewares'
function fixture(opts:{admin?:any,rows?:any[],meta?:any}) {
 const updated:any[]=[]
 const auth={
  listProviderIdentities:jest.fn(async()=>opts.rows??[{auth_identity_id:'au_1'}]),
  listAuthIdentities:jest.fn(async()=>[{id:'au_1',app_metadata:opts.meta??{customer_id:'cus_1'}}]),
  updateAuthIdentities:jest.fn(async(x:any)=>{updated.push(...x)})}
 const users={listUsers:jest.fn(async()=>opts.admin?[opts.admin]:[])}
 const req:any={body:{email:' Boss@Example.test '},scope:{resolve:(k:string)=>k==='auth'?auth:users}}
 return {req,next:jest.fn(),updated,users}
}
describe('administrator login on a shared e-mail',()=>{
 it('links the identity that holds the password with the administrator',async()=>{
  const f=fixture({admin:{id:'user_1'}});await healSharedAdminLogin(f.req,{},f.next)
  expect(f.updated).toEqual([{id:'au_1',app_metadata:{customer_id:'cus_1',user_id:'user_1'}}]);expect(f.next).toHaveBeenCalledTimes(1)
 })
 it('does not touch an identity that already belongs to an administrator',async()=>{
  const f=fixture({admin:{id:'user_1'},meta:{user_id:'user_2'}});await healSharedAdminLogin(f.req,{},f.next)
  expect(f.updated).toEqual([]);expect(f.next).toHaveBeenCalledTimes(1)
 })
 it('does nothing when no administrator uses the e-mail',async()=>{
  const f=fixture({});await healSharedAdminLogin(f.req,{},f.next)
  expect(f.updated).toEqual([]);expect(f.next).toHaveBeenCalledTimes(1)
 })
 it('never blocks the login when the helper fails',async()=>{
  const f=fixture({admin:{id:'user_1'}});f.users.listUsers.mockRejectedValueOnce(new Error('db'))
  await healSharedAdminLogin(f.req,{},f.next);expect(f.next).toHaveBeenCalledTimes(1)
 })
})
