import {authenticate,type MiddlewareRoute} from '@medusajs/framework/http'
export const membershipStoreMiddlewares:MiddlewareRoute[]=[
 {matcher:'/store/memberships*',middlewares:[authenticate('customer',['session','bearer'])],bodyParser:{sizeLimit:'3kb'}},
]
