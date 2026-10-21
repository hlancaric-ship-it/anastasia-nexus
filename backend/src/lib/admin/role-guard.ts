import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminActor } from "../observability/audit"
import { resolveAdminRole } from "./roles"

/**
 * Zábrana pred samovolným zvýšením práv.
 *
 * Natívne `POST /admin/users/:id` (a `POST /admin/users/me`) dovolí zapísať
 * `metadata` administrátora – asistent by si tak mohol prepísať
 * `metadata.anastasia_role` na `owner` a prejsť na vlastníka. Preto zápis
 * metadát administrátora smie iba vlastník; asistent dostane 403.
 *
 * Zápis metadát bez kľúča `anastasia_role` sa tiež odmietne – Medusa pri
 * aktualizácii metadáta nenásobí (nahrádza ich), takže by sa rola zrušila.
 */
export async function protectAdminRoleMetadata(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const actor = adminActor(req as never)
  if (!actor) return next() // neprihláseného vyrieši auth middleware Medusy
  const body = (req.body ?? {}) as { metadata?: unknown }
  const touchesMetadata = body.metadata !== undefined && body.metadata !== null
  if (!touchesMetadata) return next()
  const role = await resolveAdminRole(req.scope as never, actor)
  if (role === "owner") return next()
  res.status(403).json({ message: "Rolu administrátora môže meniť iba vlastník administrácie." })
}

/**
 * Nového administrátora zakladá iba vlastník. Nový účet má predvolenú rolu
 * `owner`, takže by inak asistent mohol vytvoriť kolegu s plnými právami.
 */
export async function protectAdminUserCreation(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const actor = adminActor(req as never)
  if (!actor) return next()
  const role = await resolveAdminRole(req.scope as never, actor)
  if (role === "owner") return next()
  res.status(403).json({ message: "Nového administrátora môže pridať iba vlastník administrácie." })
}
