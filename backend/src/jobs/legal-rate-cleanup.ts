import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function handler(container:MedusaContainer) {
 const db=container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
 // Bounded deletion avoids a long cleanup transaction after an outage.
 await db.raw(`delete from legal_rate_limit where subject in (select subject from legal_rate_limit where expires_at < now() - interval '1 hour' limit 10000)`)
}
export const config={name:"legal-rate-cleanup",schedule:"*/10 * * * *"}
