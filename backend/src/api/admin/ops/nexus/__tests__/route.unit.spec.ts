jest.mock('../../../../../lib/observability/events', () => ({ recordEvent: jest.fn(async () => {}) }))
jest.mock('../../../../../lib/nexus/operations', () => ({ loadOperations: jest.fn(), operationsPage: jest.fn(() => ({ kind: 'executions', limit: 25, offset: 0 })) }))
import { recordEvent } from '../../../../../lib/observability/events'
import { GET } from '../route'
import { loadOperations, operationsPage } from '../../../../../lib/nexus/operations'
const response = () => ({ setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as any
beforeEach(() => jest.clearAllMocks())
it.each([undefined, { actor_type: 'customer', actor_id: 'cust_other' }])('requires an admin before accessing NEXUS (%j)', async auth_context => {
  const res = response()
  await GET({ query: {}, auth_context } as any, res)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(loadOperations).not.toHaveBeenCalled()
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})
it('returns the validated read model without business changes', async () => {
  jest.mocked(loadOperations).mockResolvedValue({ kind: 'executions', limit: 25, offset: 0, count: 0, items: [] })
  const res = response()
  await GET({ query: {}, auth_context: { actor_type: 'user', actor_id: 'user_synthetic' } } as any, res)
  expect(res.json).toHaveBeenCalledWith({ kind: 'executions', limit: 25, offset: 0, count: 0, items: [] })
})
it('returns a plain Slovak message without leaking connector error details', async () => {
  jest.mocked(loadOperations).mockRejectedValue(new Error('private-credential'))
  const res = response()
  await GET({ query: {}, auth_context: { actor_type: 'user', actor_id: 'user_synthetic' } } as any, res)
  expect(res.status).toHaveBeenCalledWith(503)
  expect(recordEvent).toHaveBeenCalledWith(undefined, 'error', 'admin_audit', 'nexus_status_unavailable', { error_code: 'NEXUS_OPERATIONS_UNAVAILABLE' })
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-credential')
})
it('rejects a bad query before fetching', async () => {
  jest.mocked(operationsPage).mockImplementationOnce(() => { throw new Error('bad query') })
  const res = response()
  await GET({ query: {}, auth_context: { actor_type: 'user', actor_id: 'user_synthetic' } } as any, res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(loadOperations).not.toHaveBeenCalled()
})
