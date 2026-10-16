import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk'
import { recoverOrderEmail, OrderEmailRecoveryError, type OrderEmailReference } from '../lib/email/order-recovery'
import { recordEvent } from '../lib/observability/events'

export const ORDER_EMAIL_WORKFLOW = 'order-email-recovery-v1'
const RETRIES = 3
const sendStep = createStep({ name: 'order-email-native-receipt', maxRetries: RETRIES, retryInterval: 5, noCompensation: true },
  async (input: OrderEmailReference, { container, attempt }) => {
    try {
      return new StepResponse(await recoverOrderEmail(container, input))
    } catch (error) {
      const retryable = error instanceof OrderEmailRecoveryError && error.retryable
      await recordEvent(container, 'error', 'notification', !retryable || attempt > RETRIES ? 'order_email_needs_review' : 'order_email_retry_pending',
        { order_id: input.orderId, attempt, reason: error instanceof OrderEmailRecoveryError ? error.reason : 'UNEXPECTED_FAILURE' })
      if (!retryable) return StepResponse.permanentFailure('ORDER_EMAIL_REQUIRES_REVIEW')
      throw new Error('ORDER_EMAIL_SAFE_RETRY_PENDING')
    }
  })

// Only references enter workflow storage; recipient/content remain in native notification.
export const orderEmailRecoveryWorkflow = createWorkflow({ name: ORDER_EMAIL_WORKFLOW, store: true, idempotent: true,
  retentionTime: 7 * 24 * 60 * 60, timeout: 90 }, (input: OrderEmailReference) => new WorkflowResponse(sendStep(input)))
