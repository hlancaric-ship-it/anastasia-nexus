import {ContainerRegistrationKeys,Modules,MedusaError} from '@medusajs/framework/utils'
/** Same persistent tombstone as Store privacy middleware, also for jobs and webhooks. */
export async function assertMembershipCustomerAvailable(scope:any,customerId:string){
 let erased:unknown
 try{const db=scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);erased=await db('customer_erasure').where({customer_id:customerId}).whereNull('deleted_at').whereIn('status',['processing','completed']).first('id')}
 catch{throw new Error('MEMBERSHIP_PRIVACY_UNAVAILABLE')}
 if(erased)throw new Error('MEMBERSHIP_CUSTOMER_UNAVAILABLE')
 try{
  const customer=await scope.resolve(Modules.CUSTOMER).retrieveCustomer(customerId,{select:['id']})
  if(customer.id!==customerId)throw new Error('MEMBERSHIP_CUSTOMER_UNAVAILABLE')
 }catch(error:any){
  if(error?.type===MedusaError.Types.NOT_FOUND||error?.message==='MEMBERSHIP_CUSTOMER_UNAVAILABLE')throw new Error('MEMBERSHIP_CUSTOMER_UNAVAILABLE')
  throw new Error('MEMBERSHIP_CUSTOMER_VERIFICATION_UNAVAILABLE')
 }
}
