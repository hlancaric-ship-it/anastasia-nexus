import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Načíta produktový záznam, na ktorý sa chránený obsah viaže.
 * Načítajú sa LEN bezpečná pole (id, handle, metadata) – žiadne ceny ani práva.
 */
export async function readLibraryProduct(
  req: AuthenticatedMedusaRequest,
  fields: string[] = ["id", "handle", "metadata"],
): Promise<{ id: string; handle?: string | null; metadata?: Record<string, unknown> | null } | null> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields, filters: { id: req.params.id } })
  return (data?.[0] as { id: string; handle?: string | null; metadata?: Record<string, unknown> | null }) ?? null
}

/** Položky registra chráneného obsahu v metadátach produktu (bez sanitácie). */
export function registeredMedia(metadata: Record<string, unknown> | null | undefined): unknown[] {
  const registered = metadata?.protected_media
  return Array.isArray(registered) ? registered : []
}

/** Klíč jednej položky registra (starší formát ukladal reťazec). */
export function registeredKey(item: unknown): string | null {
  if (typeof item === "string") return item
  if (item && typeof item === "object" && typeof (item as { key?: unknown }).key === "string") {
    return (item as { key: string }).key
  }
  return null
}
