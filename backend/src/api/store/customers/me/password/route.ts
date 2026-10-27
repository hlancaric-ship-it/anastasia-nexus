import type { MedusaRequest,MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys,Modules } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../../../modules/auth-magic-link/policy"
import { incrementSessionEpoch } from "../../../../../modules/auth-security/session-epoch"
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
  const owned=await auth.listProviderIdentities({auth_identity_id:ctx.auth_identity_id},{select:["id","entity_id","provider"]})
  // Heslo smie nastaviť len identita, ktorá tento e-mail overila (odkaz e-mailom alebo vlastné heslo).
  // Inak by zákazník s podvrhnutým e-mailom v účte nastavil heslo k cudziemu e-mailu.
  if(!owned.some((row:any)=>row.entity_id===email)) return res.status(409).json({error:"PASSWORD_EMAIL_NOT_VERIFIED",message:"Prihláste sa, prosím, odkazom z e-mailu a skúste to znova."})
  // Heslo administrátora sa zo zákazníckeho účtu nikdy nemení: obišlo by to overenie pôvodného hesla aj 2FA.
  const users=req.scope.resolve(Modules.USER) as any
  const [adminUser]=await users.listUsers({email},{select:["id"],take:1})
  if(adminUser) return res.status(409).json({error:"ADMIN_EMAIL_USE_ADMIN_FLOW",message:"Heslo k tomuto e-mailu sa mení v administrácii."})
  const stale=owned.filter((row:any)=>row.provider==="emailpass"&&row.entity_id!==email).map((row:any)=>row.id)
  if(stale.length) await auth.deleteProviderIdentities(stale)
  const [existing]=await auth.listProviderIdentities({entity_id:email,provider:"emailpass"},{select:["id","auth_identity_id"]})
  if(existing&&existing.auth_identity_id!==ctx.auth_identity_id) {
   const [other]=await auth.listAuthIdentities({id:existing.auth_identity_id},{select:["id","app_metadata"]})
   const meta=other?.app_metadata||{}
   // Prihlasovacie údaje administrátora alebo iného zákazníka sa neprepíšu ani nezmažú.
   if(meta.user_id||(meta.customer_id&&meta.customer_id!==ctx.actor_id)) return res.status(409).json({error:"PASSWORD_IDENTITY_CONFLICT",message:"Heslo sa nedá nastaviť. Kontaktujte, prosím, podporu."})
   await auth.deleteProviderIdentities([existing.id])
  }
  if(!(existing&&existing.auth_identity_id===ctx.auth_identity_id)) await auth.createProviderIdentities({auth_identity_id:ctx.auth_identity_id,provider:"emailpass",entity_id:email,provider_metadata:{}})
  // Bump first: if provider update then fails, logging out existing sessions is safe;
  // changing the password without invalidating sessions is not.
  await incrementSessionEpoch(db,"customer",ctx.actor_id)
  const result=await auth.updateProvider("emailpass",{entity_id:email,password})
  if(!result?.success) throw new Error("PASSWORD_UPDATE_FAILED")
  return res.json({has_password:true})
 }catch{return res.status(503).json({error:"PASSWORD_UNAVAILABLE",message:"Heslo sa nepodarilo uložiť. Skúste to, prosím, znova."})}
}
