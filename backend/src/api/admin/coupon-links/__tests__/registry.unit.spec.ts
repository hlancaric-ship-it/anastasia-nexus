jest.mock('../registry',()=>({...jest.requireActual('../registry'),getRecord:jest.fn(),saveRecord:jest.fn()}))
import { legacyLink, recordId, pageInput, importInput, tenant } from '../registry'
import * as registry from '../registry'
import { GET as download } from '../[id]/qr/route'
import { GET as list } from '../route'
import { POST as importing } from '../import/route'
import { POST as deactivate } from '../[id]/deactivate/route'
import { localQrRenderer } from '../links'
const response=()=>({setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()}) as any
const auth_context={actor_id:'user_synthetic',actor_type:'user'}
const names=['COUPON_LINK_STOREFRONT_ORIGIN','COUPON_LINK_LEGACY_ORIGINS','NEXUS_TENANT_ID']
const previous=names.map(k=>process.env[k])
beforeEach(()=>{process.env[names[0]]='https://shop.example';process.env[names[1]]='http://old.example,https://old.example';process.env[names[2]]='synthetic'})
afterEach(()=>{jest.restoreAllMocks();jest.clearAllMocks();names.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i]})})
it('decodes legacy codes and preserves legacy quantity semantics',()=>{
 expect(legacyLink('http://old.example/eshop/kosik?produkt=KO.001&kupon=%C5%BD%2B%26&ks=10000')).toEqual({produkt:'KO.001',kupon:'Ž+&',ks:999})
 expect(legacyLink('https://old.example/eshop/kosik/?produkt=A&kupon=B&ks=bad').ks).toBe(1)
})
it.each([
 'https://evil.example/eshop/kosik?produkt=A&kupon=B','https://old.example@evil.example/eshop/kosik?produkt=A&kupon=B',
 'https://u:p@old.example/eshop/kosik?produkt=A&kupon=B','javascript:alert(1)',
 'https://old.example/other?produkt=A&kupon=B','https://old.example/eshop/kosik?produkt=A&kupon=B#fragment',
 'https://old.example/eshop/kosik?produkt=A&kupon=B&kupon=C','https://old.example/eshop/kosik?produkt=A&kupon=B&price=1',
 'https://old.example/eshop/kosik?produkt=&kupon=B',
])('rejects unsupported or ambiguous URL %s',url=>expect(()=>legacyLink(url)).toThrow())
it('makes saved link identity stable and tenant bound',()=>{
 const url='https://shop.example/eshop/kosik?produkt=A&kupon=B'
 expect(recordId('one',url)).toBe(recordId('one',url))
 expect(recordId('one',url)).not.toBe(recordId('two',url))
 expect(recordId('one',url)).not.toBe(recordId('one',url+'&ks=1'))
 expect(recordId('one',url)).toMatch(/^qrl_[a-f0-9]{64}$/)
})
it('fails closed without server tenant and rejects client tenant override',()=>{
 delete process.env.NEXUS_TENANT_ID;expect(tenant).toThrow()
 expect(pageInput.safeParse({tenant_id:'other'}).success).toBe(false)
})
it('bounds requests and defaults imports to preview',()=>{
 expect(pageInput.parse({})).toEqual({limit:25,offset:0,q:''})
 for(const q of [{limit:101},{offset:-1},{limit:'1.5'}])expect(pageInput.safeParse(q).success).toBe(false)
 const row={url:'https://shop.example/eshop/kosik?produkt=A&kupon=B'}
 expect(importInput.parse({links:[row]}).dry_run).toBe(true)
 expect(importInput.safeParse({links:Array(101).fill(row)}).success).toBe(false)
})
it.each([download,list,importing,deactivate])('rejects customer credentials in every registry handler',async handler=>{
 const res=response();await handler({auth_context:{actor_id:'cus_synthetic',actor_type:'customer'}} as any,res)
 expect(res.status).toHaveBeenCalledWith(401);expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
})
it('downloads the exact saved URL without promotion lookups or mutations',async()=>{
 const url='http://old.example/eshop/kosik?kupon=OLD&produkt=A&ks=2'
 jest.spyOn(registry,'getRecord').mockResolvedValue({url} as any)
 const render=jest.spyOn(localQrRenderer,'render').mockResolvedValue({mime_type:'image/png',base64:'synthetic'})
 const scope={resolve:jest.fn()},res=response()
 await download({auth_context,scope,params:{id:'qrl_'+'a'.repeat(64)},query:{format:'png'}} as any,res)
 expect(render).toHaveBeenCalledWith(url,'png');expect(scope.resolve).not.toHaveBeenCalled()
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({url}))
})
it('returns 404 for a record outside the visible tenant',async()=>{
 jest.spyOn(registry,'getRecord').mockResolvedValue(undefined)
 const res=response();await download({auth_context,params:{id:'qrl_'+'b'.repeat(64)},query:{}} as any,res)
 expect(res.status).toHaveBeenCalledWith(404)
})
it('validates all imported links before writing anything',async()=>{
 const save=jest.spyOn(registry,'saveRecord'),res=response()
 await importing({auth_context,body:{dry_run:false,links:[{url:'https://shop.example/eshop/kosik?produkt=A&kupon=B'},{url:'https://evil.example/eshop/kosik?produkt=A&kupon=B'}]}} as any,res)
 expect(res.status).toHaveBeenCalledWith(400);expect(save).not.toHaveBeenCalled()
})
it('requires exact confirmation before changing a shared coupon',async()=>{
 jest.spyOn(registry,'getRecord').mockResolvedValue({coupon_code:'KEEP'} as any)
 const scope={resolve:jest.fn()},res=response()
 await deactivate({auth_context,scope,params:{id:'id'},body:{confirmation:'WRONG'}} as any,res)
 expect(res.status).toHaveBeenCalledWith(409);expect(scope.resolve).not.toHaveBeenCalled()
})
