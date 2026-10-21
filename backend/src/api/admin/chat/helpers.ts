import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type ChatCustomerInfo = { id: string; email: string | null; first_name: string | null; last_name: string | null }

/** Jména a e-maily zákazníků pro admin seznam (jedním dotazem). */
export async function loadCustomers(container: MedusaContainer, ids: string[]): Promise<Map<string, ChatCustomerInfo>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (!unique.length) return new Map()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name"], filters: { id: unique } })
  return new Map((data as ChatCustomerInfo[]).map((c) => [c.id, c]))
}
