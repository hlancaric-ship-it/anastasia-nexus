import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { createProductsWorkflow } from '@medusajs/medusa/core-flows'
/** Unsupported native restrictions must be rejected before NEXUS can discount every cart line. */
export async function verifyCouponSecurity({api,container,options,channel,region,profile,evidence}:any) {
 const {result:products}=await createProductsWorkflow(container).run({input:{products:[{
  title:'Synthetic restricted coupon',handle:'synthetic-security-coupon',status:'published',shipping_profile_id:profile.id,
  sales_channels:[{id:channel.id}],options:[{title:'Default',values:['Default']}],variants:[{title:'Default',sku:'SECURITY-COUPON',manage_inventory:false,options:{Default:'Default'},prices:[{amount:50,currency_code:'eur'}]}],
 }]}})
 const customer=await container.resolve(Modules.CUSTOMER).createCustomers({email:'security-coupon-owner@example.test'})
 const query=container.resolve(ContainerRegistrationKeys.QUERY)
 for(const kind of ['customer','product','quantity']) {
  const code=`SECURITY-RESTRICTED-${kind.toUpperCase()}`
  await container.resolve(Modules.PROMOTION).createPromotions({code,type:'standard',status:'active',limit:10,
   rules:kind==='customer'?[{attribute:'customer_id',operator:'eq',values:[customer.id]}]:[],
   application_method:{type:'percentage',value:10,target_type:'items',allocation:kind==='quantity'?'each':'across',
    ...(kind==='quantity'?{max_quantity:1}:{}),
    target_rules:kind==='product'?[{attribute:'product_id',operator:'eq',values:['synthetic-other-product']}]:[]},
  })
  const created=await api.post('/store/carts',{region_id:region.id,email:'security-coupon-ineligible@example.test'},options)
  expect(created.status).toBe(200)
  const id=created.data.cart.id
  expect((await api.post(`/store/carts/${id}/line-items`,{variant_id:products[0].variants[0].id,quantity:1},options)).status).toBe(200)
  const response=await api.post('/store/nexus-cart',{cart_id:id,couponCode:code},options)
  expect(response.status).toBe(400)
  expect(response.data.error).toBe('COUPON_INVALID')
  const {data}=await query.graph({entity:'cart',fields:['id','metadata','items.unit_price','completed_at'],filters:{id}})
  expect(data[0].metadata?.nexus_coupon).toBeFalsy()
  expect(Number(data[0].items[0].unit_price)).toBe(50)
  expect(data[0].completed_at).toBeNull()
  evidence.push({scenario:`SECURITY_COUPON_${kind.toUpperCase()}_RESTRICTION_FAILS_CLOSED`,status:'PASS'})
 }
}
