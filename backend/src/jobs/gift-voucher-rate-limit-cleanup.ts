import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function cleanupVoucherAttempts(container: MedusaContainer) {
  try {
    await container.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw("DELETE FROM gift_voucher_rate_limit WHERE expires_at < now() - interval '1 hour'")
  } catch {
    container.resolve(ContainerRegistrationKeys.LOGGER).error("[gift-voucher] čistenie ochrany uplatnenia kódu zlyhalo")
  }
}
export const config = { name: "gift-voucher-rate-limit-cleanup", schedule: "*/10 * * * *" }
