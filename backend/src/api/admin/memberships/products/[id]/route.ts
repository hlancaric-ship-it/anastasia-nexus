import type { AuthenticatedMedusaRequest,MedusaResponse } from '@medusajs/framework/http'
import type { ILockingModule } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { adminActor,auditAdminChange } from '../../../../../lib/observability/audit'
import { identifier,membershipConfigInput,sameConfig } from '../../../../../lib/membership/admin'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
 res.setHeader('Cache-Control','no-store')
 if(!adminActor(req))return res.status(401).json({message:'Prihláste sa do administrácie.'})
 const parsed=membershipConfigInput.safeParse(req.body)
 if(!identifier(req.params.id)||!parsed.success)return res.status(400).json({message:'Zadajte verziu podmienok a celé číslo od 1 do 3650 dní.'})
 try{
  const product=req.scope.resolve(Modules.PRODUCT) as any
  return await req.scope.resolve<ILockingModule>(Modules.LOCKING).execute(`membership-product:${req.params.id}`,async()=>{
   const before=await product.retrieveProduct(req.params.id,{select:['id','metadata']})
   const current=before.metadata?.membership??null
   if(!sameConfig(current,parsed.data.expected))return res.status(409).json({message:'Podmienky sa medzičasom zmenili. Najprv obnovte údaje.'})
   if(current&&!sameConfig(current,parsed.data.configuration)&&current.version===parsed.data.configuration.version)return res.status(400).json({message:'Pri zmene dĺžky zadajte aj novú verziu podmienok.'})
   await product.updateProducts(req.params.id,{metadata:{membership:parsed.data.configuration}})
   const after=await product.retrieveProduct(req.params.id,{select:['id','metadata']})
   if(!sameConfig(after.metadata?.membership,parsed.data.configuration))throw new Error('MEMBERSHIP_CONFIG_READBACK')
   await auditAdminChange(req,'membership.product.configure','product',req.params.id,{membership:current},{membership:parsed.data.configuration})
   return res.json({product:{id:after.id,configuration:after.metadata.membership}})
  })
 }catch{return res.status(503).json({message:'Výsledok uloženia treba overiť. Obnovte údaje pred ďalším pokusom.'})}
}
