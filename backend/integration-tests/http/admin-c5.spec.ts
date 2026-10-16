import { Server } from 'node:net'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { generateJwtToken, Modules } from '@medusajs/framework/utils'
import { categoryInput, couponInput, customerInput, listUrl, orderInput, productInput, resources } from '../../src/admin/lib/shop'

if (process.env.CI !== 'true' || process.env.DB_USERNAME !== 'c5_synthetic' || process.env.DB_HOST !== 'localhost' || process.env.DB_TEMP_NAME !== 'anastasia_c5_ci') throw new Error('Run only in the isolated admin-c5 CI workflow')
const listen=Server.prototype.listen
Server.prototype.listen=function(...args:any[]){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return (listen as any).apply(this,args)} as any
jest.setTimeout(180_000)
medusaIntegrationTestRunner({dbName:'anastasia_c5_ci',testSuite:({api,getContainer})=>{
 afterAll(()=>{Server.prototype.listen=listen})
 it('creates and edits all six agendas through native admin contracts, preserving price lists and unrelated state',async()=>{
  const container=getContainer()
  const user=await container.resolve(Modules.USER).createUsers({email:'c5-admin@example.test'})
  const auth={validateStatus:()=>true,headers:{Authorization:`Bearer ${generateJwtToken({actor_id:user.id,actor_type:'user',auth_identity_id:'synthetic-c5',app_metadata:{user_id:user.id}},{secret:process.env.JWT_SECRET!,expiresIn:'1h'})}`}}
  const ok=(r:any)=>{expect({status:r.status,error:r.status>=400?r.data:undefined}).toEqual({status:200,error:undefined});return r.data}
  const post=async(path:string,body:any)=>ok(await api.post(path,body,auth))
  const get=async(path:string)=>ok(await api.get(path,auth))
  const category=(await post('/admin/product-categories',categoryInput({name:'C5 syntetická kategória',is_active:'true'}))).product_category
  const editedCategory=(await post(`/admin/product-categories/${category.id}`,categoryInput({name:'C5 upravená kategória',is_active:'true'},category))).product_category
  expect(editedCategory.name).toBe('C5 upravená kategória')
  const channel=await container.resolve(Modules.SALES_CHANNEL).createSalesChannels({name:'C5 synthetic channel'})
  const profile=await container.resolve(Modules.FULFILLMENT).createShippingProfiles({name:'C5 synthetic shipping',type:'default'})
  const context={channel:channel.id,profile:profile.id}
  const created=(await post('/admin/products',productInput({title:'C5 syntetický produkt',status:'draft',amount:'50',categories:category.id},undefined,context))).product
  let product=(await get(`/admin/products/${created.id}?${new URLSearchParams({fields:resources.ceny.fields!})}`)).product
  const variant=product.variants[0],price=variant.prices[0]
  expect(price.amount).toBe(50)
  expect((await get(`/admin/products/${created.id}`)).product.variants[0].manage_inventory).toBe(true)
  await post(`/admin/products/${created.id}`,productInput({title:'C5 upravený produkt',description:'Čistý text',status:'draft',categories:category.id},product))
  const pricing=container.resolve(Modules.PRICING)
  const query=container.resolve('query')
  const {data}=await query.graph({entity:'product_variant',fields:['id','price_set.id'],filters:{id:variant.id}})
  const setId=data[0].price_set.id
  const [list]=await pricing.createPriceLists([{title:'C5 personal list',description:'Synthetic preservation check',type:'sale',status:'active',prices:[{price_set_id:setId,currency_code:'eur',amount:45}]}])
  const before=await pricing.listPrices({price_set_id:[setId]},{relations:['price_list'],take:null})
  expect(before.some((p:any)=>p.price_list?.id===list.id)).toBe(true)
  const changed=await post(`/admin/shop-prices/${variant.id}`,{price_id:price.id,amount:42.5,expected_amount:50})
  expect(changed.price.amount).toBe(42.5)
  expect((await api.post(`/admin/shop-prices/${variant.id}`,{price_id:price.id,amount:1,expected_amount:50},auth)).status).toBe(409)
  expect((await api.post(`/admin/shop-prices/${variant.id}`,{price_id:price.id,amount:-1,expected_amount:42.5},auth)).status).toBe(400)
  expect((await api.post(`/admin/shop-prices/${variant.id}`,{price_id:price.id,amount:1,expected_amount:42.5},{validateStatus:()=>true})).status).toBe(401)
  const after=await pricing.listPrices({price_set_id:[setId]},{relations:['price_list'],take:null})
  expect(after.find((p:any)=>p.price_list?.id===list.id)?.amount).toBe(45)
  product=(await get(`/admin/products/${created.id}?${new URLSearchParams({fields:resources.ceny.fields!})}`)).product
  expect(product.title).toBe('C5 upravený produkt')
  expect(product.variants[0].prices.find((p:any)=>p.id===price.id).amount).toBe(42.5)
  const coupon=(await post('/admin/promotions',couponInput({code:'C5TEST10',value:'10',status:'draft',limit:'5'}))).promotion
  const freshCoupon=(await get(`/admin/promotions/${coupon.id}?${new URLSearchParams({fields:resources.kupony.fields!})}`)).promotion
  await post(`/admin/promotions/${coupon.id}`,couponInput({code:'C5TEST10',value:'15',status:'active',limit:'5'},freshCoupon))
  expect((await get(`/admin/promotions/${coupon.id}`)).promotion.status).toBe('active')
  const customer=(await post('/admin/customers',customerInput({first_name:'Syntetická',last_name:'Ukážka',email:'c5-customer@example.test'}))).customer
  await post(`/admin/customers/${customer.id}`,customerInput({first_name:'Upravená',last_name:'Ukážka',email:'c5-customer@example.test'}))
  expect((await get(`/admin/customers/${customer.id}`)).customer.first_name).toBe('Upravená')
  const order=await container.resolve(Modules.ORDER).createOrders({currency_code:'eur',email:'c5-customer@example.test',customer_id:customer.id,metadata:{legal:'keep'},items:[]})
  const freshOrder=(await get(`/admin/orders/${order.id}`)).order
  await post(`/admin/orders/${order.id}`,orderInput({email:'c5-contact@example.test',note:'C5 poznámka'},freshOrder))
  const savedOrder=(await get(`/admin/orders/${order.id}`)).order
  expect(savedOrder.metadata).toMatchObject({legal:'keep',shop_admin_note:'C5 poznámka'})
  expect(savedOrder.status).toBe(freshOrder.status)
  expect(savedOrder.total).toBe(freshOrder.total)
  for(const section of ['produkty','ceny','kategorie','kupony','objednavky','zakaznicky'] as const){const response=await get(listUrl(section));expect(response.count).toBeGreaterThan(0);expect(Array.isArray(response[resources[section].key])).toBe(true)}
  expect((await get(listUrl('produkty','C5 upravený produkt'))).products.some((p:any)=>p.id===created.id)).toBe(true)
 })
}})
