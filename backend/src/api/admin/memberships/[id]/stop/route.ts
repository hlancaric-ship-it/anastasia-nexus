import type { AuthenticatedMedusaRequest,MedusaResponse } from '@medusajs/framework/http'
import { MEMBERSHIP_MODULE } from '../../../../../modules/membership'
import type MembershipModuleService from '../../../../../modules/membership/service'
import { adminActor,auditAdminChange } from '../../../../../lib/observability/audit'
import { identifier } from '../../../../../lib/membership/admin'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
 res.setHeader('Cache-Control','no-store')
 if(!adminActor(req))return res.status(401).json({message:'Prihláste sa do administrácie.'})
 if(!identifier(req.params.id)||!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)return res.status(400).json({message:'Potvrďte zastavenie budúcej obnovy.'})
 try{
  const service=req.scope.resolve<MembershipModuleService>(MEMBERSHIP_MODULE)
  const [before]=await service.listMemberships({id:req.params.id},{take:1})
  if(!before)return res.status(404).json({message:'Členstvo sa nenašlo.'})
  const state=await service.stop(req.params.id)
  await auditAdminChange(req,'membership.stop','membership',state.id,{renew:(before.snapshot as any).renew},{renew:state.renew})
  return res.json({membership:{id:state.id,renew:state.renew,status:state.status,period_end:state.period_end}})
 }catch{return res.status(503).json({message:'Výsledok zastavenia treba overiť. Obnovte údaje. Už rozbehnutá platba môže byť dokončená.'})}
}
