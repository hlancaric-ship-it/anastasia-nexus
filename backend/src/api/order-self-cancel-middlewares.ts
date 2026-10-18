import { authenticate,type AuthenticatedMedusaRequest,type MedusaNextFunction,type MedusaResponse,type MiddlewareRoute } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { legalRate } from "../lib/legal/rate-limit"

/** Natívne GET /store/orders/:id vracia e-mail a adresu komukoľvek, kto pozná ID. Detail len pre prihlásenú vlastníčku, inak 404 (neprezradí existenciu). */
export async function ownOrderOnly(req:AuthenticatedMedusaRequest,res:MedusaResponse,next:MedusaNextFunction){
  const customerId=req.auth_context?.actor_id
  const orderId=req.params?.id ?? /^\/store\/orders\/([^/?]+)/.exec(req.originalUrl ?? "")?.[1]
  try {
    if(!customerId||!orderId) return res.status(404).json({type:"not_found",message:"Objednávka sa nenašla."})
    const query=req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {data}=await query.graph({entity:"order",fields:["id","customer_id"],filters:{id:orderId}})
    if(data?.[0]?.customer_id!==customerId) return res.status(404).json({type:"not_found",message:"Objednávka sa nenašla."})
    return next()
  } catch(error){ return next(error) }
}

export const orderSelfCancelMiddlewares:MiddlewareRoute[]=[
 {matcher:"/store/orders/:id",method:["GET"],middlewares:[authenticate("customer",["session","bearer"]),ownOrderOnly]},
 {matcher:"/store/orders/:id/cancel",method:["POST"],middlewares:[authenticate("customer",["session","bearer"]),legalRate("order-self-cancel",10,60,true)],bodyParser:{sizeLimit:"1kb"}},
]
