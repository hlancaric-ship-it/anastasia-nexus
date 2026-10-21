import {
  buildUploadKey,
  describeLimit,
  isProtectedKeyShape,
  keyBelongsToProduct,
  libraryAttachRequest,
  libraryUploadRequest,
  productFolder,
  PROTECTED_UPLOAD_EXTENSIONS,
  PROTECTED_UPLOAD_TYPES,
  randomKeySuffix,
  slugFromFilename,
  titleFromFilename,
  uploadExtension,
  uploadType,
} from '../upload'

describe('Nahrávanie chránených súborov – pravidlá', () => {
  it('povoľuje len streamovateľné typy (mp4, mp3, m4a, pdf)', () => {
    expect(PROTECTED_UPLOAD_EXTENSIONS).toEqual(['mp4', 'mp3', 'm4a', 'pdf'])
    // ZIP a EPUB by sa dali stiahnuť – platený obsah sa nesmie sťahovať.
    expect(uploadType('balik.zip')).toBeNull()
    expect(uploadType('kniha.epub')).toBeNull()
    expect(uploadType('program.exe')).toBeNull()
    expect(uploadType('bez-pripony')).toBeNull()
    expect(uploadType('dva.body.mp4')).not.toBeNull()
  })

  it('drží limity: 2 GB pre video, 200 MB pre ostatné', () => {
    expect(PROTECTED_UPLOAD_TYPES.mp4.maxBytes).toBe(2 * 1024 * 1024 * 1024)
    expect(PROTECTED_UPLOAD_TYPES.mp3.maxBytes).toBe(200 * 1024 * 1024)
    expect(PROTECTED_UPLOAD_TYPES.m4a.maxBytes).toBe(200 * 1024 * 1024)
    expect(PROTECTED_UPLOAD_TYPES.pdf.maxBytes).toBe(200 * 1024 * 1024)
    expect(describeLimit(PROTECTED_UPLOAD_TYPES.mp4)).toContain('GB')
    expect(describeLimit(PROTECTED_UPLOAD_TYPES.pdf)).toContain('MB')
  })

  it('načíta príponu bez bodu a iba z bezpečnej abecedy', () => {
    expect(uploadExtension('Lekcia 1.MP4')).toBe('mp4')
    expect(uploadExtension('a.b.pdf')).toBe('pdf')
    expect(uploadExtension('.mp4')).toBeNull()
    expect(uploadExtension('mp4')).toBeNull()
    expect(uploadExtension('a.mp4 ')).toBe('mp4')
    expect(uploadExtension('a.m p4')).toBeNull()
  })

  it('odvodí čitateľný názov a slug z mena súboru', () => {
    expect(titleFromFilename('Meditácia ráno.mp3')).toBe('Meditácia ráno')
    expect(titleFromFilename('a_b-c.pdf')).toBe('a b c')
    expect(slugFromFilename('Meditácia ráno.mp3')).toBe('meditacia-rano')
    expect(slugFromFilename('***.pdf')).toBe('subor')
    expect(slugFromFilename('Lekcia 1 – RESET 40+.mp4')).toBe('lekcia-1-reset-40')
  })

  it('vytvorí adresár produktu z handlu a náhradný tvar z id', () => {
    expect(productFolder('reset-40-plus', 'prod_1')).toBe('reset-40-plus')
    expect(productFolder('  ', 'prod_01ABC')).toBe('prod_01ABC')
    expect(productFolder('Reset 40+', 'prod_1')).toBe('reset-40')
    expect(productFolder('../../etc', 'prod_1')).toBe('etc')
    expect(productFolder(null, '')).toBe('produkt')
  })

  it('skladá kľúč ako <handle>/<slug>-<random6>.<ext>', () => {
    const key = buildUploadKey({ folder: 'reset-40-plus', filename: 'Lekcia 1.mp4', suffix: 'a1b2c3' })
    expect(key).toBe('reset-40-plus/lekcia-1-a1b2c3.mp4')
    expect(isProtectedKeyShape(key)).toBe(true)
    expect(isProtectedKeyShape('reset-40-plus/../tajne.mp4')).toBe(false)
    expect(isProtectedKeyShape('/reset-40-plus/a.mp4')).toBe(false)
    expect(isProtectedKeyShape('reset-40-plus/a/b.mp4')).toBe(false)
    // Adresár musí byť ASCII (kľúč sa volí podľa handlu produktu).
    expect(isProtectedKeyShape('iný-produkt/a.mp4')).toBe(false)
    expect(isProtectedKeyShape('reset 40 plus/a.mp4')).toBe(false)
  })

  it('náhodný suffix má šesť znakov a len bezpečné znaky', () => {
    for (let i = 0; i < 20; i++) {
      const suffix = randomKeySuffix()
      expect(suffix).toHaveLength(6)
      expect(suffix).toMatch(/^[a-z0-9]{6}$/)
    }
  })

  it('viaže kľúč len na vlastný produkt', () => {
    expect(keyBelongsToProduct('reset-40-plus/lekcia-a1b2c3.mp4', 'reset-40-plus')).toBe(true)
    expect(keyBelongsToProduct('nic-nemusis/a1b2c3.mp3', 'reset-40-plus')).toBe(false)
    expect(keyBelongsToProduct('reset-40-plus/a/b.mp4', 'reset-40-plus')).toBe(false)
    expect(keyBelongsToProduct('reset-40-plus/../x.mp4', 'reset-40-plus')).toBe(false)
  })

  it('odmietne payload, ktorý nie je požiadavka na nahrávanie', () => {
    expect(libraryUploadRequest.safeParse({ filename: 'a.mp4', size: 10 }).success).toBe(true)
    expect(libraryUploadRequest.safeParse({ filename: '', size: 10 }).success).toBe(false)
    expect(libraryUploadRequest.safeParse({ filename: 'a.mp4' }).success).toBe(false)
    expect(libraryUploadRequest.safeParse({ filename: 'a.mp4', size: 0 }).success).toBe(false)
    expect(libraryUploadRequest.safeParse({ filename: 'a.mp4', size: 1.5 }).success).toBe(false)
    expect(libraryUploadRequest.safeParse({ filename: 'a.mp4', size: 10, bucket: 'x' }).success).toBe(false)
    expect(libraryAttachRequest.safeParse({ key: 'a/a-b123456.mp4' }).success).toBe(true)
    expect(libraryAttachRequest.safeParse({ key: 'a/a-b123456.mp4', title: '  ' }).success).toBe(true)
    expect(libraryAttachRequest.safeParse({ key: 'a/a-b123456.mp4', title: 'x'.repeat(201) }).success).toBe(false)
    expect(libraryAttachRequest.safeParse({ key: 'a/a-b123456.mp4', title: 'x\u0000y' }).success).toBe(false)
  })
})
