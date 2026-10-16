/** Fixed-day membership policy. Server-only: no payment, network, access grant or persistence.
 * Receipt facts MUST be loaded by a future adapter from native Medusa records, never request JSON.
 * This policy is not recurring billing by itself. Monetary facts use integer EUR cents. */
export type Terms = {
  customer_id: string; product_id: string; variant_id: string; version: string;
  period_days: number; amount_minor: number; currency: 'eur';
}
export type Receipt = {
  order_id: string; customer_id: string; product_id: string; variant_id: string;
  currency: string; amount_minor: number; captured_minor: number; refunded_minor: number;
  paid_at: string; canceled: boolean; exclusive_member_order: boolean; checkout_key: string;
}
export type Membership = {
  id: string; terms: Terms; renew: boolean;
  status: 'active' | 'renewing' | 'unknown' | 'needs_review';
  period_end: string; last_order_id: string; last_checkout_key: string;
  renewal_key: string | null;
}
export class MembershipError extends Error {}
function reject(code: string): never { throw new MembershipError(code) }
function date(value: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) reject('INVALID_DATE')
  const n = Date.parse(value), canonical = value.length === 20 ? value.replace('Z','.000Z') : value
  if (!Number.isFinite(n) || new Date(n).toISOString() !== canonical) reject('INVALID_DATE')
  return n
}
const validId = (value: string) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)
function validateState(state: Membership) {
  validateTerms(state.terms); date(state.period_end)
  if (!validId(state.id) || !validId(state.last_order_id) || typeof state.renew !== 'boolean' || !['active','renewing','unknown','needs_review'].includes(state.status)) reject('INVALID_MEMBERSHIP')
  if (['renewing','unknown'].includes(state.status)) {
    if (state.renewal_key !== `membership:${state.id}:${new Date(date(state.period_end)).toISOString()}`) reject('INVALID_RENEWAL_KEY')
  } else if (state.renewal_key !== null) reject('INVALID_RENEWAL_KEY')
}
function minor(n: number) { return Number.isSafeInteger(n) && n > 0 && n <= 99999999999 }
function validateTerms(t: Terms) {
  if (![t.customer_id,t.product_id,t.variant_id,t.version].every(validId) ||
      t.currency !== 'eur' || !minor(t.amount_minor) || !Number.isSafeInteger(t.period_days) || t.period_days < 1 || t.period_days > 3650) reject('INVALID_TERMS')
}
function verifyReceipt(t: Terms, r: Receipt, now: string) {
  validateTerms(t)
  if (r.customer_id !== t.customer_id || r.product_id !== t.product_id || r.variant_id !== t.variant_id) reject('RECEIPT_OWNER_MISMATCH')
  if (r.currency !== t.currency || r.amount_minor !== t.amount_minor || !minor(r.captured_minor) || r.captured_minor !== r.amount_minor || r.refunded_minor !== 0 || r.canceled !== false || r.exclusive_member_order !== true) reject('PAYMENT_NOT_VERIFIED')
  if (!validId(r.order_id) || typeof r.checkout_key !== 'string' || !r.checkout_key || r.checkout_key.length > 256 || /[\x00-\x20\x7f]/.test(r.checkout_key)) reject('INVALID_RECEIPT')
  if (date(r.paid_at) > date(now)) reject('PAYMENT_IN_FUTURE')
}
function end(start: number, days: number) { return new Date(start + days * 86400000).toISOString() }
export function activateMembership(id: string, terms: Terms, receipt: Receipt, consent: { version: string; auto_renew: boolean }, now: string): Membership {
  verifyReceipt(terms,receipt,now)
  if (!validId(id) || consent.version !== terms.version || typeof consent.auto_renew !== 'boolean') reject('CONSENT_REQUIRED')
  return { id,terms:{...terms},renew:consent.auto_renew,status:'active',period_end:end(date(receipt.paid_at),terms.period_days),last_order_id:receipt.order_id,last_checkout_key:receipt.checkout_key,renewal_key:null }
}
export type RenewalDecision = { state: Membership; action: 'NONE' | 'ENQUEUE_NATIVE_CHECKOUT' | 'RECONCILE_NATIVE_CHECKOUT' | 'REVIEW'; key?: string }
/** Caller must atomically persist decision/key under the membership lock before enqueueing. */
export function planRenewal(state: Membership, now: string, current: { version: string; amount_minor: number; currency: string }): RenewalDecision {
  validateState(state)
  if (state.status === 'renewing' || state.status === 'unknown') {
    if (!state.renewal_key) reject('MISSING_RENEWAL_KEY')
    return {state,action:'RECONCILE_NATIVE_CHECKOUT',key:state.renewal_key}
  }
  if (state.status === 'needs_review') return {state,action:'REVIEW'}
  if (!state.renew || date(now) < date(state.period_end)) return {state,action:'NONE'}
  if (current.version !== state.terms.version || current.currency !== state.terms.currency || current.amount_minor !== state.terms.amount_minor) return {state:{...state,status:'needs_review'},action:'REVIEW'}
  const key = `membership:${state.id}:${new Date(date(state.period_end)).toISOString()}`
  return {state:{...state,status:'renewing',renewal_key:key},action:'ENQUEUE_NATIVE_CHECKOUT',key}
}
export function markRenewalUnknown(state: Membership): Membership {
  validateState(state)
  if (state.status !== 'renewing' || !state.renewal_key) reject('NO_PENDING_RENEWAL')
  return {...state,status:'unknown'}
}
export function applyRenewalReceipt(state: Membership, receipt: Receipt, now: string): Membership {
  validateState(state)
  verifyReceipt(state.terms,receipt,now)
  // Duplicates must not add another period, including a delayed prior receipt during a new renewal.
  if (receipt.order_id === state.last_order_id && receipt.checkout_key === state.last_checkout_key) return state
  if (!['renewing','unknown'].includes(state.status) || !state.renewal_key || receipt.checkout_key !== state.renewal_key) reject('RENEWAL_BINDING_MISMATCH')
  if (receipt.order_id === state.last_order_id) reject('ORDER_ALREADY_USED')
  if (date(receipt.paid_at) < date(state.period_end)) reject('PAYMENT_BEFORE_RENEWAL_DUE')
  return {...state,status:'active',period_end:end(Math.max(date(state.period_end),date(receipt.paid_at)),state.terms.period_days),last_order_id:receipt.order_id,last_checkout_key:receipt.checkout_key,renewal_key:null}
}
/** Stops future renewals; does not pretend to cancel a native payment already in progress. */
export function stopRenewal(state: Membership): Membership { validateState(state); return {...state,renew:false} }
