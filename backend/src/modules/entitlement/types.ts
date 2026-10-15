export type EntitlementStatus = "active" | "revoked"
export type EntitlementSource = "order" | "admin" | "migration"

export type EntitlementDTO = {
  id: string
  customer_id: string
  product_id: string
  variant_id: string | null
  order_id: string | null
  status: EntitlementStatus
  source: EntitlementSource
  granted_at: Date | string
  expires_at: Date | string | null
  revoked_at: Date | string | null
  revoke_reason: string | null
  granted_by: string | null
  dedupe_key: string
  metadata: Record<string, unknown> | null
}

export type GrantEntitlementInput = {
  customer_id: string
  product_id: string
  variant_id?: string | null
  order_id?: string | null
  source: EntitlementSource
  /** Unikátní klíč idempotence. Pro objednávky se generuje z order_id + product_id. */
  dedupe_key: string
  expires_at?: Date | null
  granted_by?: string | null
  metadata?: Record<string, unknown> | null
}

export type GrantResult = { entitlement: EntitlementDTO; created: boolean }

/**
 * Rozhraní pro vlnu 2: doručení chráněného média (video/audio) podpisem URL.
 * Modul sám NIC nepodepisuje; implementace (např. Cloudflare R2/Stream signed URL ve Workeru)
 * se dodá později a MUSÍ nejdřív ověřit přístup přes EntitlementAccessGuard.
 */
export interface EntitlementAccessGuard {
  /** Vrací aktivní (nezrušený, neexpirovaný) přístup, jinak null. */
  findActiveAccess(customerId: string, productId: string, at?: Date): Promise<EntitlementDTO | null>
}

export type SignedMediaRequest = {
  customerId: string
  productId: string
  /** Identifikátor média v úložišti (klíč objektu, Stream UID apod.). */
  mediaKey: string
  /** Platnost podpisu v sekundách; implementace ji musí omezit shora (doporučeně <= 900). */
  ttlSeconds: number
}

export interface ProtectedMediaSigner {
  /** Vrátí časově omezenou podepsanou URL. Volat až po úspěšném findActiveAccess. */
  sign(request: SignedMediaRequest, entitlement: EntitlementDTO): Promise<{ url: string; expiresAt: Date }>
}
