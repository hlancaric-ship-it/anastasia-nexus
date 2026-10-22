import { MAGIC_LINK_TTL_SECONDS, sha256Hex } from "./policy"
export type AuthPg = { raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }> }
/** No raw address or bearer token is persisted. Only the latest link remains valid. */
export async function storeLink(db: AuthPg, email: string, token: string) {
  await db.raw(`insert into auth_link_state (id, token_hash, expires_at) values (?, ?, now() + (? * interval '1 second'))
    on conflict (id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, updated_at = now()`,
    [sha256Hex(email), sha256Hex(token), MAGIC_LINK_TTL_SECONDS])
}
/** A wrong token cannot delete a legitimate link. DELETE is atomic across processes. */
export async function consumeLink(db: AuthPg, email: string, token: string): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false
  const { rows } = await db.raw(`delete from auth_link_state where id = ? and token_hash = ? and expires_at > now() returning id`, [sha256Hex(email), sha256Hex(token)])
  return rows.length === 1
}
/**
 * Odhlásenie: zneplatní JWT zákazníka na serveri (Medusa tokeny sú bezstavové).
 * Ukladá sa iba hash tokenu, platnosť revokácie je ohraničená exp tokenu
 * (bez exp zostane týždeň). Opakované odhlásenie je idempotentné.
 */
export async function revokeToken(db: AuthPg, token: string, expUnix?: number | null): Promise<void> {
  if (typeof token !== "string" || !token || token.length > 4096) return
  const exp = typeof expUnix === "number" && Number.isFinite(expUnix) && expUnix > 0 ? Math.trunc(expUnix) : null
  await db.raw(`insert into auth_token_revocation (id, expires_at) values (?, case when ?::double precision is null then now() + interval '7 days' else to_timestamp(?::double precision) end)
    on conflict (id) do nothing`, [sha256Hex(token), exp, exp])
  // Prošlé revokácie netreba pamätať navždy: uklidíme najviac 500 riadkov naraz.
  await db.raw(`delete from auth_token_revocation where ctid in (select ctid from auth_token_revocation where expires_at <= now() limit 500)`)
}
/** Je token odhlásený? Vypršalá revokácia (expired) token znova neblokuje. */
export async function isTokenRevoked(db: AuthPg, token: string): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 4096) return false
  const { rows } = await db.raw(`select 1 from auth_token_revocation where id = ? and expires_at > now() limit 1`, [sha256Hex(token)])
  return rows.length > 0
}
export async function claimAuthRate(db: AuthPg, subject: string, limit: number, seconds: number) {
  const { rows } = await db.raw(`insert into auth_link_rate (id, attempts, expires_at) values (?, 1, now() + (? * interval '1 second'))
    on conflict (id) do update set
      attempts = case when auth_link_rate.expires_at <= now() then 1 else least(auth_link_rate.attempts + 1, ?) end,
      expires_at = case when auth_link_rate.expires_at <= now() then excluded.expires_at else auth_link_rate.expires_at end,
      updated_at = now()
    returning attempts, greatest(1, ceil(extract(epoch from (expires_at - now())))) as retry_after`,
    [sha256Hex(subject), seconds, limit + 1])
  if (!rows[0]) throw new Error("AUTH_RATE_UNAVAILABLE")
  return { allowed: Number(rows[0].attempts) <= limit, retryAfter: Number(rows[0].retry_after) }
}
