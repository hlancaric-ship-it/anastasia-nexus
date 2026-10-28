/**
 * Hlasy v anketách a kliknutia na reklamy. Počítadlá sú v zdieľanej tabuľke `legal_rate_limit`
 * (atomické, spoločné pre všetky inštancie, bez migrácie); ukladá sa len hash kľúča.
 * Jeden hlas z jednej IP adresy na anketu za 30 dní.
 */
import { createHash } from 'node:crypto'
import { claimLegalRate } from '../legal/rate-limit'
import { clickKey, voteKey, type NovinkyDoc, type Votes } from './policy'

const COUNTER_LIMIT = 2_000_000_000
const COUNTER_SECONDS = 10 * 365 * 24 * 3600
export const VOTE_WINDOW_SECONDS = 30 * 24 * 3600
export const CLICK_WINDOW_SECONDS = 24 * 3600

const hash = (key: string) => createHash('sha256').update(key).digest('hex')

/** Pripočíta 1 k počítadlu (atomicky). */
export async function bumpCounter(db: any, key: string): Promise<void> {
  await claimLegalRate(db, key, COUNTER_LIMIT, COUNTER_SECONDS)
}

/** Prvý hlas tejto IP v ankete? Druhý pokus v okne vráti false. */
export async function claimVote(db: any, postId: string, ip: string): Promise<boolean> {
  const result = await claimLegalRate(db, `novinky-voter:${postId}:${ip}`, 1, VOTE_WINDOW_SECONDS)
  return result.allowed
}

/** Kliknutie sa započíta len raz za deň z jednej IP na plochu (ochrana štatistiky pred nafúknutím). */
export async function claimClick(db: any, slot: number, ip: string): Promise<boolean> {
  const result = await claimLegalRate(db, `novinky-clicker:${slot}:${ip}`, 1, CLICK_WINDOW_SECONDS)
  return result.allowed
}

/** Načíta počítadlá pre zadané kľúče jedným dopytom. */
export async function readCounters(db: any, keys: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!keys.length) return counts
  const byHash = new Map(keys.map((key) => [hash(key), key]))
  const { rows } = await db.raw(
    `select subject, attempts from legal_rate_limit where subject = any(?) and expires_at > now()`,
    [[...byHash.keys()]],
  )
  for (const row of rows as Array<{ subject: string; attempts: number }>) {
    const key = byHash.get(row.subject)
    if (key) counts.set(key, Number(row.attempts) || 0)
  }
  return counts
}

export function pollKeys(doc: NovinkyDoc): string[] {
  return doc.posts.flatMap((p) => (p.kind === 'poll' && p.poll ? p.poll.options.map((o) => voteKey(p.id, o.id)) : []))
}

export async function readVotes(db: any, doc: NovinkyDoc): Promise<Votes> {
  return readCounters(db, pollKeys(doc))
}

export async function readClicks(db: any): Promise<Record<number, number>> {
  const counts = await readCounters(db, [1, 2, 3].map(clickKey))
  return { 1: counts.get(clickKey(1)) ?? 0, 2: counts.get(clickKey(2)) ?? 0, 3: counts.get(clickKey(3)) ?? 0 }
}
