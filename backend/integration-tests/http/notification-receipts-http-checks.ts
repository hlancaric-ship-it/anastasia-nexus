import { randomUUID } from 'node:crypto'
import { Modules } from '@medusajs/framework/utils'
import { EmailOutcomeUnknownError, sendEmail } from '../../src/lib/email/send'

/** Native notification service + synthetic log provider + PostgreSQL, no external mail. */
export async function verifyNotificationReceipts({ container, dbConnection, evidence }: any) {
  const service = container.resolve(Modules.NOTIFICATION)
  const key = `synthetic-receipt:${randomUUID()}`
  const input = { to: 'synthetic-receipt@example.test', template: 'order-placed-sk',
    idempotency_key: key, resource_id: `order_synthetic_${randomUUID()}`, resource_type: 'order' }
  expect(await sendEmail(container, input)).toEqual({ status: 'sent' })
  const before = await service.listNotifications({ idempotency_key: key })
  expect(before).toHaveLength(1)
  expect(before[0]).toMatchObject({ status: 'success', channel: 'email', template: input.template })
  expect(before[0].external_id).toMatch(/^synthetic_/)
  expect(await sendEmail(container, input)).toEqual({ status: 'duplicate' })
  expect(await service.listNotifications({ idempotency_key: key })).toHaveLength(1)
  evidence.push({ scenario: 'NOTIFICATION_RECEIPT_NATIVE_READBACK', status: 'PASS', nativeSuccess: true, replayRows: 1 })

  for (const status of ['pending', 'failure']) {
    // Model persisted uncertainty after a crash/provider timeout; never call real mail.
    await dbConnection.raw('UPDATE notification SET status = ? WHERE id = ?', [status, before[0].id])
    await expect(sendEmail(container, input)).rejects.toThrow(EmailOutcomeUnknownError)
    const rows = await service.listNotifications({ idempotency_key: key })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status, external_id: before[0].external_id })
  }
  await dbConnection.raw('UPDATE notification SET status = ? WHERE id = ?', ['success', before[0].id])
  await expect(sendEmail(container, { ...input, resource_id: 'order_foreign_synthetic' })).rejects.toThrow(EmailOutcomeUnknownError)
  const audit = (await dbConnection.raw("SELECT fields FROM ops_event WHERE domain = 'notification' AND event = 'outcome_requires_review' AND fields->>'resource_id' = ?", [input.resource_id])).rows
  expect(audit.length).toBeGreaterThanOrEqual(2)
  expect(JSON.stringify(audit)).not.toContain(input.to)
  evidence.push({ scenario: 'NOTIFICATION_UNCERTAIN_NOT_RESENT', status: 'PASS', pendingBlocked: true, failureBlocked: true, foreignResourceBlocked: true })

  const race = { ...input, idempotency_key: `synthetic-race:${randomUUID()}` }
  const outcomes = await Promise.allSettled([sendEmail(container, race), sendEmail(container, race)])
  expect(outcomes.filter(out => out.status === 'fulfilled' && out.value.status === 'sent')).toHaveLength(1)
  for (const out of outcomes) {
    if (out.status === 'rejected') expect(out.reason).toBeInstanceOf(EmailOutcomeUnknownError)
    else expect(['sent', 'duplicate']).toContain(out.value.status)
  }
  const rows = await service.listNotifications({ idempotency_key: race.idempotency_key })
  expect(rows).toHaveLength(1)
  expect(rows[0].status).toBe('success')
  evidence.push({ scenario: 'NOTIFICATION_CONCURRENT_NATIVE_KEY', status: 'PASS', rows: 1, sentResults: 1 })
}
