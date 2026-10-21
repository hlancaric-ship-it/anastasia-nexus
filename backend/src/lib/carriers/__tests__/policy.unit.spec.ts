import {
  CARRIER_METADATA_KEY,
  carrierId,
  carrierStatus,
  decryptSecret,
  encryptSecret,
  maskSecret,
  readCarrierSettings,
  secretKey,
  validateApiKey,
  writeCarrierSettings,
} from '../policy'

describe('Dopravci – nastavenia a šifrovanie kľúča', () => {
  it('rozpozná iba podporovaných dopravcov', () => {
    expect(carrierId('packeta')).toBe('packeta')
    expect(carrierId('GLS')).toBe('gls')
    expect(carrierId('dhl')).toBeNull()
    expect(carrierId(null)).toBeNull()
  })

  it('zašifruje a rozšifruje API kľúč', () => {
    const secret = secretKey({ CARRIER_SETTINGS_SECRET: 'x'.repeat(40) })
    const payload = encryptSecret('packeta-secret-key-123', secret)
    expect(payload).not.toContain('packeta-secret-key-123')
    expect(payload.startsWith('v1.')).toBe(true)
    expect(decryptSecret(payload, secret)).toBe('packeta-secret-key-123')
  })

  it('odmietne kľúč rozšifrovaný iným tajomstvom', () => {
    const payload = encryptSecret('tajomny-kluc', secretKey({ CARRIER_SETTINGS_SECRET: 'a'.repeat(40) }))
    expect(decryptSecret(payload, secretKey({ CARRIER_SETTINGS_SECRET: 'b'.repeat(40) }))).toBeNull()
    expect(decryptSecret('v1.nezmysel', secretKey({ CARRIER_SETTINGS_SECRET: 'a'.repeat(40) }))).toBeNull()
  })

  it('vyžaduje dostatočne dlhý tajomstný kľúč', () => {
    expect(() => secretKey({ CARRIER_SETTINGS_SECRET: 'kratke' })).toThrow('CARRIER_SETTINGS_SECRET_CHYBA')
    expect(() => secretKey({})).toThrow('CARRIER_SETTINGS_SECRET_CHYBA')
  })

  it('zobrazí z kľúča len posledné štyri znaky', () => {
    expect(maskSecret('abcdefgh1234')).toBe('••••1234')
    expect(maskSecret('')).toBe('')
  })

  it('uchová nastavenia v metadátach obchodu bez toho, abyPrepísal ostatné kľúče', () => {
    const metadata = writeCarrierSettings({ iny: 'hodnota' }, {
      provider: 'sps', api_key_encrypted: 'v1.x', api_key_hint: '••••1234', updated_at: '2026-10-21T00:00:00.000Z', updated_by: 'admin_1',
    })
    expect(metadata.iny).toBe('hodnota')
    expect((metadata as any)[CARRIER_METADATA_KEY].provider).toBe('sps')
    const back = readCarrierSettings(metadata)
    expect(back.provider).toBe('sps')
    expect(back.api_key_hint).toBe('••••1234')
  })

  it('pri chýbajúcich alebo poškodených metadátach vráti prázdne nastavenie', () => {
    expect(readCarrierSettings(null).provider).toBeNull()
    expect(readCarrierSettings({ [CARRIER_METADATA_KEY]: 'nie-json' }).provider).toBeNull()
    expect(readCarrierSettings({ [CARRIER_METADATA_KEY]: { provider: 5 } }).provider).toBeNull()
  })

  it('zobrazí stav dopravcov a nikdy neukáže kľúč', () => {
    const status = carrierStatus({ provider: 'gls', api_key_encrypted: 'v1.x', api_key_hint: '••••9999', updated_at: null, updated_by: null })
    expect(status).toHaveLength(4)
    const gls = status.find((s) => s.id === 'gls')!
    expect(gls.active).toBe(true)
    expect(gls.has_key).toBe(true)
    expect(gls.key_hint).toBe('••••9999')
    expect(gls.status_label).toBe('nepripojené')
    const packeta = status.find((s) => s.id === 'packeta')!
    expect(packeta.active).toBe(false)
    expect(packeta.has_key).toBe(false)
    expect(JSON.stringify(status)).not.toContain('v1.x')
  })

  it('overí API kľúč', () => {
    expect(validateApiKey('dostatocne-dlhy-kluc').ok).toBe(true)
    expect(validateApiKey('kratky').ok).toBe(false)
    expect(validateApiKey('').ok).toBe(false)
    expect(validateApiKey('k luc s medzerami').ok).toBe(false)
    expect(validateApiKey('x'.repeat(201)).ok).toBe(false)
  })
})
