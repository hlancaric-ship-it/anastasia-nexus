/**
 * POST /store/novinky/polls/:postId/vote { option } – hlas v ankete.
 * Jeden hlas z jednej IP adresy na anketu za 30 dní; opakovaný hlas vráti 409 s aktuálnym stavom.
 */
import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { isPostVisible, publicPoll, readDoc, voteKey } from '../../../../../../lib/novinky/policy'
import { bumpCounter, claimVote, readVotes } from '../../../../../../lib/novinky/store'
import { readStore } from '../../../../../../lib/pages/store'

export const AUTHENTICATE = false

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const postId = String(req.params.postId ?? '')
  const option = String((req.body as { option?: unknown } | undefined)?.option ?? '')
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(postId) || !/^o[0-9]{1,3}$/.test(option)) {
    return res.status(400).json({ error: 'INVALID_VOTE', message: 'Neplatný hlas.' })
  }
  try {
    const store = await readStore(req.scope)
    const doc = readDoc(store?.metadata)
    const post = doc.posts.find((p) => p.id === postId)
    if (!post || post.kind !== 'poll' || !post.poll || !isPostVisible(post, new Date())) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Anketa neexistuje.' })
    }
    if (!post.poll.options.some((o) => o.id === option)) {
      return res.status(400).json({ error: 'INVALID_VOTE', message: 'Neplatný hlas.' })
    }
    const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    const ip = req.ip || req.socket?.remoteAddress || 'unknown-peer'
    const first = await claimVote(db, postId, ip)
    if (first) await bumpCounter(db, voteKey(postId, option))
    const poll = publicPoll(post, await readVotes(db, { ...doc, posts: [post] }))
    if (!first) return res.status(409).json({ error: 'ALREADY_VOTED', message: 'V tejto ankete ste už hlasovali.', poll })
    return res.json({ poll })
  } catch {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Hlas sa teraz nedá uložiť. Skúste to znova.' })
  }
}
