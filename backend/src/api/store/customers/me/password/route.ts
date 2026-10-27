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
  const ctx=(req as any).auth_context
  const rows=await auth.listProviderIdentities({auth_identity_id:ctx?.auth_identity_id,provider:"emailpass"},{select:["id"]})
  if(rows.length>0) return res.json({has_password:true})
  // Heslo může být vedené na sdílené identitě administrátora se stejným e-mailem.
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const customer=ctx?.actor_id?await db("customer").where({id:ctx.actor_id}).whereNull("deleted_at").first("email"):null
  const email=normalizeEmail(customer?.email)
  if(!email) return res.json({has_password:false})
  const shared=await auth.listProviderIdentities({entity_id:email,provider:"emailpass"},{select:["id","auth_identity_id"]})
  for(const row of shared){
   const [identity]=await auth.listAuthIdentities({id:row.auth_identity_id},{select:["id","app_metadata"]})
   if(identity?.app_metadata?.customer_id===ctx?.actor_id) return res.json({has_password:true})
  }
  return res.json({has_password:false})
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
  const users=req.scope.resolve(Modules.USER) as any
  const [adminUser]=await users.listUsers({email},{select:["id"],take:1})
  const [existing]=await auth.listProviderIdentities({entity_id:email,provider:"emailpass"},{select:["id","auth_identity_id"]})
  // Přihlášení e-mailem a heslem je sdílené pro zákazníky i administrátory podle e-mailu.
  // Heslo administrátora se proto nikdy nemaže: stejné přihlašovací údaje platí pro obě role.
  let holder=ctx.auth_identity_id as string
  if(existing&&existing.auth_identity_id!==ctx.auth_identity_id) {
   const [other]=await auth.listAuthIdentities({id:existing.auth_identity_id},{select:["id","app_metadata"]})
   const meta=other?.app_metadata||{}
   if(meta.customer_id&&meta.customer_id!==ctx.actor_id) return res.status(409).json({error:"PASSWORD_IDENTITY_CONFLICT",message:"Heslo sa nedá nastaviť. Kontaktujte, prosím, podporu."})
   if(adminUser&&meta.user_id===adminUser.id) holder=existing.auth_identity_id
   else await auth.deleteProviderIdentities([existing.id])
  }
  if(!(existing&&existing.auth_identity_id===holder)) await auth.createProviderIdentities({auth_identity_id:holder,provider:"emailpass",entity_id:email,provider_metadata:{}})
  const [holderIdentity]=await auth.listAuthIdentities({id:holder},{select:["id","app_metadata"]})
  const meta={...(holderIdentity?.app_metadata||{}),customer_id:ctx.actor_id,...(adminUser?{user_id:adminUser.id}:{})}
  if(JSON.stringify(meta)!==JSON.stringify(holderIdentity?.app_metadata||{})) await auth.updateAuthIdentities([{id:holder,app_metadata:meta}])
  const result=await auth.updateProvider("emailpass",{entity_id:email,password})
  if(!result?.success) throw new Error("PASSWORD_UPDATE_FAILED")
  return res.json({has_password:true})
 }catch{return res.status(503).json({error:"PASSWORD_UNAVAILABLE",message:"Heslo sa nepodarilo uložiť. Skúste to, prosím, znova."})}
}
