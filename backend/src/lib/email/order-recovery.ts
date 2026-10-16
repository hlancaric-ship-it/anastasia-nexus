import { createHash } from 'node:crypto'
import type { MedusaContainer } from '@medusajs/framework/types'
import { Modules, NotificationStatus } from '@medusajs/framework/utils'
import { notifyOrderPlaced } from '../notify/order'

export type OrderEmailReference = { tenantId: string; orderId: string }
export class OrderEmailRecoveryError extends Error {
  constructor(readonly retryable: boolean, readonly reason: string) { super('ORDER_EMAIL_REQUIRES_REVIEW') }
}

export function orderEmailOperationId(input: OrderEmailReference): string {
  if (!input || typeof input.tenantId !== 'string' || typeof input.orderId !== 'string' ||
      !/^[a-z0-9_-]{2,32}$/.test(input.tenantId) || !/^[A-Za-z0-9_-]{1,128}$/.test(input.orderId)) throw new OrderEmailRecoveryError(false, 'INVALID_REFERENCE')
  return 'omail_' + createHash('sha256').update(JSON.stringify([1, input.tenantId, input.orderId])).digest('hex')
}

/** Reuses native notification uniqueness and receipt verification; never resets a failed record. */
export async function recoverOrderEmail(container: MedusaContainer, input: OrderEmailReference) {
  orderEmailOperationId(input)
  if (input.tenantId !== process.env.NEXUS_TENANT_ID) throw new OrderEmailRecoveryError(false, 'TENANT_MISMATCH')
  const result = await notifyOrderPlaced(container, input.orderId)
  if (result.status === 'sent' || result.status === 'duplicate' || result.reason === 'TEMPLATE_DISABLED') return result
  if (result.reason !== 'SEND_FAILED') throw new OrderEmailRecoveryError(false, 'BUSINESS_CONTEXT_UNAVAILABLE')

  // Medusa commits the unique native notification before invoking its provider.
  // No row: a failure before that checkpoint is safe to retry. SUCCESS: the next
  // attempt can only verify/suppress the same key. Pending/failure is ambiguous.
  try {
    const service = container.resolve(Modules.NOTIFICATION) as { listNotifications: (f: Record<string, unknown>, c: Record<string, unknown>) => Promise<Array<{ status: string }>> }
    const rows = await service.listNotifications({ idempotency_key: `order.placed:${input.orderId}` }, { take: 2, select: ['id', 'status'] })
    if (!rows.length || (rows.length === 1 && rows[0]!.status === NotificationStatus.SUCCESS)) {
      throw new OrderEmailRecoveryError(true, 'SAFE_RECEIPT_RECOVERY')
    }
  } catch (error) {
    if (error instanceof OrderEmailRecoveryError) throw error
    throw new OrderEmailRecoveryError(false, 'OUTCOME_UNREADABLE')
  }
  throw new OrderEmailRecoveryError(false, 'OUTCOME_UNCERTAIN')
}
