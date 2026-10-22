import { GET, POST, DELETE } from '../admin-2fa/route'
import { POST as VERIFY } from '../admin-2fa/verify/route'
import { POST as RECOVERY } from '../admin-2fa/recovery-codes/route'

jest.mock('../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const authService = {
  listAuthMfa: jest.fn(async () => [{ id: 'mfa_1', provider: 'totp', status: 'enabled' }]),
  listAuthMfaRecoveryCodes: jest.fn(async () => [{ id: 'rc_1' }, { id: 'rc_2' }]),
  startAuthMfa: jest.fn(async () => ({ mfa: { id: 'mfa_new', provider: 'totp', status: 'pending' }, secret: 'JBSWY3DPEHPK3PXP', otpauth_url: 'otpauth://totp/ANASTASIA:admin' })),
  verifyAuthMfa: jest.fn(async () => ({ id: 'mfa_new', provider: 'totp', status: 'enabled' })),
  disableAuthMfa: jest.fn(async () => ({ id: 'mfa_new', provider: 'totp', status: 'disabled' })),
  generateAuthMfaRecoveryCodes: jest.fn(async () => ({ codes: ['code-1', 'code-2'] })),
}

const userService = { retrieveUser: jest.fn(async () => ({ id: 'user_1', email: 'admin@anastasia.test', metadata: {} })) }

function fixture(actorId: string | null = 'user_1', body: unknown = {}) {
  const req: any = {
    body,
    query: {},
    params: {},
    auth_context: actorId ? { actor_type: 'user', actor_id: actorId, auth_identity_id: 'authid_1' } : undefined,
    scope: {
      resolve: (key: string) => {
        if (key === 'auth') return authService
        if (key === 'user') return userService
        return { error: jest.fn(), info: jest.fn() }
      },
    },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res }
}

beforeEach(() => jest.clearAllMocks())

describe('Dvojfaktorové overenie administrátora (TOTP)', () => {
  it('zamietne zákazníka', async () => {
    const f = fixture(null)
    await GET(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
    expect(authService.listAuthMfa).not.toHaveBeenCalled()
  })

  it('vráti stav 2FA bez tajomstva', async () => {
    const f = fixture()
    await GET(f.req, f.res)
    const body = f.res.json.mock.calls[0][0]
    expect(body).toMatchObject({ enrolled: true, provider: 'totp', factor_id: 'mfa_1', recovery_codes_remaining: 2 })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('začne enroláciu a vráti tajomstvo s otpauth URI (pre QR)', async () => {
    const f = fixture()
    await POST(f.req, f.res)
    expect(authService.startAuthMfa).toHaveBeenCalledWith(expect.objectContaining({ auth_identity_id: 'authid_1', provider: 'totp' }))
    const body = f.res.json.mock.calls[0][0]
    expect(body).toMatchObject({ factor_id: 'mfa_new', secret: 'JBSWY3DPEHPK3PXP' })
    expect(body.otpauth_url).toContain('otpauth://totp/')
  })

  it('overením kódu zapne 2FA a vráti záložné kódy', async () => {
    const f = fixture('user_1', { factor_id: 'mfa_new', code: '123456' })
    await VERIFY(f.req, f.res)
    expect(authService.verifyAuthMfa).toHaveBeenCalledWith(expect.objectContaining({ id: 'mfa_new', code: '123456' }))
    const body = f.res.json.mock.calls[0][0]
    expect(body.enabled).toBe(true)
    expect(body.recovery_codes).toEqual(['code-1', 'code-2'])
  })

  it('bez kódu sa 2FA nezapne', async () => {
    const f = fixture('user_1', { factor_id: 'mfa_new' })
    await VERIFY(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(authService.verifyAuthMfa).not.toHaveBeenCalled()
  })

  it('vypnutie vyžaduje platný kód', async () => {
    const withoutCode = fixture('user_1', { factor_id: 'mfa_new' })
    await DELETE(withoutCode.req, withoutCode.res)
    expect(withoutCode.res.status).toHaveBeenCalledWith(400)

    const withCode = fixture('user_1', { factor_id: 'mfa_new', code: '123456' })
    await DELETE(withCode.req, withCode.res)
    expect(authService.disableAuthMfa).toHaveBeenCalledWith(expect.objectContaining({ id: 'mfa_new', code: '123456' }))
    expect(withCode.res.json.mock.calls[0][0]).toMatchObject({ enabled: false })
  })

  it('vygeneruje nové záložné kódy', async () => {
    const f = fixture('user_1', { count: 5 })
    await RECOVERY(f.req, f.res)
    expect(authService.generateAuthMfaRecoveryCodes).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }))
    expect(f.res.json.mock.calls[0][0]).toEqual({ recovery_codes: ['code-1', 'code-2'] })
  })
})
