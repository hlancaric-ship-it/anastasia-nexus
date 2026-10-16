import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { generateJwtToken, Modules } from '@medusajs/framework/utils'
import { DEFAULT_THEME, THEME_METADATA_KEY } from '../../src/lib/admin-theme/policy'

// This focused suite is CI-only and uses its own disposable PostgreSQL service.
if (process.env.CI !== 'true' || process.env.DB_USERNAME !== 'theme_synthetic' || process.env.DB_HOST !== 'localhost' || process.env.DB_TEMP_NAME !== 'anastasia_theme_ci') {
  throw new Error('Run only in the isolated admin-theme CI workflow')
}
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return (listen as any).apply(this,args)} as any
jest.setTimeout(180_000)
medusaIntegrationTestRunner({dbName:'anastasia_theme_ci',testSuite:({api,getContainer})=>{
  afterAll(()=>{Server.prototype.listen=listen})
  it('persists personal appearance through actual admin HTTP, prevents cross-user writes, and rejects stale concurrent saves',async()=>{
    const users=getContainer().resolve(Modules.USER)
    const created=await users.createUsers([{email:'theme-self@example.test',metadata:{unrelated:'keep'}},{email:'theme-other@example.test',metadata:{unrelated:'other'}}])
    const user=created[0],other=created[1]
    const auth=(id:string,actor='user')=>({headers:{Authorization:`Bearer ${generateJwtToken({actor_id:id,actor_type:actor,auth_identity_id:`synthetic-${id}`,app_metadata:{user_id:id}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}})
    const admin=auth(user.id)
    expect((await api.get('/admin/my-theme')).status).toBe(401)
    expect((await api.post('/admin/my-theme',{selection:DEFAULT_THEME,revision:0},auth(other.id,'customer'))).status).toBe(401)
    const original=await api.get('/admin/my-theme',admin)
    expect(original.status).toBe(200);expect(original.data.selection).toEqual(DEFAULT_THEME)
    expect(original.headers['cache-control']).toBe('no-store');expect(original.data).not.toHaveProperty('metadata')
    const night={...DEFAULT_THEME,scheme:'night'}
    expect((await api.post('/admin/my-theme',{selection:night,revision:0,user_id:other.id},admin)).status).toBe(400)
    const saved=await api.post('/admin/my-theme',{selection:night,revision:0},admin)
    expect(saved.status).toBe(200);expect(saved.data.revision).toBe(1)
    expect((await users.retrieveUser(user.id)).metadata).toMatchObject({unrelated:'keep',[THEME_METADATA_KEY]:{revision:1,selection:night}})
    expect((await users.retrieveUser(other.id)).metadata).toEqual({unrelated:'other'})
    expect((await api.get('/admin/my-theme',auth(other.id))).data.selection).toEqual(DEFAULT_THEME)
    expect((await api.get('/admin/my-theme',admin)).data.selection).toEqual(night)
    const replay=await api.post('/admin/my-theme',{selection:night,revision:0},admin)
    expect(replay.status).toBe(200);expect(replay.data).toMatchObject({revision:1,replayed:true})
    const race=await Promise.all(['forest','wine'].map(scheme=>api.post('/admin/my-theme',{selection:{...DEFAULT_THEME,scheme},revision:1},admin)))
    expect(race.map(r=>r.status).sort()).toEqual([200,409])
    const current=await api.get('/admin/my-theme',admin)
    expect(current.data.revision).toBe(2)
    expect(['forest','wine']).toContain(current.data.selection.scheme)
    expect((await api.post('/admin/my-theme',{selection:{...DEFAULT_THEME,accent:'url(https://bad.example.test)'},revision:2},admin)).status).toBe(400)
    expect((await users.retrieveUser(user.id)).metadata?.unrelated).toBe('keep')
  })
}})
