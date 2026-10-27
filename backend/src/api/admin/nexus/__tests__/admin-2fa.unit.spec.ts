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
  createAuthMfaChallenge: jest.fn(async () => ({ id: 'ch_1' })),
  verifyAuthMfaChallenge: jest.fn(async ({ code }: any) => {
    if (code !== '123456') throw new Error('Invalid MFA verification code')
    return { id: 'ch_1', completed_at: new Date() }
  }),
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

  it('vypnutie odmietne nesprávny kód aj cudzí faktor (Medusa pri politike session kód neoverí)', async () => {
    const wrong = fixture('user_1', { factor_id: 'mfa_1', code: '000000' })
    await DELETE(wrong.req, wrong.res)
    expect(wrong.res.status).toHaveBeenCalledWith(400)
    expect(authService.disableAuthMfa).not.toHaveBeenCalled()

    authService.listAuthMfa.mockImplementationOnce(async () => [])
    const foreign = fixture('user_1', { factor_id: 'mfa_other', code: '123456' })
    await DELETE(foreign.req, foreign.res)
    expect(foreign.res.status).toHaveBeenCalledWith(400)
    expect(authService.disableAuthMfa).not.toHaveBeenCalled()
    expect(authService.listAuthMfa).toHaveBeenCalledWith({ id: 'mfa_other', auth_identity_id: 'authid_1' })
  })

  it('vygeneruje nové záložné kódy len s platným kódom z aplikácie', async () => {
    const f = fixture('user_1', { count: 5, code: '123456' })
    await RECOVERY(f.req, f.res)
    expect(authService.verifyAuthMfaChallenge).toHaveBeenCalledWith({ id: 'ch_1', method: 'totp', code: '123456' })
    expect(authService.generateAuthMfaRecoveryCodes).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }))
    expect(f.res.json.mock.calls[0][0]).toEqual({ recovery_codes: ['code-1', 'code-2'] })
  })

  it('bez kódu alebo s nesprávnym kódom záložné kódy nevzniknú (ukradnutá relácia)', async () => {
    const missing = fixture('user_1', { count: 5 })
    await RECOVERY(missing.req, missing.res)
    expect(missing.res.status).toHaveBeenCalledWith(400)

    const wrong = fixture('user_1', { code: '999999' })
    await RECOVERY(wrong.req, wrong.res)
    expect(wrong.res.status).toHaveBeenCalledWith(403)

    authService.listAuthMfa.mockImplementationOnce(async () => [{ id: 'mfa_1', provider: 'totp', status: 'pending' }])
    const notEnrolled = fixture('user_1', { code: '123456' })
    await RECOVERY(notEnrolled.req, notEnrolled.res)
    expect(notEnrolled.res.status).toHaveBeenCalledWith(403)
    expect(authService.generateAuthMfaRecoveryCodes).not.toHaveBeenCalled()
  })
})
