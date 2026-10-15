import { authenticate,type MiddlewareRoute } from "@medusajs/framework/http"
import { legalRate } from "../lib/legal/rate-limit"
export const orderSelfCancelMiddlewares:MiddlewareRoute[]=[
 {matcher:"/store/orders/:id/cancel",method:["POST"],middlewares:[authenticate("customer",["session","bearer"]),legalRate("order-self-cancel",10,60,true)],bodyParser:{sizeLimit:"1kb"}},
]
