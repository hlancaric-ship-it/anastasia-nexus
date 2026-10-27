import { randomBytes } from "node:crypto"

export type SessionActorType = "customer" | "user"
export type AuthSessionPg = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }>
}

function assertActor(actorType: SessionActorType, actorId: string) {
  if ((actorType !== "customer" && actorType !== "user") || typeof actorId !== "string" || !actorId.trim() || actorId.length > 255) {
    throw new Error("AUTH_SESSION_ACTOR_INVALID")
  }
}

/** Missing row means the account is at the initial epoch. Never cache this value across requests. */
export async function getSessionEpoch(db: AuthSessionPg, actorType: SessionActorType, actorId: string): Promise<number> {
  assertActor(actorType, actorId)
  const { rows } = await db.raw(
    "select epoch from auth_session_epoch where actor_type = ? and actor_id = ? limit 1",
    [actorType, actorId],
  )
  const epoch = rows.length ? Number(rows[0].epoch) : 0
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("AUTH_SESSION_EPOCH_INVALID")
  return epoch
}

/** Atomically increments the account-wide epoch; concurrent logout/reset requests cannot lose an increment. */
export async function incrementSessionEpoch(db: AuthSessionPg, actorType: SessionActorType, actorId: string): Promise<number> {
  assertActor(actorType, actorId)
  const id = `ase_${randomBytes(16).toString("hex")}`
  const { rows } = await db.raw(
    `insert into auth_session_epoch (id, actor_type, actor_id, epoch, created_at, updated_at)
     values (?, ?, ?, 1, now(), now())
     on conflict (actor_type, actor_id) do update
       set epoch = auth_session_epoch.epoch + 1, updated_at = now()
     returning epoch`,
    [id, actorType, actorId],
  )
  const epoch = Number(rows[0]?.epoch)
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error("AUTH_SESSION_EPOCH_UPDATE_FAILED")
  return epoch
}
