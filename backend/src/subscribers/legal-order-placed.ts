import type { SubscriberArgs,SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
/** Persist the accepted versions against the order; never accept order metadata as evidence. */
export default async function handler({event,container}:SubscriberArgs<{id:string}>) {
 const {data}=await (container.resolve(ContainerRegistrationKeys.QUERY) as any).graph({entity:"order_cart",fields:["cart_id"],filters:{order_id:event.data.id}})
 if(!data[0]?.cart_id) return // imported/admin orders do not originate in checkout
 const service=container.resolve("legal") as any
 const [row]=await service.listLegalConsents({cart_id:data[0].cart_id},{take:1})
 if(row && !row.order_id) await service.updateLegalConsents({id:row.id,order_id:event.data.id})
}
export const config:SubscriberConfig={event:"order.placed"}
