/**
 * GET /admin/novinky – celý dokument Noviniek pre administráciu (aj skryté a naplánované príspevky),
 *   s počtom hlasov v anketách a kliknutí na reklamy.
 * PUT /admin/novinky – uloženie celého dokumentu (validácia na serveri, revízia, kontrola zápisu, audit).
 */
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { adminActor, auditAdminChange } from '../../../lib/observability/audit'
import {
  CATEGORIES, KINDS, LIMITS, NovinkyValidationError, docRevision, mediaOrigins, publicPoll, readDoc, validateDoc, writeDoc,
  type NovinkyDoc,
} from '../../../lib/novinky/policy'
import { readClicks, readVotes } from '../../../lib/novinky/store'
import { readMedia, readStore, writeStoreMetadata } from '../../../lib/pages/store'
import { REVISION_CONFLICT_MESSAGE, isRevisionConflict } from '../../../lib/revision'

async function adminView(req: AuthenticatedMedusaRequest, doc: NovinkyDoc) {
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const [votes, clicks] = await Promise.all([readVotes(db, doc), readClicks(db)])
  return {
    ...doc,
    posts: doc.posts.map((post) => ({ ...post, results: publicPoll(post, votes) })),
    ads: doc.ads.map((ad) => ({ ...ad, clicks: clicks[ad.slot] ?? 0 })),
    revision: docRevision(doc),
    schema: { categories: CATEGORIES, kinds: KINDS, limits: LIMITS },
  }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!adminActor(req)) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  try {
    const store = await readStore(req.scope)
    return res.json(await adminView(req, readDoc(store?.metadata)))
  } catch {
    return res.status(503).json({ message: 'Novinky sa teraz nedajú načítať. Skúste to znova.' })
  }
}

export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const actor = adminActor(req)
  if (!actor) return res.status(401).json({ message: 'Prihláste sa do administrácie.' })
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    const store = await readStore(req.scope)
    if (!store) return res.status(503).json({ message: 'Novinky sa teraz nedajú uložiť. Skúste to znova.' })
    const previous = readDoc(store.metadata)
    if (isRevisionConflict(body.revision, docRevision(previous))) {
      return res.status(409).json({ message: REVISION_CONFLICT_MESSAGE })
    }
    let validated: ReturnType<typeof validateDoc>
    try {
      const origins = mediaOrigins(process.env, readMedia(store.metadata).map((m) => m.url))
      validated = validateDoc(body, { origins, previous })
    } catch (error) {
      if (error instanceof NovinkyValidationError) return res.status(400).json({ message: error.message })
      throw error
    }
    // Čas uloženia musí byť vždy nový, inak by revízia neodhalila súbežnú zmenu v tej istej milisekunde.
    let updatedAt = new Date().toISOString()
    if (previous.updated_at && updatedAt <= previous.updated_at) updatedAt = new Date(Date.parse(previous.updated_at) + 1).toISOString()
    const next: NovinkyDoc = { ...validated, updated_at: updatedAt, updated_by: actor }
    await writeStoreMetadata(req.scope, store.id, writeDoc(store.metadata, next))
    const verified = readDoc((await readStore(req.scope))?.metadata)
    if (verified.updated_at !== updatedAt || verified.posts.length !== next.posts.length) throw new Error('NOVINKY_READBACK_MISMATCH')
    await auditAdminChange(
      req, 'admin.novinky.update', 'store', store.id,
      { posts: previous.posts.length, ads: previous.ads.filter((a) => a.enabled).length },
      { posts: next.posts.length, ads: next.ads.filter((a) => a.enabled).length },
    )
    return res.json(await adminView(req, verified))
  } catch {
    return res.status(503).json({ message: 'Novinky sa nepodarilo uložiť. Skúste to znova.' })
  }
}
