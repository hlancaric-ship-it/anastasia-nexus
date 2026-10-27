import { sha256Hex } from '../../modules/auth-magic-link/policy'
import { guardPasswordRegister, guardPasswordReset, guardPasswordUpdate, limitMagicLink } from '../auth-magic-link-middlewares'
function fixture(params:any, body:any, invites:any[]=[], rateRows:any[]=[{attempts:1,retry_after:900},{attempts:1,retry_after:900}]) {
 const db={raw:jest.fn(async()=>({rows:[rateRows.shift()]}))}
 const users={listInvites:jest.fn(async()=>invites)}
 const req:any={params,body,ip:'synthetic-client',path:`/auth/${params.actor_type}/${params.auth_provider}`,scope:{resolve:(k:string)=>k==='user'?users:db}}
 const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {req,res,next:jest.fn(),db,users}
}
const future=new Date(Date.now()+86400e3).toISOString(), past=new Date(Date.now()-1000).toISOString()
describe('password self-service by decoded route parameters',()=>{
 it('blocks customer emailpass register even via a percent-encoded provider (decoded param)',async()=>{
  for(const guard of [guardPasswordRegister,guardPasswordReset,guardPasswordUpdate]){
   const f=fixture({actor_type:'customer',auth_provider:'emailpass'},{email:'a@b.test',password:'x'.repeat(20)})
   await guard(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(404);expect(f.next).not.toHaveBeenCalled()
  }
 })
 it('rejects unknown actors and providers (fail closed)',async()=>{
  for(const params of [{actor_type:'vendor',auth_provider:'emailpass'},{actor_type:'user',auth_provider:'magic-link'}]){
   const f=fixture(params,{email:'a@b.test',password:'x'.repeat(20)});await guardPasswordRegister(f.req,f.res,f.next)
   expect(f.res.status).toHaveBeenCalledWith(404);expect(f.next).not.toHaveBeenCalled()
  }
 })
})
describe('administrator registration requires a valid invite',()=>{
 const admin={actor_type:'user',auth_provider:'emailpass'}
 it('admits registration for an e-mail with a pending invite',async()=>{
  const f=fixture(admin,{email:' Boss@Example.TEST ',password:'dlhe-bezpecne-heslo'},[{id:'inv_1',accepted:false,expires_at:future}])
  await guardPasswordRegister(f.req,f.res,f.next);expect(f.next).toHaveBeenCalledTimes(1);expect(f.req.body.email).toBe('boss@example.test')
 })
 it('refuses an e-mail without invite, with an expired or an accepted invite',async()=>{
  for(const invites of [[],[{id:'i',accepted:false,expires_at:past}],[{id:'i',accepted:true,expires_at:future}]]){
   const f=fixture(admin,{email:'boss@example.test',password:'dlhe-bezpecne-heslo'},invites)
   await guardPasswordRegister(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(403);expect(f.next).not.toHaveBeenCalled()
  }
 })
 it('enforces the 12 character minimum on the server',async()=>{
  const f=fixture(admin,{email:'boss@example.test',password:'kratke'},[{id:'i',accepted:false,expires_at:future}])
  await guardPasswordRegister(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(400);expect(f.users.listInvites).not.toHaveBeenCalled()
  const u=fixture(admin,{password:'kratke'});await guardPasswordUpdate(u.req,u.res,u.next);expect(u.res.status).toHaveBeenCalledWith(400)
  const ok=fixture(admin,{password:'dlhe-bezpecne-heslo'});await guardPasswordUpdate(ok.req,ok.res,ok.next);expect(ok.next).toHaveBeenCalledTimes(1)
 })
})
describe('administrator reset and login are throttled',()=>{
 const admin={actor_type:'user',auth_provider:'emailpass'}
 it('throttles repeated reset e-mails for one address',async()=>{
  const f=fixture(admin,{identifier:'boss@example.test'},[],[{attempts:1,retry_after:3600},{attempts:4,retry_after:1200}])
  await guardPasswordReset(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(429);expect(f.next).not.toHaveBeenCalled()
 })
 it('rejects a reset without a valid e-mail before touching the database',async()=>{
  const f=fixture(admin,{identifier:'x'.repeat(5000)});await guardPasswordReset(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(400);expect(f.db.raw).not.toHaveBeenCalled()
 })
 it('applies the stricter administrator login limit with separate counters',async()=>{
  const f=fixture(admin,{email:'boss@example.test',password:'synthetic-pass'},[],[{attempts:1,retry_after:900},{attempts:6,retry_after:300}])
  await limitMagicLink(f.req,f.res,f.next);expect(f.res.status).toHaveBeenCalledWith(429)
  const keys=f.db.raw.mock.calls.map((c:any)=>c[1][0])
  expect(keys).toEqual([sha256Hex('admin-pw-ip:synthetic-client'),sha256Hex('admin-pw-email:boss@example.test')])
 })
})
