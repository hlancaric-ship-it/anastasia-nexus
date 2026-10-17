import type { MedusaContainer } from '@medusajs/framework/types'
import { MEMBERSHIP_MODULE } from '../modules/membership'
import type MembershipModuleService from '../modules/membership/service'
import { recoverMembershipMandates,runMembershipBilling } from '../lib/membership/billing'
import { recordEvent } from '../lib/observability/events'
export default async function membershipBillingJob(scope:MedusaContainer){
 if(!scope.hasRegistration(MEMBERSHIP_MODULE))return
 const service=scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
 await recoverMembershipMandates(scope)
 let cursor:string|undefined
 for(;;){
  const rows=await service.listMemberships({...(cursor?{id:{$gt:cursor}}:{})},{take:50,order:{id:'ASC'}})
  for(const row of rows)try{
   const result=await runMembershipBilling(scope,row.id)
   if(result.status!=='NOT_DUE')await recordEvent(scope,result.status==='SETTLED'?'info':'warn','entitlement','membership_billing_result',{entity_id:row.id,status:result.status})
  }catch{await recordEvent(scope,'error','entitlement','membership_billing_failed',{entity_id:row.id,error_code:'MEMBERSHIP_BILLING_RECONCILIATION_REQUIRED'})}
  if(rows.length<50)break;cursor=rows[rows.length-1].id
 }
}
export const config={name:'membership-billing',schedule:'*/10 * * * *'}
