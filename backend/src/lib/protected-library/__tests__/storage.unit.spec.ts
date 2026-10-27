import { protectedStorageFromEnv, PROTECTED_UPLOAD_URL_TTL_SECONDS } from '../storage'

describe('Konfigurácia súkromného úložiiska', () => {
  const complete = {
    PROTECTED_R2_ENDPOINT: 'https://ucet.r2.cloudflarestorage.com',
    PROTECTED_R2_BUCKET: 'anastasia-media',
    PROTECTED_R2_ACCESS_KEY_ID: 'AKIA_TEST',
    PROTECTED_R2_SECRET_ACCESS_KEY: 'secret-test',
  }

  it('načíta bucket, endpoint a účet len z konfigurácie', () => {
    const storage = protectedStorageFromEnv(complete as NodeJS.ProcessEnv)
    expect(storage).not.toBeNull()
    expect(storage?.endpoint).toBe('https://ucet.r2.cloudflarestorage.com')
    expect(storage?.bucket).toBe('anastasia-media')
    expect(storage?.region).toBe('auto')
  })

  it('neuhádza chýbajúcu konfiguráciu a neprejde na http', () => {
    expect(protectedStorageFromEnv({} as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_BUCKET: '' } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_ACCESS_KEY_ID: '' } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_SECRET_ACCESS_KEY: '' } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_ENDPOINT: 'not-an-url' } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_ENDPOINT: 'http://ucet.r2.cloudflarestorage.com' } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, PROTECTED_R2_BUCKET: 'nie bucket' } as NodeJS.ProcessEnv)).toBeNull()
  })

  it('neobsahuje v kóde natvrdo žiadny názov bucketu ani účtu', () => {
    const source = require('node:fs').readFileSync(require.resolve('../storage'), 'utf8') as string
    expect(source).not.toContain('anastasia-media')
    // Konkrétny účet R2 (nie placeholder v komentári) by v kóde nemal byť.
    expect(source).not.toMatch(/https:\/\/[a-z0-9]{6,}\.r2\.cloudflarestorage\.com/)
  })

  it('drží platnosť presigned URL medzi 10 a 60 minútami', () => {
    expect(PROTECTED_UPLOAD_URL_TTL_SECONDS).toBeGreaterThanOrEqual(600)
    expect(PROTECTED_UPLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(3600)
  })
  it('odmietne súkromný bucket, ktorý je zároveň verejným bucketom obrázkov (fail closed)', () => {
    const bucket = complete.PROTECTED_R2_BUCKET
    expect(protectedStorageFromEnv({ ...complete, S3_BUCKET: bucket } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, S3_BUCKET: bucket, S3_ENDPOINT: complete.PROTECTED_R2_ENDPOINT } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, S3_FILE_URL: `https://cdn.example.test/${bucket}` } as NodeJS.ProcessEnv)).toBeNull()
    expect(protectedStorageFromEnv({ ...complete, S3_FILE_URL: `https://${bucket}.r2.dev` } as NodeJS.ProcessEnv)).toBeNull()
    // Iný verejný bucket je v poriadku.
    expect(protectedStorageFromEnv({ ...complete, S3_BUCKET: 'public-images', S3_FILE_URL: `https://cdn.example.test/${bucket}-public` } as NodeJS.ProcessEnv)).not.toBeNull()
    expect(protectedStorageFromEnv({ ...complete, S3_BUCKET: bucket, S3_ENDPOINT: 'https://other-account.r2.cloudflarestorage.com' } as NodeJS.ProcessEnv)).not.toBeNull()
  })
})
