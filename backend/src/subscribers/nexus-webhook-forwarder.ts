import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import crypto from "node:crypto"

const FORWARDED_EVENTS = [
  "order.placed",
  "order.canceled",
  "customer.created",
  "payment.captured",
] as const

/**
 * Forwards Medusa events to the NEXUS Worker webhook endpoint.
 * Signs the payload with HMAC-SHA256 using the shared NEXUS_WEBHOOK_SECRET.
 * Fail-open: webhook delivery failure does not block the internal event pipeline.
 */
export default async function nexusWebhookForwarder({ event, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any

  const webhookUrl = process.env.NEXUS_WEBHOOK_URL
  if (!webhookUrl) return

  const webhookSecret = process.env.NEXUS_WEBHOOK_SECRET
  const eventName = event.name
  const eventId = `medusa_${eventName}_${event.data.id}_${Date.now()}`

  const payload = JSON.stringify({
    event: eventName,
    id: eventId,
    data: event.data,
    timestamp: new Date().toISOString(),
  })

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-medusa-delivery": eventId,
  }

  if (webhookSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const hmac = crypto.createHmac("sha256", webhookSecret)
    hmac.update(`${timestamp}.${payload}`)
    headers["x-medusa-signature"] = `t=${timestamp},v1=${hmac.digest("hex")}`
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      logger.warn(`[nexus-webhook] ${eventName} delivery failed: ${response.status} ${response.statusText}`)
    } else {
      logger.info(`[nexus-webhook] ${eventName} delivered to NEXUS (${eventId})`)
    }
  } catch (error) {
    logger.warn(`[nexus-webhook] ${eventName} delivery error: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const config: SubscriberConfig = {
  event: [...FORWARDED_EVENTS],
}
