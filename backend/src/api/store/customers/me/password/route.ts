import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys,Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../../../modules/auth-magic-link/policy"
export const PASSWORD_MIN=8,PASSWORD_MAX=200
export function passwordProblem(password:unknown) {
 if(typeof password!=="string") return "PASSWORD_REQUIRED"
 if(password.length<PASSWORD_MIN) return "PASSWORD_TOO_SHORT"
 if(password.length>PASSWORD_MAX) return "PASSWORD_TOO_LONG"
 if(!password.trim()) return "PASSWORD_REQUIRED"
 return null
}
/** Heslo sa pripája k rovnakej identite ako prihlasovací odkaz, takže oba spôsoby vedú do jedného účtu. */
export async function GET(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 try {
  const auth=req.scope.resolve(Modules.AUTH) as any
  const rows=await auth.listProviderIdentities({auth_identity_id:(req as any).auth_context?.auth_identity_id,provider:"emailpass"},{select:["id"]})
  return res.json({has_password:rows.length>0})
 }catch{return res.status(503).json({error:"PASSWORD_UNAVAILABLE",message:"Služba je dočasne nedostupná."})}
}
export async function POST(req:MedusaRequest,res:MedusaResponse) {
 res.setHeader("Cache-Control","no-store")
 const ctx=(req as any).auth_context, password=(req.body as any)?.password
 const problem=passwordProblem(password)
 if(problem) return res.status(400).json({error:problem,message:`Heslo musí mať ${PASSWORD_MIN} až ${PASSWORD_MAX} znakov.`})
 if(ctx?.actor_type!=="customer"||!ctx.actor_id||!ctx.auth_identity_id) return res.status(401).json({error:"UNAUTHORIZED"})
 try {
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const auth=req.scope.resolve(Modules.AUTH) as any
  const customer=await db("customer").where({id:ctx.actor_id}).whereNull("deleted_at").first("email")
  const email=normalizeEmail(customer?.email)
  if(!email) return res.status(409).json({error:"CUSTOMER_EMAIL_MISSING",message:"Účet nemá e-mail."})
  const owned=await auth.listProviderIdentities({auth_identity_id:ctx.auth_identity_id,provider:"emailpass"},{select:["id","entity_id"]})
  const stale=owned.filter((row:any)=>row.entity_id!==email).map((row:any)=>row.id)
  if(stale.length) await auth.deleteProviderIdentities(stale)
  const [existing]=await auth.listProviderIdentities({entity_id:email,provider:"emailpass"},{select:["id","auth_identity_id"]})
  if(existing&&existing.auth_identity_id!==ctx.auth_identity_id) {
   const [other]=await auth.listAuthIdentities({id:existing.auth_identity_id},{select:["id","app_metadata"]})
   const otherCustomer=other?.app_metadata?.customer_id
   if(otherCustomer&&otherCustomer!==ctx.actor_id) return res.status(409).json({error:"PASSWORD_IDENTITY_CONFLICT",message:"Heslo sa nedá nastaviť. Kontaktujte, prosím, podporu."})
   await auth.deleteProviderIdentities([existing.id])
  }
  if(!existing||existing.auth_identity_id!==ctx.auth_identity_id) await auth.createProviderIdentities({auth_identity_id:ctx.auth_identity_id,provider:"emailpass",entity_id:email,provider_metadata:{}})
  const result=await auth.updateProvider("emailpass",{entity_id:email,password})
  if(!result?.success) throw new Error("PASSWORD_UPDATE_FAILED")
  return res.json({has_password:true})
 }catch{return res.status(503).json({error:"PASSWORD_UNAVAILABLE",message:"Heslo sa nepodarilo uložiť. Skúste to, prosím, znova."})}
}
