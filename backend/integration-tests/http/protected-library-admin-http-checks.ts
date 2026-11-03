import { generateJwtToken, Modules } from '@medusajs/framework/utils'

/** Isolated native CI cluster only: no real customers, files, charges or e-mails. */
export async function verifyProtectedLibraryAdmin({api,container,options,evidence}:any) {
  const record=(scenario:string)=>evidence.push({scenario:`LIBRARY_ADMIN_${scenario}`,status:'PASS'})
  const products=container.resolve(Modules.PRODUCT)
  const [product,other]=await products.createProducts([
    {title:'Synthetic purchased library',metadata:{entitlement:true,unchanged:'retained',protected_media:[{key:'synthetic-library/a.mp4',title:'Before A',release_note:'retained'},{key:'synthetic-library/b.mp3',title:'Before B'}]}},
    {title:'Synthetic other library',metadata:{protected_media:[{key:'synthetic-other/private.mp4',title:'Other'}]}},
  ])
  const [user]=await container.resolve(Modules.USER).createUsers([{email:'library-admin@example.test'}])
  const [customer]=await container.resolve(Modules.CUSTOMER).createCustomers([{email:'library-customer@example.test'}])
  const auth=(id:string,type:string)=>({...options,headers:{...options.headers,Authorization:`Bearer ${generateJwtToken({actor_id:id,actor_type:type,auth_identity_id:`synthetic-${id}`,app_metadata:{[`${type}_id`]:id,session_epoch:0}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}})
  const admin=auth(user.id,'user'),buyer=auth(customer.id,'customer'),path=`/admin/products/${product.id}/protected-media`
  for(const opts of [options,buyer]) {
    expect((await api.get(path,opts)).status).toBe(401)
    expect((await api.post(path,{media:[]},opts)).status).toBe(401)
  }
  record('ADMIN_AUTH_ONLY')
  const before=(await api.get(path,admin)).data
  expect(before.media).toHaveLength(2);expect(before.unchanged).toBeUndefined()
  expect(JSON.stringify(before)).not.toContain('release_note')
  const request={revision:before.revision,media:[{key:'synthetic-library/b.mp3',title:'First audio'},{key:'synthetic-library/a.mp4',title:'Second video'}]}
  const updated=await api.post(path,request,admin)
  expect(updated.status).toBe(200);expect(updated.data.replayed).toBe(false)
  expect(updated.data.media.map((m:any)=>({key:m.key,title:m.title}))).toEqual(request.media)
  const saved=await products.retrieveProduct(product.id)
  expect(saved.metadata.unchanged).toBe('retained');expect(saved.metadata.entitlement).toBe(true)
  expect(saved.metadata.protected_media[1].release_note).toBe('retained')
  expect((await products.retrieveProduct(other.id)).metadata.protected_media[0].title).toBe('Other')
  record('RENAME_REORDER_PRESERVES_METADATA_AND_OTHER_PRODUCT')
  // The main editor omits the registry from its ordinary product save. Native metadata merging must retain it.
  expect((await api.post(`/admin/products/${product.id}`,{title:'Synthetic edited title',metadata:{unrelated_update:true}},admin)).status).toBe(200)
  expect((await api.get(path,admin)).data).toEqual({media:updated.data.media,revision:updated.data.revision})
  expect((await products.retrieveProduct(product.id)).metadata.unrelated_update).toBe(true)
  const replay=await api.post(path,request,admin)
  expect(replay.status).toBe(200);expect(replay.data.replayed).toBe(true)
  record('NATIVE_PRODUCT_SAVE_AND_REPLAY_KEEP_REGISTRY')
  expect((await api.post(path,{...request,media:before.media.map(({key,title}:any)=>({key,title}))},admin)).status).toBe(409)
  for(const media of [request.media.slice(1),[request.media[0],request.media[0]],[request.media[0],{key:'synthetic-other/private.mp4',title:'Do not attach'}]]) {
    expect((await api.post(path,{revision:updated.data.revision,media},admin)).status).toBe(409)
  }
  expect((await api.get(path,admin)).data.media).toEqual(updated.data.media)
  record('STALE_REMOVED_DUPLICATE_FOREIGN_KEYS_REJECTED')
  const raced=await Promise.all(['Window A','Window B'].map(title=>api.post(path,{revision:updated.data.revision,media:request.media.map((m:any,i:number)=>({...m,title:i===0?title:m.title}))},admin)))
  expect(raced.map((r:any)=>r.status).sort()).toEqual([200,409])
  const winner=raced.find((r:any)=>r.status===200).data
  expect((await api.get(path,admin)).data.media).toEqual(winner.media)
  record('CONCURRENT_EDITS_ACCEPT_ONE_WITHOUT_SILENT_OVERWRITE')
  await container.resolve('entitlement').grant({customer_id:customer.id,product_id:product.id,source:'admin',dedupe_key:`library-admin:${customer.id}:${product.id}`,tenant_id:'default'})
  const library=await api.get('/store/entitlements',buyer)
  expect(library.status).toBe(200)
  expect(library.data.entitlements.find((e:any)=>e.product_id===product.id).product.media).toEqual(winner.media)
  expect((await api.post('/store/media-access',{product_id:product.id,media_key:'synthetic-library/a.mp4'},buyer)).status).toBe(200)
  expect((await api.post('/store/media-access',{product_id:product.id,media_key:'synthetic-other/private.mp4'},buyer)).status).toBe(403)
  record('CUSTOMER_SEES_ORDERED_LABELS_WITH_UNCHANGED_GUARDS')
}
