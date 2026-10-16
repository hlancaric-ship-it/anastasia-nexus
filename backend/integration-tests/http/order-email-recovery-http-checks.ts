import { randomUUID } from 'node:crypto'
import { Modules } from '@medusajs/framework/utils'
import { ORDER_EMAIL_WORKFLOW, orderEmailRecoveryWorkflow } from '../../src/workflows/order-email-recovery'
import { orderEmailOperationId } from '../../src/lib/email/order-recovery'

const reference = (orderId: string) => ({ tenantId: process.env.NEXUS_TENANT_ID!, orderId })
const execution = async (container: any, id: string) => (await container.resolve(Modules.WORKFLOW_ENGINE)
  .listWorkflowExecutions({ workflow_id: ORDER_EMAIL_WORKFLOW, transaction_id: id }))[0]
async function waitFor(fn: () => Promise<boolean>) {
  const until = Date.now() + 35_000
  while (!(await fn())) {
    if (Date.now() > until) throw new Error('SYNTHETIC_ORDER_EMAIL_TIMEOUT')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/** Called after a real native HTTP checkout; source subscriber is not invoked manually. */
export async function verifyOrderEmailSource({ container, orderId, evidence }: any) {
  const input = reference(orderId), id = orderEmailOperationId(input)
  await waitFor(async () => (await execution(container, id))?.state === 'done')
  const notifications = container.resolve(Modules.NOTIFICATION)
  const rows = await notifications.listNotifications({ idempotency_key: `order.placed:${orderId}` })
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe('success')
  await orderEmailRecoveryWorkflow(container).run({ input, context: { transactionId: id } })
  expect(await notifications.listNotifications({ idempotency_key: `order.placed:${orderId}` })).toHaveLength(1)
  const stored = await execution(container, id)
  expect(JSON.stringify(stored)).not.toContain(rows[0].to)
  evidence.push({ scenario: 'ORDER_EMAIL_NATIVE_SOURCE_AND_REPLAY', status: 'PASS', storedWorkflow: true, nativeNotificationRows: 1 })
}

/** Failure injection decorates only the matching native method; provider remains synthetic log only. */
export async function verifyOrderEmailRecovery({ container, dbConnection, evidence }: any) {
  const notifications = container.resolve(Modules.NOTIFICATION)
  const original = notifications.createNotifications
  const create = original.bind(notifications)
  const newOrder = async () => container.resolve(Modules.ORDER).createOrders({ currency_code: 'eur', email: `order-email-${randomUUID()}@example.test`, items: [] })
  const run = (input: ReturnType<typeof reference>) => orderEmailRecoveryWorkflow(container).run({ input, context: { transactionId: orderEmailOperationId(input) }, throwOnError: false })
  try {
    for (const mode of ['before-native-write', 'after-native-success', 'exhausted'] as const) {
      const order = await newOrder(), input = reference(order.id), id = orderEmailOperationId(input)
      const key = `order.placed:${order.id}`
      let calls = 0, nativeWrites = 0, checkpointBeforeEffect = true
      notifications.createNotifications = async (data: any, ...rest: any[]) => {
        if (data.idempotency_key !== key) return create(data, ...rest)
        calls++
        checkpointBeforeEffect &&= !!(await execution(container, id))
        if (mode === 'exhausted' || (mode === 'before-native-write' && calls === 1)) throw new Error('SYNTHETIC_PRE_WRITE_FAILURE')
        const receipt = await create(data, ...rest)
        nativeWrites++
        if (mode === 'after-native-success' && calls === 1) throw new Error('SYNTHETIC_LOST_NATIVE_RESPONSE')
        return receipt
      }
      await run(input)
      await waitFor(async () => (await execution(container, id))?.state === (mode === 'exhausted' ? 'reverted' : 'done'))
      const rows = await notifications.listNotifications({ idempotency_key: key })
      expect(checkpointBeforeEffect).toBe(true)
      expect(nativeWrites).toBe(mode === 'exhausted' ? 0 : 1)
      expect(calls).toBe(mode === 'exhausted' ? 4 : mode === 'before-native-write' ? 2 : 1)
      expect(rows).toHaveLength(mode === 'exhausted' ? 0 : 1)
      if (rows.length) expect(rows[0].status).toBe('success')
      evidence.push({ scenario: `ORDER_EMAIL_RECOVERY_${mode.toUpperCase().replaceAll('-', '_')}`, status: 'PASS', calls, nativeWrites, checkpointBeforeEffect })
    }
    notifications.createNotifications = original
    const order = await newOrder(), input = reference(order.id), id = orderEmailOperationId(input)
    const key = `order.placed:${order.id}`
    const row = await create({ to: order.email, channel: 'email', template: 'order-placed-sk', data: {}, idempotency_key: key, resource_id: order.id, resource_type: 'order' })
    await dbConnection.raw('UPDATE notification SET status = ? WHERE id = ?', ['failure', row.id])
    await run(input)
    await waitFor(async () => (await execution(container, id))?.state === 'reverted')
    const rows = await notifications.listNotifications({ idempotency_key: key })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'failure', external_id: row.external_id })
    const audit = (await dbConnection.raw("SELECT fields FROM ops_event WHERE order_id = ? AND event = 'order_email_needs_review'", [order.id])).rows
    expect(audit.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toContain(order.email)
    evidence.push({ scenario: 'ORDER_EMAIL_UNKNOWN_NO_RESEND', status: 'PASS', failedNativeRowUnchanged: true, escalated: true })
  } finally { notifications.createNotifications = original }
}
