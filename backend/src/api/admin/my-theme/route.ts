import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { ILockingModule, IUserModuleService } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import { storedTheme, themeWrite, THEME_METADATA_KEY } from '../../../lib/admin-theme/policy'

/** Per-admin appearance only. The authenticated actor is the sole target; no user ID accepted. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const id = adminActor(req)
  if (!id) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const user = await req.scope.resolve<IUserModuleService>(Modules.USER).retrieveUser(id)
    return res.json(storedTheme(user.metadata))
  } catch { return res.status(503).json({ message: 'Vzhľad sa teraz nedá načítať. Skúste to znova.' }) }
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const id = adminActor(req)
  if (!id) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const parsed = themeWrite.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Vyberte platný motív a farby v tvare #123456.' })
  try {
    const users = req.scope.resolve<IUserModuleService>(Modules.USER)
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    return await locking.execute(`admin-theme:${id}`, async () => {
      const user = await users.retrieveUser(id)
      const before = storedTheme(user.metadata)
      const same = Object.keys(before.selection).every(key => before.selection[key as keyof typeof before.selection] === parsed.data.selection[key as keyof typeof before.selection])
      if (same) return res.json({ ...before, replayed: true })
      if (before.revision !== parsed.data.revision) return res.status(409).json({ message: 'Vzhľad ste medzičasom zmenili v inom okne. Najprv načítajte uložený vzhľad.' })
      const next = { selection: parsed.data.selection, revision: before.revision + 1 }
      await users.updateUsers({ id, metadata: { ...user.metadata, [THEME_METADATA_KEY]: next } })
      const verified = storedTheme((await users.retrieveUser(id)).metadata)
      if (verified.revision !== next.revision || JSON.stringify(verified.selection) !== JSON.stringify(next.selection)) throw new Error('THEME_READBACK_MISMATCH')
      await auditAdminChange(req, 'admin.theme.update', 'user', id, { theme: before.selection, revision: before.revision }, { theme: verified.selection, revision: verified.revision })
      return res.json({ ...verified, replayed: false })
    })
  } catch { return res.status(503).json({ message: 'Výsledok uloženia vzhľadu treba overiť. Načítajte uložený vzhľad pred ďalším pokusom.' }) }
}
