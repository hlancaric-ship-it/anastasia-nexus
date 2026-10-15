import { authenticate,type MiddlewareRoute } from "@medusajs/framework/http"
import { assertCartConsent,loadConsentCart } from "../lib/legal/checkout"
import { recordEvent } from "../lib/observability/events"
import { LegalError } from "../modules/legal/policy"
import { sendLegalError } from "./legal-helpers"
import { legalRate } from "../lib/legal/rate-limit"
const customer=authenticate("customer",["session","bearer"])
const admin=authenticate("user",["session","bearer"])
export async function requireCheckoutConsent(req:any,res:any,next:any) {
 try {const id=req.params.id ?? req.body?.cart_id; if(typeof id!=="string") return next(); await assertCartConsent(req.scope,await loadConsentCart(req.scope,id));return next()}
 catch(error){await recordEvent(req.scope,error instanceof LegalError && error.status===422?"warn":"error","checkout","failed",{cart_id:req.params.id ?? req.body?.cart_id,error_code:error instanceof LegalError?error.code:"LEGAL_UNAVAILABLE"});return sendLegalError(req,res,error)}
}
export const legalMiddlewares:MiddlewareRoute[]=[
 {matcher:"/store/carts/:id/consents",method:["POST"],middlewares:[authenticate("customer",["session","bearer"],{allowUnauthenticated:true})],bodyParser:{sizeLimit:"2kb"}},
 {matcher:"/store/carts/:id/complete",method:["POST"],middlewares:[requireCheckoutConsent]},
 {matcher:"/store/nexus-checkout",method:["POST"],middlewares:[requireCheckoutConsent]},
 {matcher:"/store/withdrawals",method:["POST"],middlewares:[customer,legalRate("withdrawal",10,60,true)],bodyParser:{sizeLimit:"16kb"}},
 {matcher:"/store/newsletter",method:["POST"],middlewares:[legalRate("newsletter")],bodyParser:{sizeLimit:"2kb"}},
 {matcher:"/store/newsletter/unsubscribe",method:["POST"],middlewares:[legalRate("newsletter")],bodyParser:{sizeLimit:"2kb"}},
 {matcher:"/admin/newsletter",method:["GET"],middlewares:[admin]},
 {matcher:"/admin/withdrawals*",middlewares:[admin],bodyParser:{sizeLimit:"4kb"}},
]
