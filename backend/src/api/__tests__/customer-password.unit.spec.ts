import jwt from 'jsonwebtoken'
import { limitMagicLink,extendCustomerToken } from '../auth-magic-link-middlewares'
import { passwordProblem } from '../store/customers/me/password/route'
const SECRET='synthetic-secret'
function fixture(rows: any[] = [{attempts:1,retry_after:900},{attempts:1,retry_after:900}]) {
 const db={raw:jest.fn(async()=>({rows:[rows.shift()]}))}
 const req:any={scope:{resolve:(key:string)=>key==='configModule'?{projectConfig:{http:{jwtSecret:SECRET}}}:db},ip:'synthetic-client',path:'/auth/customer/emailpass',params:{actor_type:'customer',auth_provider:'emailpass'},body:{email:' A@Example.TEST ',password:'synthetic-pass'}}
 const res:any={statusCode:200,setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
 return {db,req,res,next:jest.fn()}
}
describe('customer password login',()=>{
 it('normalizes email and admits a login after both counters pass',async()=>{
  const f=fixture();await limitMagicLink(f.req,f.res,f.next)
  expect(f.next).toHaveBeenCalledTimes(1);expect(f.req.body.email).toBe('a@example.test');expect(f.db.raw).toHaveBeenCalledTimes(2)
 })
 it('throttles guessing with 429 and never echoes the password',async()=>{
  const f=fixture([{attempts:1,retry_after:900},{attempts:11,retry_after:600}]);await limitMagicLink(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(429);expect(f.next).not.toHaveBeenCalled()
  expect(JSON.stringify(f.res.json.mock.calls)).not.toContain('synthetic-pass')
 })
 it('rejects a request without credentials before touching the database',async()=>{
  const f=fixture();delete f.req.body.password;await limitMagicLink(f.req,f.res,f.next)
  expect(f.res.status).toHaveBeenCalledWith(400);expect(f.db.raw).not.toHaveBeenCalled()
 })
 it('validates password length',()=>{
  expect(passwordProblem('short')).toBe('PASSWORD_TOO_SHORT');expect(passwordProblem('x'.repeat(201))).toBe('PASSWORD_TOO_LONG')
  expect(passwordProblem(' '.repeat(10))).toBe('PASSWORD_REQUIRED');expect(passwordProblem(12345678)).toBe('PASSWORD_REQUIRED');expect(passwordProblem('dobre-heslo')).toBeNull()
 })
})
describe('customer token lifetime',()=>{
 const run=(payload:any,status=200)=>{const f=fixture();f.res.statusCode=status;const original=f.res.json;extendCustomerToken(f.req,f.res,f.next);f.res.json({token:jwt.sign(payload,SECRET,{expiresIn:'1d'})});return original.mock.calls[0][0].token}
 it('extends a bound customer token to 30 days',()=>{
  const out:any=jwt.verify(run({actor_type:'customer',actor_id:'cus_1',auth_identity_id:'authid_1'}),SECRET)
  expect(out.actor_id).toBe('cus_1');expect(out.exp-out.iat).toBe(30*86400)
 })
 it('leaves admin and unbound tokens untouched',()=>{
  for(const payload of [{actor_type:'user',actor_id:'user_1'},{actor_type:'customer',actor_id:''}]){
   const out:any=jwt.verify(run(payload),SECRET);expect(out.exp-out.iat).toBe(86400)
  }
 })
 it('never re-signs a forged token',()=>{
  const forged=jwt.sign({actor_type:'customer',actor_id:'cus_1'},'other-secret');const f=fixture();const original=f.res.json
  extendCustomerToken(f.req,f.res,f.next);f.res.json({token:forged});expect(original.mock.calls[0][0].token).toBe(forged)
 })
})
