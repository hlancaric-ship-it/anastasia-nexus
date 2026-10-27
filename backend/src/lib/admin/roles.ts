import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Jednoduché role v administrácii: vlastník a asistent.
 *
 * Natívny RBAC Medusy (`@medusajs/rbac`) je za flagom `MEDUSA_FF_RBAC` a v
 * `medusa-config.ts` (mimo hraníc tohto balíka) sa zapínať nesmie. Preto je
 * rola uložená priamo v metadátach administrátora (`metadata.anastasia_role`)
 * a kontroluje ju tento malý helper.
 *
 * Predvolená rola je `owner`, aby sa existujúce prihlásenia nič nemenilo;
 * asistenta musí vlastník vypnúť ručne.
 */

export type AdminRole = "owner" | "assistant"

export const ADMIN_ROLES: readonly AdminRole[] = ["owner", "assistant"]

export const ADMIN_ROLE_METADATA_KEY = "anastasia_role"

/** Čo daná rola smie. `owner` má všetko, `asistent` iba dennú prácu. */
export type AdminCapability =
  | "pricing"      // ceny, zľavy, vernostná politika
  | "access"       // ručné udelenie prístupu k digitálnemu obsahu
  | "roles"        // správa rolí a 2FA
  | "catalog"      // produkty, kategórie, ceny v katalóge (nie cenová politika)
  | "orders"
  | "customers"
  | "content"
  | "payments"     // vrátenie peňazí, označenie ako zaplatené, regióny, dane, nastavenie obchodu
  | "shipping"     // doprava, dopravcovia a ich API kľúče

const CAPABILITIES: Record<AdminRole, AdminCapability[]> = {
  owner: ["pricing", "access", "roles", "catalog", "orders", "customers", "content", "payments", "shipping"],
  assistant: ["catalog", "orders", "customers", "content"],
}

export function normalizeAdminRole(value: unknown): AdminRole | null {
  const role = typeof value === "string" ? value.trim().toLowerCase() : ""
  return (ADMIN_ROLES as readonly string[]).includes(role) ? (role as AdminRole) : null
}

/** Rola z metadát administrátora; neznáma alebo chýbajúca hodnota = `owner` (nič sa nemení). */
export function adminRoleOf(user: { metadata?: Record<string, unknown> | null } | null | undefined): AdminRole {
  return normalizeAdminRole(user?.metadata?.[ADMIN_ROLE_METADATA_KEY]) ?? "owner"
}

export function adminCan(role: AdminRole, capability: AdminCapability): boolean {
  return CAPABILITIES[role].includes(capability)
}

/** Načíta rolu administrátora z databázy (roli nepreveruje klient). */
export async function resolveAdminRole(scope: MedusaContainer, actorId: string): Promise<AdminRole> {
  try {
    const user = await (scope.resolve(Modules.USER) as any).retrieveUser(actorId)
    return adminRoleOf(user)
  } catch {
    // Bez role radšej nič nepovoľujeme – ale neprihláseného používateľa nikdy
    // nepreverujeme (predchádza to `adminActor`).
    return "assistant"
  }
}
