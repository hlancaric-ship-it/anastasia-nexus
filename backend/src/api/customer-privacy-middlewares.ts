import { authenticate,type MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { tokenHash } from "../modules/legal/policy"
import { normalizeEmail } from "../modules/auth-magic-link/policy"
import { legalRate } from "../lib/legal/rate-limit"
/** Medusa bearer/session authentication is stateless; a persistent tombstone revokes old actors. */
export async function denyErasedCustomer(req:any,res:any,next:any) {
 try {
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), actor=req.auth_context
  const customerId=actor?.actor_type==="customer"?actor.actor_id:null
  if(customerId) {
   const row=await db("customer_erasure").where({customer_id:customerId}).whereNull("deleted_at").whereIn("status",["processing","completed"]).first("id")
   if(row) {if(req.session?.auth_context?.actor_type==="customer") delete req.session.auth_context;return res.status(401).json({error:"CUSTOMER_ACCESS_REVOKED",message:"Prístup k účtu bol zrušený."})}
  }
  if(req.path?.startsWith("/auth/customer/")) {
   const email=normalizeEmail(req.body?.email)
   if(email) {
    const erased=await db("customer_erasure").where({email_hash:tokenHash(email)}).whereNull("deleted_at").whereIn("status",["processing","completed"]).where("blocked_until",">",new Date()).first("id")
    if(erased)return res.status(401).json({error:"CUSTOMER_ACCESS_REVOKED"})
   }
  }
  return next()
 }catch{return res.status(503).json({error:"PRIVACY_UNAVAILABLE",message:"Služba je dočasne nedostupná."})}
}
const customer=authenticate("customer",["session","bearer"])
const optional=authenticate("customer",["session","bearer"],{allowUnauthenticated:true})
const admin=authenticate("user",["session","bearer"])
export const customerPrivacyMiddlewares:MiddlewareRoute[]=[
 // Register these guards before all endpoint-specific middleware, including native Store routes.
 {matcher:"/store/*",middlewares:[optional,denyErasedCustomer]},
 {matcher:"/auth/*",middlewares:[optional,denyErasedCustomer]},
 {matcher:"/store/customers/me/export",method:["GET"],middlewares:[customer,legalRate("customer-export",3,3600,true)]},
 {matcher:"/store/customers/me/erasure-request",method:["POST"],middlewares:[customer,legalRate("customer-erasure",5,3600,true)],bodyParser:{sizeLimit:"1kb"}},
 {matcher:"/admin/customer-erasures*",middlewares:[admin],bodyParser:{sizeLimit:"2kb"}},
 {matcher:"/admin/customers/:id/notes*",middlewares:[admin],bodyParser:{sizeLimit:"24kb"}},
]
