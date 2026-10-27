import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ADMIN_ROLE_METADATA_KEY, normalizeAdminRole } from "../lib/admin/roles"

/**
 * Nový administrátor (z pozvánky) dostane rolu `assistant`, ak rolu nemá výslovne nastavenú.
 *
 * Rola bez metadát sa číta ako `owner` (aby sa existujúcim účtom nič nezmenilo), takže by inak
 * každý pozvaný kolega mal plné práva. Prvý administrátor systému ostáva vlastníkom; vyššiu rolu
 * udelí vlastník v Nastaveniach → Zabezpečenie.
 */
export default async function handler({ event, container }: SubscriberArgs<{ id: string }>) {
  const userId = event.data?.id
  if (!userId) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  try {
    const users = container.resolve(Modules.USER) as any
    const user = await users.retrieveUser(userId)
    if (normalizeAdminRole(user?.metadata?.[ADMIN_ROLE_METADATA_KEY])) return
    const [, count] = await users.listAndCountUsers({}, { select: ["id"], take: 1 })
    if (count <= 1) return
    await users.updateUsers({ id: userId, metadata: { ...(user?.metadata ?? {}), [ADMIN_ROLE_METADATA_KEY]: "assistant" } })
  } catch (error) {
    logger.error("[admin-user-default-role] nepodarilo sa nastaviť rolu asistenta", error as Error)
  }
}

export const config: SubscriberConfig = { event: "user.created" }
