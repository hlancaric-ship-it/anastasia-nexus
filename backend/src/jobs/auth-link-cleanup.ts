import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
export default async function cleanup(container: MedusaContainer) {
  const db: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  for (const table of ["auth_link_state", "auth_link_rate"]) {
    await db.raw(`delete from ${table} where expires_at <= now() and id in (select id from ${table} where expires_at <= now() limit 10000)`)
  }
}
export const config = { name: "auth-link-cleanup", schedule: "*/10 * * * *" }
