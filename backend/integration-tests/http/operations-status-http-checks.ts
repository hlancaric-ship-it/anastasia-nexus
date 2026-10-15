import { createServer } from 'node:http'

/** Real Medusa admin auth and HTTP proxy contract; source D1 is verified separately in workerd. */
export async function verifyOperationsStatusHttp({ api, admin, customer, anonymous, evidence }: any) {
  const previous = process.env.NEXUS_OPERATIONS_URL
  let mode: 'valid' | 'foreign' | 'redirect' = 'valid'
  let redirectHits = 0
  let authorized = true
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://local')
    if (url.pathname === '/redirect-target') redirectHits++
    authorized &&= req.headers.authorization === `Bearer ${process.env.NEXUS_PRICING_API_KEY}` &&
      url.searchParams.get('tenantId') === process.env.NEXUS_TENANT_ID
    if (mode === 'redirect') { res.writeHead(302, { Location: '/redirect-target' }); res.end(); return }
    const payload = { ok: true, version: 1, tenantId: mode === 'foreign' ? 'other' : process.env.NEXUS_TENANT_ID,
      kind: 'executions', count: 1, limit: 25, offset: 0, private: 'synthetic-private', items: [{
        id: 'intent_synthetic_status', type: 'WRITE', state: 'UNKNOWN', attempt: 1,
        updatedAt: '2026-10-16T12:00:00Z', statusLabel: 'Treba overiť výsledok', needsReview: true,
        payload: { secret: 'synthetic-private' },
      }] }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload))
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('SYNTHETIC_STATUS_ADDRESS_INVALID')
    process.env.NEXUS_OPERATIONS_URL = `http://127.0.0.1:${address.port}/operations`
    for (const options of [anonymous, customer]) {
      expect((await api.get('/admin/ops/nexus', options)).status).toBe(401)
    }
    expect((await api.get('/admin/ops/nexus?tenantId=other', admin)).status).toBe(400)
    const response = await api.get('/admin/ops/nexus', admin)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.data.items[0]).toMatchObject({ state: 'UNKNOWN', statusLabel: 'Treba overiť výsledok', needsReview: true })
    expect(JSON.stringify(response.data)).not.toContain('synthetic-private')
    mode = 'foreign'
    expect((await api.get('/admin/ops/nexus', admin)).status).toBe(503)
    mode = 'redirect'
    expect((await api.get('/admin/ops/nexus', admin)).status).toBe(503)
    expect(redirectHits).toBe(0)
    expect(authorized).toBe(true)
    evidence.push({ scenario: 'OPS_NEXUS_STATUS_READONLY', status: 'PASS', admin: 200, anonymous: 401, customer: 401,
      clientTenant: 400, sourceTenantMismatch: 503, redirectBlocked: true, privateFieldsStripped: true })
  } finally {
    if (previous === undefined) delete process.env.NEXUS_OPERATIONS_URL
    else process.env.NEXUS_OPERATIONS_URL = previous
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
