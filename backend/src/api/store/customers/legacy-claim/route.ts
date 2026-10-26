import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys,Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../../modules/auth-magic-link/policy"
/** Zákazník zo starého webu je v systéme ako hosť (has_account=false) s históriou a prístupmi.
 *  Prvé prihlásenie odkazom ho preto nesmie založiť znova, ale naviaže identitu na jeho existujúci záznam.
 *  E-mail sa berie z identity overenej odkazom, nie z tela požiadavky. */
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 const ctx=(req as any).auth_context
 if(!ctx?.auth_identity_id) return res.status(401).json({error:"UNAUTHORIZED"})
 if(ctx.actor_id) return res.json({claimed:false})
 try {
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const auth=req.scope.resolve(Modules.AUTH) as any
  const [provider]=await auth.listProviderIdentities({auth_identity_id:ctx.auth_identity_id,provider:"magic-link"},{select:["entity_id"]})
  const email=normalizeEmail(provider?.entity_id)
  if(!email) return res.json({claimed:false})
  const rows=await db("customer").whereRaw("lower(email) = ?",[email]).whereNull("deleted_at").select("id","has_account","metadata")
  if(rows.some((row:any)=>row.has_account)) return res.json({claimed:false})
  const legacy=rows.filter((row:any)=>row.metadata&&typeof row.metadata==="object"&&row.metadata.legacy_customer_migration)
  if(legacy.length!==1) return res.json({claimed:false})
  const customerId=legacy[0].id
  const taken=await auth.listAuthIdentities({},{select:["id","app_metadata"],take:5000})
  if(taken.some((row:any)=>row.id!==ctx.auth_identity_id&&row.app_metadata?.customer_id===customerId)) return res.json({claimed:false})
  await db("customer").where({id:customerId}).update({has_account:true,updated_at:new Date()})
  await auth.updateAuthIdentities([{id:ctx.auth_identity_id,app_metadata:{customer_id:customerId}}])
  return res.json({claimed:true})
 }catch{return res.status(503).json({error:"CLAIM_UNAVAILABLE",message:"Službu sa nepodarilo dokončiť. Skúste to, prosím, znova."})}
}
