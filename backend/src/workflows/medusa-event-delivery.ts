import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import { deliverMedusaEvent, MedusaDeliveryError, type MedusaDelivery } from '../lib/nexus/medusa-delivery'
import { recordEvent } from '../lib/observability/events'

export const MEDUSA_DELIVERY_WORKFLOW = 'nexus-medusa-event-delivery-v1'
const RETRIES = 3
const deliveryStep = createStep({ name: 'nexus-medusa-durable-intake', maxRetries: RETRIES, retryInterval: 5, noCompensation: true },
  async (input: MedusaDelivery, { container, attempt }) => {
    try {
      const receipt = await deliverMedusaEvent(input)
      await recordEvent(container, 'info', 'webhook', 'nexus_event_received', { entity_id: receipt.eventId, source_event: input.event })
      return new StepResponse(receipt)
    } catch (error) {
      const retryable = error instanceof MedusaDeliveryError && error.retryable
      await recordEvent(container, 'error', 'webhook', !retryable || attempt > RETRIES ? 'nexus_event_needs_review' : 'nexus_event_retry_pending',
        { entity_id: input.targetId, source_event: input.event, attempt })
      if (!retryable) return StepResponse.permanentFailure('NEXUS_EVENT_DELIVERY_REQUIRES_REVIEW')
      throw new Error('NEXUS_EVENT_DELIVERY_FAILED')
    }
  })

// Native Medusa checkpoints/retry scheduler; no second order database or global event retry.
export const medusaEventDeliveryWorkflow = createWorkflow({ name: MEDUSA_DELIVERY_WORKFLOW, store: true, idempotent: true,
  retentionTime: 7 * 24 * 60 * 60, timeout: 90 }, (input: MedusaDelivery) => new WorkflowResponse(deliveryStep(input)))
