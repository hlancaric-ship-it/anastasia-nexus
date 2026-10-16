import type { MedusaContainer } from '@medusajs/framework/types'
import type MembershipModuleService from '../modules/membership/service'
import { MEMBERSHIP_MODULE } from '../modules/membership'
import { reconcileMembershipAccess } from '../lib/membership/access'
import { recordEvent } from '../lib/observability/events'
/** Recovers access after a missed event or crash; never initiates a payment. */
export default async function reconcileMembershipAccessJob(container:MedusaContainer){
 if(!container.hasRegistration(MEMBERSHIP_MODULE))return
 const service=container.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
 for(let offset=0;;offset+=50){
  const rows=await service.listMemberships({},{take:50,skip:offset,order:{id:'ASC'}})
  for(const row of rows){
   try{const result=await reconcileMembershipAccess(container,row.id);if(result.status!=='ACTIVE'&&result.status!=='EXPIRED')await recordEvent(container,'warn','entitlement','membership_access_reconcile_pending',{entity_id:row.id,membership_id:row.id,status:result.status})}
   catch{await recordEvent(container,'error','entitlement','membership_access_reconcile_failed',{entity_id:row.id,membership_id:row.id,error_code:'MEMBERSHIP_ACCESS_RECONCILE_FAILED'})}
  }
  if(rows.length<50)break
 }
}
export const config={name:'membership-access-reconcile',schedule:'*/10 * * * *'}
