import type { ChatConversationRow, ChatMessageRow } from "./service"
import { isUnreadByAdmin, isUnreadByCustomer } from "./policy"

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null)

/** Zpráva navenek: autor jen jako role (bez interních ID správce), tělo jako čistý text. */
export function toMessageDTO(m: ChatMessageRow) {
  return { id: m.id, author: m.author_type === "admin" ? "lucia" : "customer", body: m.body, created_at: iso(m.created_at) }
}

export function toCustomerConversationDTO(c: ChatConversationRow) {
  return {
    id: c.id,
    subject: c.subject,
    order_id: c.order_id,
    booking_id: c.booking_id,
    status: c.status,
    last_message_at: iso(c.last_message_at),
    unread: isUnreadByCustomer(c),
    created_at: iso(c.created_at),
  }
}

export function toAdminConversationDTO(c: ChatConversationRow, extra: { customer?: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null } | null; blocked?: boolean } = {}) {
  const customer = extra.customer
  const name = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() : ""
  return {
    id: c.id,
    subject: c.subject,
    order_id: c.order_id,
    booking_id: c.booking_id,
    status: c.status,
    muted: c.muted,
    closed_at: iso(c.closed_at),
    last_message_at: iso(c.last_message_at),
    last_customer_message_at: iso(c.last_customer_message_at),
    unread: isUnreadByAdmin(c),
    created_at: iso(c.created_at),
    customer: { id: c.customer_id, name: name || null, email: customer?.email ?? null, chat_blocked: Boolean(extra.blocked) },
  }
}
