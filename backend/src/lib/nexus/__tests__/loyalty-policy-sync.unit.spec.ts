import { createHmac } from 'node:crypto'
import { loyaltyPolicyPayload, loyaltyPolicySyncConfig, syncLoyaltyPolicyToWorker } from '../loyalty-policy-sync'
import type { LoyaltyTier } from '../../loyalty/policy'

const tier = (over: Partial<LoyaltyTier> = {}): LoyaltyTier => ({
  code: 'ZR1', name: 'Bronze', discount_percent: 0, spend_threshold_eur: null, enabled: false, rank: 1, ...over,
})

const env = {
  NEXUS_PRICING_POLICY_URL: 'https://nexus.test/api/nexus/pricing-policy',
  NEXUS_MEDUSA_WEBHOOK_SECRET: 'tajne-podpisovaci-kluc',
  NEXUS_TENANT_ID: 'anastasia',
} as NodeJS.ProcessEnv

describe('Synchronizácia politiky do NEXUS Workera', () => {
  it('vyžaduje URL, tajomstvo a tenanta', () => {
    expect(loyaltyPolicySyncConfig(env)).not.toBeNull()
    expect(loyaltyPolicySyncConfig({ ...env, NEXUS_PRICING_POLICY_URL: '' })).toBeNull()
    expect(loyaltyPolicySyncConfig({ ...env, NEXUS_MEDUSA_WEBHOOK_SECRET: '' })).toBeNull()
    expect(loyaltyPolicySyncConfig({ ...env, NEXUS_TENANT_ID: '' })).toBeNull()
    expect(loyaltyPolicySyncConfig({ ...env, NEXUS_PRICING_POLICY_URL: 'http://evil.test/x' })).toBeNull()
  })

  it('pošle iba kód úrovne a podiel zľavy – nie percentá v textovej podobe', () => {
    const payload = loyaltyPolicyPayload([tier({ code: 'ZR3', enabled: true, discount_percent: 7.5 })], 'anastasia')
    expect(payload).toEqual({ tenantId: 'anastasia', loyaltyTiers: { ZR3: 0.075 } })
    expect(JSON.stringify(payload)).not.toContain('7.5')
  })

  it('podepíše telo rovnakým spôsobom ako medusa webhook', async () => {
    let seen: { url: string; body: string; headers: Record<string, string> } | null = null
    const fetchImpl = (async (url: string, options: any) => {
      seen = { url, body: options.body, headers: options.headers }
      return { ok: true, status: 200, text: async () => JSON.stringify({ accepted: true }) } as any
    }) as unknown as typeof fetch
    const result = await syncLoyaltyPolicyToWorker([tier({ code: 'ZR1', enabled: true, discount_percent: 3 })], env, fetchImpl)
    expect(result.synced).toBe(true)
    const call = seen as any
    const timestamp = call.headers['x-medusa-signature'].split('t=')[1].split(',')[0]
    const expected = createHmac('sha256', env.NEXUS_MEDUSA_WEBHOOK_SECRET!).update(`${timestamp}.${call.body}`).digest('hex')
    expect(call.headers['x-medusa-signature']).toBe(`t=${timestamp},v1=${expected}`)
    expect(JSON.parse(call.body)).toEqual({ tenantId: 'anastasia', loyaltyTiers: { ZR1: 0.03 } })
  })

  it('nevyhlási úspech, keď Worker politiku neprijme', async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ accepted: false }) }) as any) as unknown as typeof fetch
    const result = await syncLoyaltyPolicyToWorker([tier({ enabled: true })], env, fetchImpl)
    expect(result.synced).toBe(false)
    expect(result.error).toBe('NEXUS_POLICY_SYNC_NOT_ACCEPTED')
  })

  it('neskryje chybu siete ani chybnú konfiguráciu', async () => {
    const failing = (async () => { throw new Error('network') }) as unknown as typeof fetch
    const result = await syncLoyaltyPolicyToWorker([tier()], env, failing)
    expect(result).toEqual({ synced: false, status: null, error: 'NEXUS_POLICY_SYNC_UNAVAILABLE' })
    const unconfigured = await syncLoyaltyPolicyToWorker([tier()], {} as NodeJS.ProcessEnv)
    expect(unconfigured).toEqual({ synced: false, status: null, error: 'NEXUS_PRICING_POLICY_NOT_CONFIGURED' })
  })
})
