import { loadOperations, operationsPage } from '../operations'

const env = { NEXUS_PRICING_URL: 'https://nexus.example.test/api/nexus/pricing', NEXUS_PRICING_API_KEY: 'synthetic-service-key', NEXUS_TENANT_ID: 'synthetic' }
const page = { kind: 'executions' as const, limit: 25, offset: 0 }
const payload = () => ({ ok: true, version: 1, tenantId: 'synthetic', ...page, count: 1, items: [{
  id: 'intent_synthetic', type: 'WRITE', state: 'UNKNOWN', attempt: 1, updatedAt: '2026-10-16T12:00:00Z',
  statusLabel: 'Treba overiť výsledok', needsReview: true, payload: { secret: 'private-value' },
}], private: 'another-private-value' })

it('requests only server-bound tenant and strips private response fields', async () => {
  const request = jest.fn(async () => new Response(JSON.stringify(payload()))) as any
  const result = await loadOperations(page, env, request)
  const [url, options] = request.mock.calls[0]
  expect(String(url)).toBe('https://nexus.example.test/api/nexus/operations?kind=executions&limit=25&offset=0&tenantId=synthetic')
  expect(options.headers.authorization).toBe('Bearer synthetic-service-key')
  expect(options.redirect).toBe('error')
  expect(options.signal).toBeDefined()
  expect(JSON.stringify(result)).not.toContain('private')
  expect(result.items[0].needsReview).toBe(true)
})

it.each([
  { tenantId: 'other' }, { version: 2 }, { limit: 100 }, { count: -1 }, { kind: 'events' }, { items: [{ state: 'NEW_UNKNOWN_STATE' }] },
])('rejects an untrusted/malformed response %j', async patch => {
  await expect(loadOperations(page, env, async () => new Response(JSON.stringify({ ...payload(), ...patch }))))
    .rejects.toThrow()
})

it.each(['http://remote.example.test/operations', 'https://user:password@example.test/operations'])('does not send credentials to %s', async url => {
  const request = jest.fn() as any
  await expect(loadOperations(page, { ...env, NEXUS_OPERATIONS_URL: url }, request)).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})

it.each([{ kind: 'wrong' }, { tenantId: 'other' }, { limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: ['1'] }, { offset: '-1' }, { offset: '10001' }])('rejects invalid pagination/filter %j', query => {
  expect(() => operationsPage(query)).toThrow('INVALID_OPERATIONS_PAGE')
})

it('accepts validated pages and does not rewrite server counts', async () => {
  expect(operationsPage({ kind: 'events', limit: '10', offset: '20' })).toEqual({ kind: 'events', limit: 10, offset: 20 })
  const result = await loadOperations(page, env, async () => new Response(JSON.stringify(payload())))
  expect(result.count).toBe(1)
})
