import { createHash } from "node:crypto"
export class LegalError extends Error {
  constructor(public code: string, public status = 422) { super(code); this.name = "LegalError" }
  get statusCode() { return this.status }
}
export function versions(env: NodeJS.ProcessEnv = process.env) {
  const terms = env.LEGAL_TERMS_VERSION?.trim(), privacy = env.LEGAL_PRIVACY_VERSION?.trim()
  if (!terms || !privacy || terms.length > 100 || privacy.length > 100) throw new LegalError("LEGAL_NOT_CONFIGURED", 503)
  return { terms, privacy }
}
export function validateAcceptance(body: any, config = versions()) {
  if (body?.terms_accepted !== true || body?.privacy_acknowledged !== true || body?.terms_version !== config.terms || body?.privacy_version !== config.privacy) throw new LegalError("TERMS_NOT_ACCEPTED")
  return config
}
export function isCurrentConsent(row: any, customerId: string | null, config = versions()) {
  if (!row || row.terms_version !== config.terms || row.privacy_version !== config.privacy || row.customer_id !== customerId || !Number.isFinite(new Date(row.accepted_at).getTime())) throw new LegalError("TERMS_NOT_ACCEPTED")
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
export function withdrawalItems(input: unknown, order: any) {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new LegalError("INVALID_WITHDRAWAL_ITEMS")
  const seen = new Set<string>()
  return input.map((line: any) => {
    const original = order.items?.find((item: any) => item.id === line?.item_id)
    if (!original || seen.has(line.item_id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > Number(original.quantity)) throw new LegalError("INVALID_WITHDRAWAL_ITEMS")
    seen.add(line.item_id)
    return { item_id: line.item_id as string, quantity: line.quantity as number }
  }).sort((a,b) => a.item_id.localeCompare(b.item_id))
}
export function assertWithdrawalWindow(order: any, now = new Date()) {
  if (order.status === "canceled") throw new LegalError("WITHDRAWAL_NOT_AVAILABLE")
  const delivered = (order.fulfillments ?? []).map((f: any) => f.delivered_at).filter(Boolean)
  const paid = (order.payment_collections ?? []).flatMap((p: any) => p.payments ?? []).map((p: any) => p.captured_at).filter(Boolean)
  const dates = (delivered.length ? delivered : paid).map((v: any) => new Date(v).getTime()).filter(Number.isFinite)
  if (!dates.length) throw new LegalError("WITHDRAWAL_DATE_UNAVAILABLE")
  const start = Math.max(...dates)
  if (start > now.getTime() || now.getTime() > start + 14 * 86400000) throw new LegalError("WITHDRAWAL_EXPIRED")
}
export function assertTransition(from: string, to: unknown) {
  if (!(from === "received" && (to === "accepted" || to === "rejected") || from === "accepted" && to === "refunded" || from === to)) throw new LegalError("WITHDRAWAL_STATE_CONFLICT",409)
}
export function csvCell(value: unknown) {
  let text = String(value ?? "")
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}
