/**
 * GET /admin/carriers – stav dopravcov (Nastavenia → Pripojenia → Dopravca).
 * POST /admin/carriers – uloženie zvoleného dopravcu a jeho API kľúča (uloží sa šifrovaný na serveri).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'
import type { IStoreModuleService } from '@medusajs/types'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import {
  CARRIERS,
  carrierId,
  carrierStatus,
  encryptSecret,
  maskSecret,
  readCarrierSettings,
  secretKey,
  validateApiKey,
  writeCarrierSettings,
} from '../../../lib/carriers/policy'

const storeService = (req: AuthenticatedMedusaRequest) => req.scope.resolve<IStoreModuleService>(Modules.STORE)

/** Obchod (jediný riadok v tabuľke store) – v ňom sú uložené nastavenia dopravcu. */
async function currentStore(req: AuthenticatedMedusaRequest) {
  const [store] = await storeService(req).listStores({}, { take: 1 })
  return store ?? null
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await currentStore(req)
    const settings = readCarrierSettings(store?.metadata)
    return res.json({ carriers: carrierStatus(settings), supported: CARRIERS.map((c) => ({ id: c.id, label: c.label, hint: c.hint })) })
  } catch {
    return res.status(503).json({ message: 'Nastavenia dopravcu sa teraz nedajú načítať. Skúste to znova.' })
  }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const provider = carrierId((req.body as any)?.provider)
  if (!provider) return res.status(400).json({ message: 'Vyberte dopravcu zo zoznamu.' })
  const rawKey = (req.body as any)?.api_key
  const cleared = rawKey === null || rawKey === ''
  const validated = cleared ? { ok: true as const, key: '' } : validateApiKey(rawKey)
  if (!validated.ok) return res.status(400).json({ message: validated.message })
  try {
    const store = await currentStore(req)
    if (!store) return res.status(503).json({ message: 'Nastavenia dopravcu sa teraz nedajú uložiť. Skúste to znova.' })
    const before = readCarrierSettings(store.metadata)
    const secret = secretKey()
    const settings = {
      provider,
      api_key_encrypted: cleared ? null : encryptSecret(validated.key, secret),
      api_key_hint: cleared ? null : maskSecret(validated.key),
      updated_at: new Date().toISOString(),
      updated_by: actor,
    }
    const metadata = writeCarrierSettings(store.metadata, settings)
    await storeService(req).updateStores(store.id, { metadata })
    const verified = readCarrierSettings((await storeService(req).retrieveStore(store.id)).metadata)
    if (verified.provider !== provider) throw new Error('CARRIER_READBACK_MISMATCH')
    await auditAdminChange(req, 'admin.carrier.update', 'store', store.id, { provider: before.provider }, { provider: verified.provider, has_key: Boolean(verified.api_key_encrypted) })
    return res.json({ carriers: carrierStatus(verified) })
  } catch (error) {
    if (error instanceof Error && error.message === 'CARRIER_SETTINGS_SECRET_CHYBA') {
      return res.status(503).json({ message: 'Server nie je nastavený na ukladanie kľúčov dopravcu. Obrátte sa na podporu.' })
    }
    return res.status(503).json({ message: 'Nastavenia dopravcu sa nepodarilo uložiť. Skúste to znova.' })
  }
}
