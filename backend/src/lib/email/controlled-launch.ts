import { createHash } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { recordEvent } from "../observability/events"

/**
 * Trvalé výnimky schválené vedením:
 * Tieto tri adresy musia dostávať príslušné systémové e-maily bez ohľadu na dátum registrácie.
 */
export const PERMANENT_ALLOWED_RECIPIENTS = [
  "zdravysvet.anastasiaoz@gmail.com",
  "lucia.rogozanova@gmail.com",
  "ceo@l-code-dynamics.com",
] as const

/** Predvolený hraničný čas aktivácie riadeného režimu (ISO reťazec). */
export const DEFAULT_CONTROLLED_LAUNCH_CUTOFF = "2026-11-09T00:00:00.000Z"

export const sha256Hex = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex")

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isPermanentAllowed(email: string): boolean {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return (PERMANENT_ALLOWED_RECIPIENTS as readonly string[]).includes(normalized)
}

export type ControlledLaunchConfig = {
  active: boolean
  cutoff: Date
  permanentRecipients: readonly string[]
}

export function getControlledLaunchConfig(env: Record<string, string | undefined> = process.env): ControlledLaunchConfig {
  const activeVal = (env.EMAIL_CONTROLLED_LAUNCH || env.EMAIL_CONTROLLED_LAUNCH_ACTIVE || "").trim().toLowerCase()
  const cutoffStr = (env.EMAIL_CONTROLLED_LAUNCH_CUTOFF || DEFAULT_CONTROLLED_LAUNCH_CUTOFF).trim()
  const cutoff = new Date(cutoffStr)
  const validCutoff = !Number.isNaN(cutoff.getTime()) ? cutoff : new Date(DEFAULT_CONTROLLED_LAUNCH_CUTOFF)

  // Režim je aktívny ak je explicitne zapnutý, alebo ak je nastavený cut-off a nie je explicitne vypnutý ("0" / "false")
  const active = activeVal === "1" || activeVal === "true" || (Boolean(env.EMAIL_CONTROLLED_LAUNCH_CUTOFF) && activeVal !== "0" && activeVal !== "false")

  return {
    active,
    cutoff: validCutoff,
    permanentRecipients: PERMANENT_ALLOWED_RECIPIENTS,
  }
}

export type RecipientEligibilityResult = {
  eligible: boolean
  reason:
    | "permanent_exception"
    | "controlled_launch_inactive"
    | "verified_new_customer"
    | "new_registration_pending"
    | "invalid_pending_registration"
    | "historical_pending_registration"
    | "historical_baseline_customer"
    | "historical_customer"
    | "legacy_imported_customer"
    | "guest_or_unclaimed_account"
    | "customer_has_historical_orders"
    | "historical_order"
    | "unknown_recipient_not_registered"
    | "unsubscribed"
    | "invalid_email"
    | "verification_error"
  details?: Record<string, unknown>
}

export type PolicyDatabaseAdapter = {
  isEmailInBaseline?: (email: string) => Promise<boolean>
  getCustomerByEmail?: (email: string) => Promise<Array<{
    id: string
    email: string
    has_account: boolean
    created_at: Date | string
    metadata?: Record<string, unknown> | null
  }>>
  getHistoricalOrdersCount?: (customerId: string, email: string, cutoff: Date) => Promise<number>
  getPendingRegistration?: (emailSha: string) => Promise<{ payload?: unknown; created_at?: Date | string | null; expires_at?: Date | string | null } | null>
  getOrderCreatedAt?: (orderId: string) => Promise<Date | null>
  isUnsubscribed?: (email: string) => Promise<boolean>
}

export type PolicyContext = {
  container?: Pick<MedusaContainer, "resolve">
  db?: PolicyDatabaseAdapter
  config?: ControlledLaunchConfig
  now?: Date
}

export type RecipientEvaluationInput = {
  to: string
  template?: string
  resource_id?: string
  resource_type?: string
  data?: Record<string, unknown>
}

/**
 * Vytvorí databázový adaptér nad Knex / PG_CONNECTION z Medusa containera.
 */
