import type { EntitlementAccessGuard } from "../types"
import { signMediaToken, DEFAULT_TTL_SECONDS } from "./token"

export type ProtectedMediaItem = { key: string; title?: string }

export type MediaAccessError = "ACCESS_DENIED" | "MEDIA_NOT_FOUND" | "MEDIA_NOT_CONFIGURED"

export class MediaAccessDenied extends Error {
  constructor(public code: MediaAccessError) {
    super(code)
  }
}

/** Registr chráněných médií produktu: product.metadata.protected_media = [{ key, title }]. */
export function readProtectedMedia(metadata: Record<string, unknown> | null | undefined): ProtectedMediaItem[] {
  const raw = metadata?.protected_media
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => (typeof item === "string" ? { key: item } : item))
    .filter((item): item is ProtectedMediaItem => Boolean(item) && typeof (item as any).key === "string" && (item as any).key.length > 0)
}

export type IssueDeps = {
  guard: EntitlementAccessGuard
  getProductMetadata: (productId: string) => Promise<Record<string, unknown> | null>
  getCustomerEmail: (customerId: string) => Promise<string | null>
  audit: (event: { customerId: string; productId: string; mediaKey: string; nonce: string; expiresAt: Date }) => void
  secret: string
  deliveryBaseUrl: string
}

/**
 * Vydá krátkodobý odkaz na chráněné médium. Pořadí kontrol je bezpečnostně důležité:
 * nárok -> média patří produktu -> teprve potom podpis. Chyby nerozlišují "neexistuje" a "nemáš nárok".
 */
export async function issueMediaAccess(
  deps: IssueDeps,
  input: { customerId: string; productId: string; mediaKey: string; ttlSeconds?: number },
  now: Date = new Date()
) {
  if (!deps.secret || !deps.deliveryBaseUrl) throw new MediaAccessDenied("MEDIA_NOT_CONFIGURED")
  const entitlement = await deps.guard.findActiveAccess(input.customerId, input.productId, now)
  if (!entitlement) throw new MediaAccessDenied("ACCESS_DENIED")
  const registry = readProtectedMedia(await deps.getProductMetadata(input.productId))
  if (!registry.some((m) => m.key === input.mediaKey)) throw new MediaAccessDenied("ACCESS_DENIED")

  const { token, expiresAt, nonce } = signMediaToken(
    deps.secret,
    { ...input, ttlSeconds: input.ttlSeconds ?? DEFAULT_TTL_SECONDS },
    now
  )
  deps.audit({ customerId: input.customerId, productId: input.productId, mediaKey: input.mediaKey, nonce, expiresAt })
  const base = deps.deliveryBaseUrl.replace(/\/+$/, "")
  return {
    url: `${base}/v1/${encodeURIComponent(input.mediaKey)}?t=${token}`,
    expires_at: expiresAt.toISOString(),
    /** Text pro viditelný vodoznak v přehrávači (např. e-mail zákazník). */
    watermark: await deps.getCustomerEmail(input.customerId),
  }
}
