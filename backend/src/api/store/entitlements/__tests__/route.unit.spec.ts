import { GET } from '../route'
import { libraryMedia } from '../../../../lib/protected-library/catalog'

describe('private library catalogue', () => {
  it('returns only supported exact keys, deduplicated, without external or traversing paths', () => {
    expect(libraryMedia({ protected_media: ['p/audio.mp3', {key:'p/audio.mp3'}, {key:'p/book.pdf',title:' Book '}, '../other.mp4', '/public.mp4', 'p/../other.mp4', 'https://other/video.mp4', 'p/index.html', 'p/video.mp4?t=x'] })).toEqual([{key:'p/audio.mp3',title:'audio.mp3',kind:'audio'},{key:'p/book.pdf',title:'Book',kind:'document'}])
  })
  it('requires a customer before reading private data', async () => {
    const res = {status:jest.fn().mockReturnThis(),json:jest.fn()}
    await GET({auth_context:{actor_type:'user',actor_id:'admin'},scope:{resolve:jest.fn(()=>{throw Error('must not read')})}} as any,res as any)
    expect(res.status).toHaveBeenCalledWith(401)
  })
  it('resolves only the authenticated customer grants and exposes only their product registry', async () => {
    const list = jest.fn(async()=>({data:[{id:'ent_a',product_id:'prod_a',status:'active'}],count:1}))
    const graph = jest.fn(async(_input: any)=>({data:[{id:'prod_a',title:'Purchased',handle:'p',metadata:{protected_media:[{key:'p/a.mp3',title:'Audio'}],private_note:'must not return'}}]}))
    const res = {status:jest.fn().mockReturnThis(),json:jest.fn(),setHeader:jest.fn()}
    await GET({auth_context:{actor_type:'customer',actor_id:'cus_a'},query:{},scope:{resolve:(key:string)=>key==='entitlement'?{listActiveForCustomer:list}:key==='query'?{graph}:{error:jest.fn()}}} as any,res as any)
    expect(list).toHaveBeenCalledWith('cus_a',{limit:50,offset:0})
    expect(graph.mock.calls[0][0].filters).toEqual({id:['prod_a']})
    expect(res.status).toHaveBeenCalledWith(200)
    const result = res.json.mock.calls[0][0]
    expect(result.entitlements[0].product.media).toEqual([{key:'p/a.mp3',title:'Audio',kind:'audio'}])
    expect(JSON.stringify(result)).not.toContain('private_note')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store')
  })
})
