import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { deliveryConfig, deliveryId, type MedusaDelivery } from '../lib/nexus/medusa-delivery'
import { medusaEventDeliveryWorkflow } from '../workflows/medusa-event-delivery'
import { recordEvent } from '../lib/observability/events'

export default async function nexusMedusaEvents({ event, container }: SubscriberArgs<{ id: string }>) {
  try {
    const config = deliveryConfig()
    if (!config) return // Explicitly unconfigured; no successful receipt is fabricated.
    const input: MedusaDelivery = { tenantId: config.tenantId, event: event.name as MedusaDelivery['event'], targetId: event.data.id }
    await medusaEventDeliveryWorkflow(container).run({ input, context: { transactionId: deliveryId(input) } })
  } catch {
    await recordEvent(container, 'error', 'webhook', 'nexus_event_needs_review', { entity_id: event.data?.id, source_event: event.name })
    throw new Error('NEXUS_EVENT_DELIVERY_FAILED')
  }
}

export const config: SubscriberConfig = { event: ['order.placed', 'customer.created'], context: { subscriberId: 'nexus-medusa-events-v1' } }
