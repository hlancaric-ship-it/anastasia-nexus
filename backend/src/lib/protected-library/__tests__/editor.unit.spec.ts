import { GET, POST } from '../../../api/admin/products/[id]/protected-media/route'
import { librarySnapshot, libraryWrite } from '../editor'
import { auditAdminChange } from '../../observability/audit'
jest.mock('../../observability/audit', () => ({
  adminActor: (r: any) => r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null,
  auditAdminChange: jest.fn(async () => null),
}))
const initial = [{key:'program/a.mp4',title:'Video A',private_option:'retained'}, {key:'program/b.mp3',title:'Audio B'}]
function fixture() {
  const product: any = {id:'prod_test',metadata:{entitlement:true,untouched:{value:1},protected_media:structuredClone(initial)}}
  const products = {updateProducts:jest.fn(async (_: unknown, patch:any)=>{ product.metadata={...product.metadata,...patch.metadata} })}
  const query = {graph:jest.fn(async()=>({data:product ? [product]:[]}))}
  const lock={execute:jest.fn(async (_:string, fn:()=>any)=>fn())}
  const req: any = {params:{id:product.id},auth_context:{actor_type:'user',actor_id:'user_test'},scope:{resolve:(key:string)=>({product:products,locking:lock,query} as any)[key]},body:{revision:librarySnapshot(product.metadata).revision,media:[{key:'program/b.mp3',title:'First'},{key:'program/a.mp4',title:'Second'}]}}
  const res:any={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}
  return {req,res,product,products,query,lock}
}
beforeEach(()=>jest.clearAllMocks())
describe('Product-local purchased content editor',()=>{
  it.each([GET,POST])('rejects customers and unauthenticated actors before any read/write',async route=>{
    for(const auth_context of [undefined,{actor_type:'customer',actor_id:'cus_test'}]){
      const f=fixture();f.req.auth_context=auth_context;await route(f.req,f.res)
      expect(f.res.status).toHaveBeenCalledWith(401);expect(f.query.graph).not.toHaveBeenCalled();expect(f.products.updateProducts).not.toHaveBeenCalled()
    }
  })
  it('reads only a safe registry and revision, never other product metadata',async()=>{
    const f=fixture();await GET(f.req,f.res)
    expect(f.res.json).toHaveBeenCalledWith(librarySnapshot(f.product.metadata))
    expect(f.res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store')
    expect(f.res.json.mock.calls[0][0].untouched).toBeUndefined()
  })
  it.each([GET,POST])('returns 404 for a missing product',async route=>{
    const f=fixture();f.query.graph.mockResolvedValue({data:[]});await route(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(404);expect(f.products.updateProducts).not.toHaveBeenCalled()
  })
  it('renames/reorders under the lock, preserving per-file metadata and unrelated product fields',async()=>{
    const f=fixture();await POST(f.req,f.res)
    expect(f.lock.execute).toHaveBeenCalledWith('protected-library:prod_test',expect.any(Function))
    expect(f.products.updateProducts).toHaveBeenCalledWith('prod_test',{metadata:{protected_media:[{key:'program/b.mp3',title:'First'},{key:'program/a.mp4',title:'Second',private_option:'retained'}]}})
    expect(f.product.metadata.untouched).toEqual({value:1});expect(f.product.metadata.entitlement).toBe(true)
    expect(f.query.graph).toHaveBeenCalledTimes(2);expect(auditAdminChange).toHaveBeenCalledTimes(1)
  })
  it('replays a completed write without updating again or duplicating audit',async()=>{
    const f=fixture();await POST(f.req,f.res);await POST(f.req,f.res)
    expect(f.products.updateProducts).toHaveBeenCalledTimes(1);expect(auditAdminChange).toHaveBeenCalledTimes(1)
    expect(f.res.json.mock.calls[1][0].replayed).toBe(true)
  })
  it.each(['stale','other-product','removed','duplicate','invalid-existing'])('rejects %s without changing metadata',async kind=>{
    const f=fixture()
    if(kind==='stale')f.product.metadata.protected_media[0].title='Someone else edited'
    if(kind==='other-product')f.req.body.media[0].key='other-program/secret.mp3'
    if(kind==='removed')f.req.body.media.pop()
    if(kind==='duplicate')f.req.body.media[1].key=f.req.body.media[0].key
    if(kind==='invalid-existing')f.product.metadata.protected_media.push({key:'../secret.mp4'})
    const before=structuredClone(f.product.metadata);await POST(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(409);expect(f.products.updateProducts).not.toHaveBeenCalled();expect(f.product.metadata).toEqual(before)
  })
  it.each(['','   ','x'.repeat(201),'bad\u0000title'])('rejects invalid labels before a product read',async title=>{
    const f=fixture();f.req.body.media[0].title=title;await POST(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(400);expect(f.query.graph).not.toHaveBeenCalled()
  })
  it('rejects unknown payload fields and an oversized registry',()=>{
    const f=fixture();expect(libraryWrite.safeParse({...f.req.body,price:0}).success).toBe(false)
    expect(libraryWrite.safeParse({...f.req.body,media:Array(201).fill(f.req.body.media[0])}).success).toBe(false)
  })
  it('fails closed on write/readback failures without reporting saved',async()=>{
    const f=fixture();f.products.updateProducts.mockImplementation(async()=>{});await POST(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(503);expect(auditAdminChange).not.toHaveBeenCalled()
  })
  it('retains current registry when data storage is unavailable',async()=>{
    const f=fixture();f.query.graph.mockRejectedValue(Error('unavailable'));await GET(f.req,f.res)
    expect(f.res.status).toHaveBeenCalledWith(503)
  })
})
