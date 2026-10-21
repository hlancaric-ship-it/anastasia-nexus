import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  DAILY_CUSTOMER_MESSAGE_LIMIT, MAX_CONSECUTIVE_CUSTOMER_MESSAGES, MAX_CUSTOMER_MESSAGE_LENGTH, nextLocalDayStart, remainingAllowance,
} from "../../../../modules/chat"
import { isCustomerChatEligible } from "../../../../modules/chat/eligibility"
import { chatService, requireActor, sendChatError } from "../../../chat-helpers"

/** GET /store/chat/status: smí zákazník psát a kolik zpráv jí zbývá (informativní, závazně rozhoduje odeslání). */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireActor(req, res, "customer")
  if (!customerId) return
  try {
    const [eligible, counters] = await Promise.all([
      isCustomerChatEligible(req.scope, customerId),
      chatService(req).customerCounters(customerId),
    ])
    const remaining = remainingAllowance(counters)
    const reason = !eligible ? "chat_not_eligible" : counters.blocked ? "chat_blocked"
      : remaining.in_row === 0 ? "chat_consecutive_limit" : remaining.today === 0 ? "chat_daily_limit" : null
    res.setHeader("Cache-Control", "no-store")
    return res.status(200).json({
      eligible,
      blocked: counters.blocked,
      can_write: reason === null,
      reason,
      remaining,
      resets_at: nextLocalDayStart(new Date()).toISOString(),
      limits: { per_day: DAILY_CUSTOMER_MESSAGE_LIMIT, in_row: MAX_CONSECUTIVE_CUSTOMER_MESSAGES, max_length: MAX_CUSTOMER_MESSAGE_LENGTH },
    })
  } catch (error) {
    return sendChatError(req, res, error, "GET /store/chat/status")
  }
}
