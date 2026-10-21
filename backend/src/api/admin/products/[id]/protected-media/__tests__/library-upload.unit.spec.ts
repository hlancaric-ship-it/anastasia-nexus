import { POST as UPLOAD_URL } from '../upload-url/route'
import { POST as ATTACH } from '../attach/route'
import { DELETE as DETACH } from '../[key]/route'
import { librarySnapshot } from '../../../../../../lib/protected-library/editor'
import { auditAdminChange } from '../../../../../../lib/observability/audit'
import { headProtectedObject } from '../../../../../../lib/protected-library/storage'

jest.mock('../../../../../../lib/observability/audit', () => ({
  adminActor: (r: any) => (r.auth_context?.actor_type === 'user' ? r.auth_context.actor_id : null),
  auditAdminChange: jest.fn(async () => null),
}))

const stored = new Map<string, { size: number; contentType: string | null }>()
jest.mock('../../../../../../lib/protected-library/storage', () => ({
  protectedStorageFromEnv: jest.fn(() => ({
    endpoint: 'https://ucet.r2.cloudflarestorage.com',
    bucket: 'bucket-test',
    region: 'auto',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  })),
  createProtectedUploadUrl: jest.fn(async (_storage: unknown, params: any) => ({
    url: `https://ucet.r2.cloudflarestorage.com/bucket-test/${params.key}?signature`,
    method: 'PUT',
    headers: { 'content-type': params.contentType },
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    key: params.key,
  })),
  headProtectedObject: jest.fn(async (_storage: unknown, key: string) => stored.get(key) ?? null),
}))

const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

function fixture(metadata: Record<string, unknown> = {}) {
  const product: any = { id: 'prod_test', handle: 'reset-40-plus', metadata }
  const products = {
    updateProducts: jest.fn(async (_id: string, patch: any) => {
      product.metadata = { ...product.metadata, ...patch.metadata }
    }),
  }
  const query = { graph: jest.fn(async () => ({ data: [product] })) }
  const lock = { execute: jest.fn(async (_key: string, fn: () => any) => fn()) }
  const req: any = {
    params: { id: product.id },
    query: {},
    body: {},
    auth_context: { actor_type: 'user', actor_id: 'user_test' },
    scope: { resolve: (key: string) => ({ product: products, locking: lock, query, logger } as any)[key] },
  }
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { req, res, product, products, query, lock }
}

beforeEach(() => {
  jest.clearAllMocks()
  stored.clear()
})

