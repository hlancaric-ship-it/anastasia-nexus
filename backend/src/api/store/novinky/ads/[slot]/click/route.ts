/**
 * POST /store/novinky/ads/:slot/click – započíta kliknutie na reklamu partnera (navigator.sendBeacon).
 * Vždy 204, aby web nečakal; z jednej IP sa započíta najviac jedno kliknutie na plochu za deň.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { clickKey, isAdActive, readDoc } from '../../../../../../lib/novinky/policy'
import { bumpCounter, claimClick } from '../../../../../../lib/novinky/store'
import { readStore } from '../../../../../../lib/pages/store'

export const AUTHENTICATE = false

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const slot = Number(req.params.slot)
  if (![1, 2, 3].includes(slot)) return res.status(404).end()
  try {
    const ad = readDoc((await readStore(req.scope))?.metadata).ads[slot - 1]
    if (!ad || !isAdActive(ad, new Date())) return res.status(204).end()
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const ip = req.ip || req.socket?.remoteAddress || 'unknown-peer'
    if (await claimClick(db, slot, ip)) await bumpCounter(db, clickKey(slot))
  } catch {
    /* štatistika nesmie rozbiť web */
  }
  return res.status(204).end()
}
