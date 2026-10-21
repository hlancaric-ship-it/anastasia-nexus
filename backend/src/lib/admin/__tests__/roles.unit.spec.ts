import { ADMIN_ROLE_METADATA_KEY, adminCan, adminRoleOf, normalizeAdminRole } from '../roles'

describe('Role v administrácii (vlastník / asistent)', () => {
  it('prečíta rolu z metadát administrátora', () => {
    expect(adminRoleOf({ metadata: { [ADMIN_ROLE_METADATA_KEY]: 'assistant' } })).toBe('assistant')
    expect(adminRoleOf({ metadata: { [ADMIN_ROLE_METADATA_KEY]: 'owner' } })).toBe('owner')
  })

  it('neznáma alebo chýbajúca rola zostáva vlastník (nič sa nemení)', () => {
    expect(adminRoleOf({ metadata: {} })).toBe('owner')
    expect(adminRoleOf({ metadata: { [ADMIN_ROLE_METADATA_KEY]: 'superuser' } })).toBe('owner')
    expect(adminRoleOf(null)).toBe('owner')
  })

  it('prevedie len známe hodnoty', () => {
    expect(normalizeAdminRole('OWNER')).toBe('owner')
    expect(normalizeAdminRole(' assistant ')).toBe('assistant')
    expect(normalizeAdminRole('host')).toBeNull()
    expect(normalizeAdminRole(undefined)).toBeNull()
  })

  it('vlastník smie všetko, asistent iba dennú prácu', () => {
    expect(adminCan('owner', 'pricing')).toBe(true)
    expect(adminCan('owner', 'access')).toBe(true)
    expect(adminCan('owner', 'roles')).toBe(true)
    expect(adminCan('owner', 'orders')).toBe(true)

    expect(adminCan('assistant', 'orders')).toBe(true)
    expect(adminCan('assistant', 'customers')).toBe(true)
    expect(adminCan('assistant', 'catalog')).toBe(true)
    expect(adminCan('assistant', 'content')).toBe(true)
    // Ceny, zľavy, prístup a role sú vyhradené vlastníkovi.
    expect(adminCan('assistant', 'pricing')).toBe(false)
    expect(adminCan('assistant', 'access')).toBe(false)
    expect(adminCan('assistant', 'roles')).toBe(false)
  })
})
