jest.mock('../../../api/store/nexus-cart/route',()=>({repriceCart:jest.fn(async()=>({pricesChanged:false}))}))
jest.mock('../access',()=>({reconcileMembershipAccess:jest.fn(async()=>({status:'ACTIVE'}))}))
jest.mock('../native-receipt',()=>({...jest.requireActual('../native-receipt'),loadNativeMembershipReceipt:jest.fn(async()=>({order_id:'ord_a',checkout_key:'initial:ord_a'}))}))
import {prepareMembershipCheckout,settleMembershipCheckout} from '../checkout'
import {repriceCart} from '../../../api/store/nexus-cart/route'
import {loadNativeMembershipReceipt} from '../native-receipt'
function fixture(){
 const cart:any={id:'cart_a',customer_id:'cus_a',currency_code:'eur',completed_at:null,total:50,items:[{product_id:'prod_a',variant_id:'var_a',quantity:{numeric:1}}]}
 const product:any={id:'prod_a',status:'published',metadata:{membership:{version:'v1',period_days:30}}}
 const pc:any={payment_sessions:[],payments:[]}
 const links:any[]=[]
 const query={graph:jest.fn(async({entity}:any)=>({data:entity==='order_cart'?links:[{id:'cart_a',payment_collection:pc}]}))}
 const membership={reserveCheckout:jest.fn(async(c:any)=>({id:'mck_a',contract:c,status:'prepared'})),checkoutForCustomer:jest.fn(async()=>({contract:{cart_id:'cart_a',terms:{product_id:'prod_a',variant_id:'var_a'},consent:{auto_renew:false}}})),settleCheckout:jest.fn(async()=>({state:{id:'mbr_a'}}))}
 const locking={execute:jest.fn(async(_key:string,fn:any)=>fn())}
 const scope:any={resolve:(key:string)=>({query,cart:{retrieveCart:async()=>cart},product:{retrieveProduct:async()=>product},locking,membership} as any)[key]}
 return {cart,product,pc,links,query,membership,locking,scope}
}
const approval={version:'v1',amount_minor:5000,auto_renew:true}
beforeEach(()=>jest.clearAllMocks())
describe('native membership checkout adapter boundaries',()=>{
 it('reprices through NEXUS and persists server facts before any session',async()=>{
  const f=fixture(),r=await prepareMembershipCheckout(f.scope,'cart_a','cus_a',approval)
  expect(repriceCart).toHaveBeenCalledWith('cart_a',f.scope,true,undefined,'cus_a')
  expect(f.locking.execute.mock.calls[0][0]).toBe('cart_a')
  expect(r.contract).toMatchObject({cart_id:'cart_a',terms:{customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',period_days:30,amount_minor:5000,currency:'eur'},consent:{version:'v1',auto_renew:true}})
 })
 it.each(['foreign','completed','mixed','quantity','payment','ordered','unpublished','unconfigured','amount','version'])('fails closed before enrollment: %s',async kind=>{
  const f=fixture(),a={...approval}
  if(kind==='foreign')f.cart.customer_id='cus_other'
  if(kind==='completed')f.cart.completed_at=new Date()
  if(kind==='mixed')f.cart.items.push({...f.cart.items[0]})
  if(kind==='quantity')f.cart.items[0].quantity={numeric:2}
  if(kind==='payment')f.pc.payment_sessions.push({id:'ps_a'})
  if(kind==='ordered')f.links.push({cart_id:'cart_a',order_id:'ord_a'})
  if(kind==='unpublished')f.product.status='draft'
  if(kind==='unconfigured')delete f.product.metadata.membership
  if(kind==='amount')a.amount_minor=4900
  if(kind==='version')a.version='v2'
  await expect(prepareMembershipCheckout(f.scope,'cart_a','cus_a',a)).rejects.toThrow()
  expect(f.membership.reserveCheckout).not.toHaveBeenCalled()
 })
 it('rechecks native facts after repricing and never saves a cart completed in between',async()=>{
  const f=fixture();jest.mocked(repriceCart).mockImplementationOnce(async()=>{f.cart.completed_at=new Date();return {} as any})
  await expect(prepareMembershipCheckout(f.scope,'cart_a','cus_a',approval)).rejects.toThrow('NOT_ELIGIBLE')
  expect(f.membership.reserveCheckout).not.toHaveBeenCalled()
 })
 it('settles only the order linked to the persisted own cart',async()=>{
  const f=fixture();f.links.push({cart_id:'cart_a',order_id:'ord_a'})
  expect(await settleMembershipCheckout(f.scope,'mck_a','cus_a')).toMatchObject({status:'SETTLED',membership_id:'mbr_a',access:{status:'ACTIVE'}})
  expect(loadNativeMembershipReceipt).toHaveBeenCalledWith(f.scope,'ord_a',{cart_id:'cart_a',customer_id:'cus_a',product_id:'prod_a',variant_id:'var_a',checkout_key:'initial:ord_a'},expect.any(Date))
 })
 it('keeps missing native order pending without a second checkout or charge',async()=>{
  const f=fixture();expect(await settleMembershipCheckout(f.scope,'mck_a','cus_a')).toEqual({status:'PENDING'})
  expect(f.membership.settleCheckout).not.toHaveBeenCalled();expect(repriceCart).not.toHaveBeenCalled()
 })
 it('does not touch another customer checkout',async()=>{
  const f=fixture();f.membership.checkoutForCustomer.mockResolvedValueOnce(null as any)
  await expect(settleMembershipCheckout(f.scope,'mck_a','cus_other')).rejects.toThrow('NOT_FOUND')
  expect(f.query.graph).not.toHaveBeenCalled()
 })
 it('refuses ambiguous native orders',async()=>{
  const f=fixture();f.links.push({cart_id:'cart_a',order_id:'ord_a'},{cart_id:'cart_a',order_id:'ord_b'})
  await expect(settleMembershipCheckout(f.scope,'mck_a','cus_a')).rejects.toThrow('AMBIGUOUS')
 })
})
