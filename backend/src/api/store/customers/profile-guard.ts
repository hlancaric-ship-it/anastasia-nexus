import type { MedusaNextFunction, MedusaRequest, MedusaResponse, MiddlewareRoute } from "@medusajs/framework/http"
import { COMPANY_ID_KEYS, COMPANY_NAME_MAX, validCompanyId, type CompanyIdKey } from "../../../lib/invoice/company-ids"

/**
 * Natívne `POST /store/customers/me` zapíše do `customer.metadata` čokoľvek z tela požiadavky.
 * Zákazník by si tak sám nastavil napr. `metadata.ambassador` (kód a províziu) alebo príznak migrácie.
 * Profil preto smie meniť len vlastné textové údaje zo zoznamu nižšie; ostatné kľúče sa zahodia
 * (Medusa metadáta zlučuje, takže údaje nastavené správcom ostanú nedotknuté).
 */
export const PROFILE_METADATA_KEYS = [
  "birth_date", "birth_time", "birth_place",
  "street", "city", "postal_code",
  "company_street", "company_city", "company_postal_code",
  ...COMPANY_ID_KEYS,
] as const
const TEXT_MAX = 200

export function sanitizeProfileBody(body: Record<string, unknown>): { ok: true } | { ok: false; field: string } {
  if (typeof body.company_name === "string") body.company_name = body.company_name.trim().slice(0, COMPANY_NAME_MAX)
  else delete body.company_name
  const raw = body.metadata
  if (raw === undefined) return { ok: true }
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const clean: Record<string, string> = {}
  for (const key of PROFILE_METADATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const value = source[key]
    if (value === null || value === "") { clean[key] = ""; continue }
    if (typeof value !== "string") return { ok: false, field: key }
    if ((COMPANY_ID_KEYS as readonly string[]).includes(key)) {
      const id = validCompanyId(key as CompanyIdKey, value)
      if (!id) return { ok: false, field: key }
      clean[key] = id
    } else clean[key] = value.trim().slice(0, TEXT_MAX)
  }
  body.metadata = clean
  return { ok: true }
}

export function guardCustomerProfile(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const result = sanitizeProfileBody(body)
  if (!result.ok) {
    const company = (COMPANY_ID_KEYS as readonly string[]).includes(result.field)
    return res.status(400).json({ error: "INVALID_PROFILE", code: company ? "INVALID_COMPANY_ID" : "INVALID_FIELD", field: result.field })
  }
  return next()
}

export const customerProfileMiddlewares: MiddlewareRoute[] = [
  { matcher: "/store/customers/me", method: ["POST"], middlewares: [guardCustomerProfile], bodyParser: { sizeLimit: "8kb" } },
]