export function createPgDatabaseAdapter(pg: any): PolicyDatabaseAdapter {
  return {
    async isEmailInBaseline(email: string): Promise<boolean> {
      try {
        const rows = await pg("email_historical_baseline")
          .whereRaw("lower(email) = ?", [email.toLowerCase()])
          .limit(1)
        return rows.length > 0
      } catch (err: any) {
        // Ak tabuľka neexistuje (42P01 undefined_table), fallback na dynamické overenie customer + order
        if (err?.code === "42P01" || err?.message?.includes("does not exist")) {
          return false
        }
        throw err
      }
    },
    async getCustomerByEmail(email: string) {
      return pg("customer")
        .whereRaw("lower(email) = ?", [email.toLowerCase()])
        .whereNull("deleted_at")
        .select("id", "email", "has_account", "created_at", "metadata")
    },
    async getHistoricalOrdersCount(customerId: string, email: string, cutoff: Date): Promise<number> {
      const result = await pg("order")
        .where(function (this: any) {
          this.where("customer_id", customerId).orWhereRaw("lower(email) = ?", [email.toLowerCase()])
        })
        .andWhere("created_at", "<", cutoff)
        .whereNull("deleted_at")
        .count("id as count")
        .first()
      return Number((result as any)?.count ?? 0)
    },
    async getPendingRegistration(emailSha: string) {
      try {
        const res = await pg.raw(
          `SELECT payload, created_at, expires_at FROM auth_registration_state WHERE id = ? AND expires_at > now()`,
          [emailSha]
        )
        return res.rows?.[0] ?? null
      } catch (err: any) {
        if (err?.code === "42P01" || err?.message?.includes("does not exist")) {
          return null
        }
        throw err
      }
    },
    async getOrderCreatedAt(orderId: string): Promise<Date | null> {
      const row = await pg("order").where({ id: orderId }).select("created_at").first()
      return row?.created_at ? new Date(row.created_at) : null
    },
    async isUnsubscribed(email: string): Promise<boolean> {
      try {
        const row = await pg("newsletter_consent")
          .whereRaw("lower(email) = ?", [email.toLowerCase()])
          .whereNull("deleted_at")
          .orderBy("created_at", "desc")
          .first("status")
        return row?.status === "unsubscribed"
      } catch (err: any) {
        if (err?.code === "42P01" || err?.message?.includes("does not exist")) {
          return false
        }
        throw err
      }
    },
  }
}

/**
 * Centrálna kontrola oprávnenosti príjemcu e-mailu.
 *
 * Pravidlá:
 * 1. Trvalé výnimky (zdravysvet, lucia, ceo) -> VŽDY POVOLENÉ.
 * 2. Nový zákazník (účet vytvorený po aktivácii, has_account=true, žiadne historické objednávky, bez legacy metadát) -> POVOLENÉ.
 * 3. Prebiehajúca nová registrácia v auth_registration_state -> POVOLENÉ pre uvítacie / potvrdzovacie správy.
 * 4. Historickí zákazníci (existujúci pred aktiváciou, importovaní, s historickými objednávkami) -> BLOKOVANÉ.
 * 5. Neznáme e-maily zadané do formulárov bez registrácie -> BLOKOVANÉ.
 * 6. Chyba overenia / databázy -> BLOKOVANÉ (Fail-Closed).
 */
