import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { sha256Hex } from '../../src/modules/auth-magic-link/policy'
/** Real PostgreSQL + native HTTP auth; notification events are captured, never delivered. */
export async function verifyAuthSecurity({api,container,evidence}: any) {
 const endpoint='/auth/customer/magic-link', options={validateStatus:()=>true}
 const events=container.resolve(Modules.EVENT_BUS), original=events.emit.bind(events)
 const links=new Map<string,string[]>(), emails=['invalid','race','rate','expired'].map(name=>`security-${name}@example.test`)
 for(const email of emails) {
  await container.resolve(Modules.CUSTOMER).createCustomers({email})
  links.set(email,[])
 }
 const spy=jest.spyOn(events,'emit').mockImplementation(async(...args:any[])=>{
  const event=args[0]
  if(event?.name==='auth-magic-link.requested' && links.has(event.data?.email)) {
   links.get(event.data.email)!.push(String(event.data.url));return
  }
  return original(...args)
 })
 const record=(scenario:string)=>evidence.push({scenario:`SECURITY_AUTH_${scenario}`,status:'PASS'})
 const issue=async(email:string)=>{
  const before=links.get(email)!.length
  const response=await api.post(endpoint,{email},options)
  expect(response.status).not.toBe(429)
  expect(links.get(email)).toHaveLength(before+1)
  return new URL(links.get(email)![before]).searchParams.get('token')!
 }
 try {
  expect((await api.post('/auth/user/magic-link',{email:emails[0]},options)).status).toBe(404)
  expect(links.get(emails[0])).toHaveLength(0)
  record('OTHER_ACTOR_CANNOT_BYPASS_GUARD')
  const token=await issue(emails[0])
  expect((await api.post(endpoint,{email:emails[0],token:'wrong-synthetic-token'},options)).status).toBe(401)
  expect((await api.post(endpoint,{email:emails[0],token},options)).status).toBe(200)
  expect((await api.post(endpoint,{email:emails[0],token},options)).status).toBe(401)
  record('INVALID_ATTEMPT_PRESERVES_VALID_LINK_AND_REPLAY_DENIED')
  const raced=await issue(emails[1])
  const pair=await Promise.all([0,1].map(()=>api.post(endpoint,{email:emails[1],token:raced},options)))
  expect(pair.map(r=>r.status).sort()).toEqual([200,401])
  record('ATOMIC_SINGLE_USE_CONCURRENT_CONFIRMATION')
  const burst=await Promise.all(Array.from({length:6},()=>api.post(endpoint,{email:emails[2]},options)))
  expect(burst.filter(r=>r.status===429)).toHaveLength(3)
  expect(links.get(emails[2])).toHaveLength(3)
  expect(burst.filter(r=>r.status===429).every(r=>Number(r.headers['retry-after'])>0)).toBe(true)
  record('SHARED_RECIPIENT_RATE_LIMIT')
  const expired=await issue(emails[3])
  await container.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw('update auth_link_state set expires_at = now() - interval \'1 second\' where id = ?',[sha256Hex(emails[3])])
  expect((await api.post(endpoint,{email:emails[3],token:expired},options)).status).toBe(401)
  record('EXPIRED_LINK_DENIED')
 } finally {spy.mockRestore()}
}
