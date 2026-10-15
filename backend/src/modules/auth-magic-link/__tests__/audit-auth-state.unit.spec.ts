import MagicLinkAuthService from '../service'
import { sha256Hex, stateKey } from '../policy'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
const NativeAuth = require('@medusajs/auth/dist/services/auth-module').default

// Execute the installed Medusa implementation, not a reimplementation of getState.
function setup() {
  const store = new Map<string, unknown>()
  const identity = { id: 'auth_audit', app_metadata: { customer_id: 'cus_audit' } }
  const native = NativeAuth.prototype.getAuthIdentityProviderService.call({
    cache_: { get: async (key: string) => store.get(key) ?? null, set: async (key: string, value: unknown) => { store.set(key, value) }, invalidate: async (key: string) => { store.delete(key) } },
    authIdentityService_: { list: async () => [identity] },
    baseRepository_: { serialize: async (value: unknown) => value },
  }, 'magic-link')
  const emit = jest.fn(async () => undefined)
  const provider = new (MagicLinkAuthService as any)({
    logger: { error: jest.fn(), warn: jest.fn() },
    [ContainerRegistrationKeys.PG_CONNECTION]: { raw: async () => ({ rows: [{ id: 'cus_audit' }] }) },
    [Modules.EVENT_BUS]: { emit },
  }, { linkBaseUrl: 'https://app.example.test/login' })
  const email = 'synthetic@example.test', token = 'synthetic-valid-random-placeholder'
  store.set(stateKey(email), { email, tokenHash: sha256Hex(token) })
  return { provider, native, email, token, emit }
}
describe('audit: actual Medusa magic-link state consumption', () => {
  it('AUD-AUTH-01: a wrong anonymous token consumes the valid pending link', async () => {
    const { provider, native, email, token } = setup()
    expect((await provider.authenticate({ body: { email, token: 'wrong' } }, native)).success).toBe(false)
    expect((await provider.authenticate({ body: { email, token } }, native)).success).toBe(false)
  })
  it('AUD-AUTH-02: concurrent reads can both authenticate the same supposedly single-use token', async () => {
    const { provider, native, email, token } = setup()
    const results = await Promise.all([1, 2].map(() => provider.authenticate({ body: { email, token } }, native)))
    expect(results.filter(result => result.success)).toHaveLength(2)
    expect((await provider.authenticate({ body: { email, token } }, native)).success).toBe(false)
  })
  it('AUD-AUTH-03: provider has no request-link throttle (HTTP reachability separately checked)', async () => {
    const { provider, native, email, emit } = setup()
    for (let i = 0; i < 12; i++) await provider.authenticate({ body: { email } }, native)
    expect(emit).toHaveBeenCalledTimes(12)
  })
})
