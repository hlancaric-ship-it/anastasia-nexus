import type { AuthenticatedMedusaRequest,MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'
import { MEMBERSHIP_MODULE } from '../../../modules/membership'
import type MembershipModuleService from '../../../modules/membership/service'
import { orderDedupeKey } from '../../../modules/entitlement/policy'
import { adminActor } from '../../../lib/observability/audit'
import { membershipConfig,membershipPage,publicMembership,publicCheckout,membershipAccessStatus,publicBillingAttempt } from '../../../lib/membership/admin'
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){
 res.setHeader('Cache-Control','no-store')
 if(!adminActor(req))return res.status(401).json({message:'Prihláste sa do administrácie.'})
 const parsed=membershipPage.safeParse(req.query)
 if(!parsed.success)return res.status(400).json({message:'Skontrolujte vyhľadávanie a číslo strany.'})
 const {tab,offset,limit,q}=parsed.data
 try{
  if(tab==='products'){
   const [rows,count]=await (req.scope.resolve(Modules.PRODUCT) as any).listAndCountProducts(q?{q}:{},{select:['id','title','metadata','status'],skip:offset,take:limit,order:{id:'ASC'}})
   return res.json({items:rows.map((row:any)=>{const raw=row.metadata?.membership??null,configuration=membershipConfig.safeParse(raw);return {id:row.id,title:row.title,status:row.status,configuration:configuration.success?configuration.data:null,configuration_invalid:raw!==null&&!configuration.success}}),count,offset,limit})
  }
  const service=req.scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
  if(tab==='billing'){const [rows,count]=await (service as any).listAndCountMembershipBillingAttempts(q?{membership_id:q}:{},{skip:offset,take:limit,order:{created_at:'DESC'}});return res.json({items:rows.map(publicBillingAttempt),count,offset,limit})}
  const filter=q?{customer_id:q}:{}
  const [rows,count]=tab==='memberships'?await service.listAndCountMemberships(filter,{skip:offset,take:limit,order:{id:'ASC'}}):await service.listAndCountMembershipCheckouts(filter,{skip:offset,take:limit,order:{id:'ASC'}})
  const items:any[]=rows.map(row=>tab==='memberships'?publicMembership(row):publicCheckout(row))
  if(items.length){
   const ids=[...new Set(items.map(row=>row.customer_id))]
   const customers=await (req.scope.resolve(Modules.CUSTOMER) as any).listCustomers({id:ids},{select:['id','first_name','last_name','email'],take:limit})
   for(const item of items){const customer=customers.find((c:any)=>c.id===item.customer_id);item.customer_label=customer?[customer.first_name,customer.last_name].filter(Boolean).join(' ')||customer.email:'Zákazníka už nie je dostupná'}
   if(tab==='memberships'){
    const products=await (req.scope.resolve(Modules.PRODUCT) as any).listProducts({id:[...new Set(items.map(row=>row.product_id))]},{select:['id','title'],take:limit})
    for(const item of items){item.title=products.find((p:any)=>p.id===item.product_id)?.title??'Členstvo k nedostupnému produktu';const right=await (req.scope.resolve('entitlement') as any).findByDedupeKey(orderDedupeKey(item.last_order_id,item.product_id));item.access_status=membershipAccessStatus(item,right)}
   }
  }
  return res.json({items,count,offset,limit})
 }catch{return res.status(503).json({message:'Členstvá teraz nemožno načítať. Obnovte údaje; platbu neopakujte.'})}
}