describe('Nahrávanie chránených súborov', () => {
  it('zamietne zákazníka a neprihláseného používateľa', async () => {
    for (const route of [UPLOAD_URL, ATTACH]) {
      const f = fixture()
      f.req.auth_context = { actor_type: 'customer', actor_id: 'cus_test' }
      await route(f.req, f.res)
      expect(f.res.status).toHaveBeenCalledWith(401)
    }
    const f = fixture()
    f.req.auth_context = undefined
    await DETACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(401)
  })

  it('vráti presigned URL na presný kľúč bez údajov o prístupe', async () => {
    const f = fixture()
    f.req.body = { filename: 'Lekcia 1.mp4', size: 1024 }
    await UPLOAD_URL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    const body = f.res.json.mock.calls[0][0]
    expect(body.key).toMatch(/^reset-40-plus\/lekcia-1-[a-z0-9]{6}\.mp4$/)
    expect(body.method).toBe('PUT')
    expect(body.headers['content-type']).toBe('video/mp4')
    expect(body.suggested_title).toBe('Lekcia 1')
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('accessKeyId')
  })

  it('odmietne nepovolený typ a príliš veľký súbor pred čítaním produktu', async () => {
    const f = fixture()
    f.req.body = { filename: 'balik.zip', size: 10 }
    await UPLOAD_URL(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.query.graph).not.toHaveBeenCalled()

    const big = fixture()
    big.req.body = { filename: 'a.mp4', size: 3 * 1024 * 1024 * 1024 }
    await UPLOAD_URL(big.req, big.res)
    expect(big.res.status).toHaveBeenCalledWith(400)
    expect(big.query.graph).not.toHaveBeenCalled()
  })

  it('pripojí nahratý objekt k produktu pod zámkom, s auditem a kontrolou', async () => {
    const f = fixture()
    f.req.body = { key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }
    stored.set('reset-40-plus/lekcia-a1b2c3.mp4', { size: 2048, contentType: 'video/mp4' })
    await ATTACH(f.req, f.res)
    expect(f.lock.execute).toHaveBeenCalledWith('protected-library:prod_test', expect.any(Function))
    expect(f.products.updateProducts).toHaveBeenCalledWith('prod_test', {
      metadata: { protected_media: [{ key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }] },
    })
    expect(auditAdminChange).toHaveBeenCalledTimes(1)
    const body = f.res.json.mock.calls[0][0]
    expect(body.media).toHaveLength(1)
    expect(body.media[0]).toMatchObject({ key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1', kind: 'video' })
  })

  it('odmietne kľúč iného produktu a objekt, ktorý v úložisku nie je', async () => {
    const f = fixture()
    f.req.body = { key: 'nic-nemusis/a1b2c3.mp3' }
    await ATTACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.products.updateProducts).not.toHaveBeenCalled()

    const missing = fixture()
    missing.req.body = { key: 'reset-40-plus/lekcia-a1b2c3.mp4' }
    await ATTACH(missing.req, missing.res)
    expect(missing.res.status).toHaveBeenCalledWith(409)
    expect(missing.products.updateProducts).not.toHaveBeenCalled()
  })

  it('odmietne objekt, ktorý prekračuje limit', async () => {
    const f = fixture()
    f.req.body = { key: 'reset-40-plus/lekcia-a1b2c3.mp3' }
    stored.set('reset-40-plus/lekcia-a1b2c3.mp3', { size: 300 * 1024 * 1024, contentType: 'audio/mpeg' })
    await ATTACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(f.products.updateProducts).not.toHaveBeenCalled()
  })

  it('nepripája ten istý súbor dvakrát', async () => {
    const f = fixture({ protected_media: [{ key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }] })
    f.req.body = { key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }
    stored.set('reset-40-plus/lekcia-a1b2c3.mp4', { size: 10, contentType: 'video/mp4' })
    await ATTACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(409)
    expect(f.products.updateProducts).not.toHaveBeenCalled()
  })

  it('odpojí súbor od produktu, ale objekt v úložisku nechá', async () => {
    const f = fixture({ protected_media: [{ key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }] })
    f.req.params.key = 'reset-40-plus/lekcia-a1b2c3.mp4'
    await DETACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.products.updateProducts).toHaveBeenCalledWith('prod_test', { metadata: { protected_media: [] } })
    expect(headProtectedObject).not.toHaveBeenCalled()
    expect(auditAdminChange).toHaveBeenCalledTimes(1)
    expect(f.res.json.mock.calls[0][0].media).toHaveLength(0)
  })

  it('opakované odpojenie nezapisuje a neaudituje', async () => {
    const f = fixture({ protected_media: [] })
    f.req.params.key = 'reset-40-plus/lekcia-a1b2c3.mp4'
    await DETACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(200)
    expect(f.products.updateProducts).not.toHaveBeenCalled()
    expect(auditAdminChange).not.toHaveBeenCalled()
    expect(f.res.json.mock.calls[0][0].replayed).toBe(true)
  })

  it('neodpojí cudzí kľúč a neopraví tichý prepis pri chybe čítania', async () => {
    const f = fixture({ protected_media: [{ key: 'nic-nemusis/a1b2c3.mp3', title: 'Stop' }] })
    f.req.params.key = 'nic-nemusis/a1b2c3.mp3'
    await DETACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(f.products.updateProducts).not.toHaveBeenCalled()

    const broken = fixture({ protected_media: [{ key: 'reset-40-plus/lekcia-a1b2c3.mp4', title: 'Lekcia 1' }] })
    broken.req.params.key = 'reset-40-plus/lekcia-a1b2c3.mp4'
    broken.products.updateProducts.mockImplementation(async () => {})
    await DETACH(broken.req, broken.res)
    expect(broken.res.status).toHaveBeenCalledWith(503)
    expect(auditAdminChange).not.toHaveBeenCalled()
  })

  it('nechá pôvodné registre Reset 40+ a Nič nemusíš nedotknuté', async () => {
    const metadata = { protected_media: [{ key: 'reset-40-plus/lekcia-00.mp4', title: 'Lekcia 1' }] }
    const f = fixture(metadata)
    const before = librarySnapshot(f.product.metadata)
    f.req.params.key = 'nic-nemusis/A0_nic-nemusis.mp3'
    await DETACH(f.req, f.res)
    expect(f.res.status).toHaveBeenCalledWith(400)
    expect(librarySnapshot(f.product.metadata)).toEqual(before)
  })
})