export async function evaluateRecipientEligibility(
  context: PolicyContext,
  input: RecipientEvaluationInput
): Promise<RecipientEligibilityResult> {
  const email = normalizeEmail(input.to)
  if (!email || !email.includes("@")) {
    return { eligible: false, reason: "invalid_email" }
  }

  // 1. Trvalé výnimky — povolené bez ohľadu na dátum registrácie
  if (isPermanentAllowed(email)) {
    return { eligible: true, reason: "permanent_exception" }
  }

  const config = context.config ?? getControlledLaunchConfig()
  if (!config.active) {
    return { eligible: true, reason: "controlled_launch_inactive" }
  }

  const cutoff = config.cutoff

  // Získanie DB adaptéra
  let db = context.db
  if (!db && context.container) {
    try {
      const pg = context.container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      if (pg) db = createPgDatabaseAdapter(pg)
    } catch {
      // bez spojenia
    }
  }

  if (!db) {
    // Fail-Closed: bez overovacieho mechanizmu nesmie e-mail odísť nikomu mimo trvalých výnimiek
    return { eligible: false, reason: "verification_error", details: { error: "DATABASE_UNAVAILABLE" } }
  }

  try {
    // 2. Kontrola historického baseline
    if (db.isEmailInBaseline && (await db.isEmailInBaseline(email))) {
      return { eligible: false, reason: "historical_baseline_customer" }
    }

    // 3. Kontrola historickej objednávky (ak je notifikácia viazaná na order)
    if (input.resource_type === "order" && input.resource_id && db.getOrderCreatedAt) {
      const orderCreatedAt = await db.getOrderCreatedAt(input.resource_id)
      if (orderCreatedAt && orderCreatedAt.getTime() < cutoff.getTime()) {
        return { eligible: false, reason: "historical_order", details: { order_created_at: orderCreatedAt.toISOString() } }
      }
    }

    // 4. Marketing / newsletter kontrola odhlásenia
    const isMarketing = input.template?.includes("newsletter") || input.template?.includes("campaign")
    if (isMarketing && db.isUnsubscribed && (await db.isUnsubscribed(email))) {
      return { eligible: false, reason: "unsubscribed" }
    }

    // 5. Vyhľadanie zákazníka v databáze
    const customers = db.getCustomerByEmail ? await db.getCustomerByEmail(email) : []

    if (customers.length > 0) {
      // Overenie každého zákazníckeho záznamu spojeného s týmto e-mailom
      for (const cust of customers) {
        const createdAt = new Date(cust.created_at)

        // Vytvorený pred cutoffom -> HISTORICKÝ
        if (Number.isNaN(createdAt.getTime()) || createdAt.getTime() < cutoff.getTime()) {
          return {
            eligible: false,
            reason: "historical_customer",
            details: { customer_id: cust.id, created_at: cust.created_at },
          }
        }

        // Importovaný z legacy systému -> HISTORICKÝ
        const meta = cust.metadata && typeof cust.metadata === "object" ? cust.metadata : null
        if (meta && (meta.legacy_customer_migration || meta.legacy_ids || meta.legacy_id)) {
          return {
            eligible: false,
            reason: "legacy_imported_customer",
            details: { customer_id: cust.id },
          }
        }

        // Nemá aktívny účet (has_account=false) -> nepovažovať za nového zákazníka
        if (!cust.has_account) {
          return {
            eligible: false,
            reason: "guest_or_unclaimed_account",
            details: { customer_id: cust.id },
          }
        }

        // Má historické objednávky z obdobia pred cutoffom?
        if (db.getHistoricalOrdersCount) {
          const histOrders = await db.getHistoricalOrdersCount(cust.id, email, cutoff)
          if (histOrders > 0) {
            return {
              eligible: false,
              reason: "customer_has_historical_orders",
              details: { customer_id: cust.id, historical_orders_count: histOrders },
            }
          }
        }
      }

      // Všetky kontroly prešli: skutočne nový zákazník založený po aktivácii
      return {
        eligible: true,
        reason: "verified_new_customer",
        details: { customer_id: customers[0].id },
      }
    }

    // 6. Zákazník v tabuľke customer neexistuje.
    // Môže ísť o práve prebiehajúcu registráciu (auth_registration_state)?
    if (db.getPendingRegistration) {
      const emailSha = sha256Hex(email)
      const pending = await db.getPendingRegistration(emailSha)
      if (pending && pending.payload) {
        const regCreated = pending.created_at ? new Date(pending.created_at) : null
        if (!regCreated || Number.isNaN(regCreated.getTime())) {
          return {
            eligible: false,
            reason: "invalid_pending_registration",
            details: { created_at: pending.created_at },
          }
        }
        if (regCreated.getTime() < cutoff.getTime()) {
          return {
            eligible: false,
            reason: "historical_pending_registration",
            details: { created_at: pending.created_at },
          }
        }
        return {
          eligible: true,
          reason: "new_registration_pending",
        }
      }
    }

    // 7. Neznámy príjemca, ktorý sa neregistruje (iba zadal e-mail do magic link formulára)
    // Zákaz automatického povolenia!
    return {
      eligible: false,
      reason: "unknown_recipient_not_registered",
    }
  } catch (error) {
    // Fail-Closed: pri akejkoľvek neočakávanej chybe blokovať
    if (context.container) {
      await recordEvent(context.container as MedusaContainer, "error", "notification", "recipient_policy_error", {
        to: email,
        template: input.template,
        error: (error as Error)?.message,
      }).catch(() => null)
    }
    return {
      eligible: false,
      reason: "verification_error",
      details: { error: (error as Error)?.message },
    }
  }
}
