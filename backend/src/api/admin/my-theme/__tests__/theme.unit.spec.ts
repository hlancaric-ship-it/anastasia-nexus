import { GET,POST } from '../route'
import { DEFAULT_THEME, THEME_METADATA_KEY } from '../../../../lib/admin-theme/policy'
const audit=jest.fn(async(..._args:unknown[])=>null)
jest.mock('../../../../lib/observability/audit',()=>({adminActor:(r:any)=>r.auth_context?.actor_type==='user'?r.auth_context.actor_id:null,auditAdminChange:(...args:any[])=>audit(...args)}))
function setup(body:unknown={selection:{...DEFAULT_THEME,scheme:'night'},revision:0}) {
  let user:any={id:'user_self',metadata:{unrelated:'keep'}}
  const users={retrieveUser:jest.fn(async()=>structuredClone(user)),updateUsers:jest.fn(async(data:any)=>{user={...user,...data};return structuredClone(user)})}
  const locking={execute:jest.fn(async(_key:string,job:()=>unknown)=>job())}
  const services:Record<string,unknown>={user:users,locking}
  const req:any={auth_context:{actor_type:'user',actor_id:'user_self'},body,scope:{resolve:(name:string)=>services[name]}}
  const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  return {req,res,users,locking,read:()=>user}
}
describe('Own admin theme API',()=>{
  beforeEach(()=>audit.mockClear())
  it('returns own preference only, never full user metadata',async()=>{
    const f=setup();await GET(f.req,f.res)
    expect(f.users.retrieveUser).toHaveBeenCalledWith('user_self')
    expect(f.res.json.mock.calls[0][0]).not.toHaveProperty('metadata')
    expect(f.res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  })
  it.each([GET,POST])('requires user authority before reading personal settings',async handler=>{
    const f=setup();f.req.auth_context={actor_type:'customer',actor_id:'user_self'};await handler(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(401);expect(f.users.retrieveUser).not.toHaveBeenCalled()
  })
  it('persists only own metadata, reads back and audits after success',async()=>{
    const f=setup();await POST(f.req,f.res)
    expect(f.users.updateUsers.mock.calls[0][0]).toMatchObject({id:'user_self',metadata:{unrelated:'keep',[THEME_METADATA_KEY]:{revision:1,selection:{scheme:'night'}}}})
    expect(f.users.retrieveUser).toHaveBeenCalledTimes(2);expect(audit).toHaveBeenCalledTimes(1)
    expect(f.res.json.mock.calls[0][0]).toMatchObject({revision:1,replayed:false})
  })
  it('returns replay without another write, even if the first response was lost',async()=>{
    const f=setup();await POST(f.req,f.res);await POST(f.req,f.res)
    expect(f.users.updateUsers).toHaveBeenCalledTimes(1);expect(audit).toHaveBeenCalledTimes(1)
    expect(f.res.json.mock.calls.at(-1)[0]).toMatchObject({revision:1,replayed:true})
  })
  it('rejects a stale edit without losing stored or unrelated preferences',async()=>{
    const f=setup();await POST(f.req,f.res);f.req.body.selection.scheme='wine';await POST(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(409);expect(f.users.updateUsers).toHaveBeenCalledTimes(1)
    expect(f.read().metadata.unrelated).toBe('keep')
  })
  it('does not accept another user ID or arbitrary CSS',async()=>{
    for(const body of [{selection:DEFAULT_THEME,revision:0,user_id:'user_other'},{selection:{...DEFAULT_THEME,accent:'url(https://bad.test)'},revision:0}]) {
      const f=setup(body);await POST(f.req,f.res);expect(f.res.status).toHaveBeenCalledWith(400);expect(f.users.retrieveUser).not.toHaveBeenCalled()
    }
  })
  it('does not report success when persistence/read-back fails',async()=>{
    const f=setup();f.users.updateUsers.mockRejectedValueOnce(new Error('SECRET_DATABASE_MESSAGE'))
    await POST(f.req,f.res);expect(f.res.status).toHaveBeenCalledWith(503);expect(audit).not.toHaveBeenCalled()
    expect(JSON.stringify(f.res.json.mock.calls)).not.toContain('SECRET_DATABASE_MESSAGE')
  })
})
