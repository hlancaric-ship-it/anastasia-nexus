import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { generateJwtToken, Modules } from '@medusajs/framework/utils'
import { createProductCategoriesWorkflow, createProductsWorkflow, createRegionsWorkflow, createSalesChannelsWorkflow } from '@medusajs/medusa/core-flows'

// CI-only focused suite with its own disposable PostgreSQL service; synthetic data only.
if (process.env.CI !== 'true' || process.env.DB_USERNAME !== 'readiness_synthetic' || process.env.DB_HOST !== 'localhost' || process.env.DB_TEMP_NAME !== 'anastasia_readiness_ci') {
  throw new Error('Run only in the isolated admin-readiness CI workflow')
}
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return (listen as any).apply(this,args)} as any
jest.setTimeout(180_000)
medusaIntegrationTestRunner({dbName:'anastasia_readiness_ci',testSuite:({api,getContainer})=>{
  afterAll(()=>{Server.prototype.listen=listen})
  it('computes readiness from actual PostgreSQL data through admin HTTP, never guessing',async()=>{
    const container=getContainer()
    const [user]=await container.resolve(Modules.USER).createUsers([{email:'readiness@example.test'}])
    const admin={validateStatus:()=>true,headers:{Authorization:`Bearer ${generateJwtToken({actor_id:user.id,actor_type:'user',auth_identity_id:`synthetic-${user.id}`,app_metadata:{user_id:user.id}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}}
    const customer={validateStatus:()=>true,headers:{Authorization:`Bearer ${generateJwtToken({actor_id:'cus_synthetic',actor_type:'customer',auth_identity_id:'synthetic-cus',app_metadata:{customer_id:'cus_synthetic'}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}}
    expect((await api.get('/admin/readiness',{validateStatus:()=>true})).status).toBe(401)
    expect((await api.get('/admin/readiness',customer)).status).toBe(401)
    const byId=(data:any)=>Object.fromEntries(data.checks.map((c:any)=>[c.id,c]))

    // Empty store: every check is readable (no 'unknown' from a wrong field path) and blocks honestly.
    const empty=await api.get('/admin/readiness',admin)
    expect(empty.status).toBe(200);expect(empty.headers['cache-control']).toBe('no-store')
    expect(empty.data.checks.filter((c:any)=>c.status==='unknown').map((c:any)=>c.id)).toEqual([])
    expect(byId(empty.data)).toMatchObject({region_eur:{status:'problem'},products_published:{status:'problem'}})

    await createRegionsWorkflow(container).run({input:{regions:[{name:'Synthetic SK',currency_code:'eur',countries:['sk'],payment_providers:['pp_system_default']}]}})
    const {result:[channel]}=await createSalesChannelsWorkflow(container).run({input:{salesChannelsData:[{name:'Synthetic web'}]}})
    const {result:[category]}=await createProductCategoriesWorkflow(container).run({input:{product_categories:[{name:'Synthetic kategória',is_active:true}]}})
    const product=(title:string,complete:boolean)=>({title,status:'published' as const,...(complete?{thumbnail:'https://example.test/a.jpg',category_ids:[category.id],sales_channels:[{id:channel.id}]}:{}),options:[{title:'Default',values:['Default']}],variants:[{title:'Default',manage_inventory:false,options:{Default:'Default'},prices:complete?[{amount:50,currency_code:'eur'}]:[]}]})
    await createProductsWorkflow(container).run({input:{products:[product('Synthetic complete',true),product('Synthetic bare',false),{...product('Synthetic draft',false),status:'draft'}]}})

    const after=await api.get('/admin/readiness',admin)
    expect(after.status).toBe(200)
    expect(after.data.checks.filter((c:any)=>c.status==='unknown').map((c:any)=>c.id)).toEqual([])
    const c=byId(after.data)
    expect(c).toMatchObject({
      region_eur:{status:'ok',count:0},payment_provider:{status:'ok',count:0},products_published:{status:'ok',count:0},
      products_without_price:{status:'problem',count:1,severity:'blocker',href:'#/produkty'},
      products_without_channel:{status:'problem',count:1},products_without_image:{status:'problem',count:1},products_without_category:{status:'problem',count:1},
    })
    expect(after.data.summary.unknown).toBe(0)
  })
}})
