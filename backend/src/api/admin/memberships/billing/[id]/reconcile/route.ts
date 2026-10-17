import type { AuthenticatedMedusaRequest,MedusaResponse } from '@medusajs/framework/http'
import { adminActor,auditAdminChange } from '../../../../../../lib/observability/audit'
import { identifier } from '../../../../../../lib/membership/admin'
/** Separate read/reconcile entry point. Never calls runMembershipBilling, creates carts or charges. */
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
 res.setHeader('Cache-Control','no-store')
 if(!adminActor(req))return res.status(401).json({message:'Prihláste sa do administrácie.'})
 if(!identifier(req.params.id)||!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)return res.status(400).json({message:'Potvrďte dohľadanie existujúcej platby.'})
 try{
  const service=req.scope.resolve('membership') as any
  const [attempt]=await service.listMembershipBillingAttempts({id:req.params.id},{take:1})
  if(!attempt)return res.status(404).json({message:'Obnova sa nenašla.'})
  // Loaded only after authenticated validation; integration includes the billing implementation.
  const {reconcileMembershipBilling}=require('../../../../../../lib/membership/billing') as {reconcileMembershipBilling:(scope:typeof req.scope,id:string)=>Promise<{status:string}>}
  const result=await reconcileMembershipBilling(req.scope,attempt.id)
  if(!['SETTLED','RECONCILIATION_REQUIRED'].includes(result.status))throw new Error('MEMBERSHIP_RECONCILIATION_STATUS')
  await auditAdminChange(req,'membership.billing.reconcile','membership',attempt.membership_id,null,{status:result.status})
  return res.json({status:result.status})
 }catch{return res.status(503).json({message:'Platbu zatiaľ nemožno overiť. Nespúšťajte nový nákup; obnovte údaje a skontrolujte objednávku.'})}
}
