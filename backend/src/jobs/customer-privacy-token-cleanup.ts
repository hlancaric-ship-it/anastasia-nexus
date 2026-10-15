import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function handler(container:MedusaContainer) {
 const db=container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
 await db.raw(`update customer_erasure set email_hash=null,email_hashes=null,blocked_until=null,updated_at=now()
 where id in (select id from customer_erasure where status='completed' and blocked_until < now() limit 1000)`)
}
export const config={name:"customer-privacy-token-cleanup",schedule:"*/10 * * * *"}
