import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { AbstractAuthModuleProvider } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { generateToken, MAGIC_LINK_TTL_SECONDS, normalizeEmail, parseRegistration, sha256Hex } from "./policy"
import { randomUUID } from "node:crypto"

import { storeLink, consumeLink } from "./state"

export const MAGIC_LINK_REQUESTED_EVENT = "auth-magic-link.requested"
export const AUTH_REGISTRATION_CONFIRMED_EVENT = "auth-magic-link.registration-confirmed"

type PgLike = { raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }> }
type EventBusLike = { emit: (data: { name: string; data: Record<string, unknown> }) => Promise<void> }

type InjectedDependencies = {
  logger: Logger
  [ContainerRegistrationKeys.PG_CONNECTION]: PgLike
  [Modules.EVENT_BUS]: EventBusLike
}
type Options = { linkBaseUrl?: string }

/**
 * Passwordless přihlášení e-mailem (A-01): fáze 1 vyžádá odkaz, fáze 2 ho ověří.
 * Server nikdy neprozradí, jestli e-mail existuje (stejná odpověď v obou případech).
 * Token se ukládá jen jako hash do PostgreSQL (viz state.ts).
 *
 * Auth providery mají vlastní, izolovaný DI kontejner: dostanou jen logger a to, co
 * Medusa výslovně prosazuje do každého modulu (PG_CONNECTION, EVENT_BUS aj.), NIKDY
 * přímo služby jiných modulů (ověřeno chybou za běhu: "Could not resolve 'container'").
 * Proto se zákaznický e-mail hledá přímým SQL přes PG_CONNECTION a odeslání odkazu
 * se deleguje eventem na subscriber (`src/subscribers/auth-magic-link-requested.ts`),
 * který plný přístup k NOTIFICATION modulu má.
 */
class MagicLinkAuthService extends AbstractAuthModuleProvider {
  static identifier = "magic-link"
  static DISPLAY_NAME = "Prihlásenie odkazom e-mailom"

  protected logger_: Logger
  protected pg_: PgLike
  protected eventBus_: EventBusLike
  protected options_: Options

  constructor(cradle: InjectedDependencies, options: Options = {}) {
    // @ts-ignore
    super(...arguments)
    this.logger_ = cradle.logger
    this.pg_ = cradle[ContainerRegistrationKeys.PG_CONNECTION]
    this.eventBus_ = cradle[Modules.EVENT_BUS]
    this.options_ = options
  }

  async authenticate(data: AuthenticationInput, authIdentityProviderService: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    const body = (data.body ?? {}) as Record<string, string>
    const email = normalizeEmail(body.email)
    if (!email) return { success: false, error: "INVALID_EMAIL" }

    if (!body.token) {
      if (body.mode === "registration") {
        const registration = parseRegistration(body, email)
        if (!registration) return { success: false, error: "INVALID_REGISTRATION" }
        await this.pg_.raw(`insert into auth_registration_state (id,payload,expires_at) values (?,?::jsonb,now()+interval '30 minutes') on conflict (id) do update set payload=excluded.payload,expires_at=excluded.expires_at,updated_at=now()`, [sha256Hex(email), JSON.stringify(registration)])
      } else {
        await this.pg_.raw(`delete from auth_registration_state where id=?`, [sha256Hex(email)])
      }
      return this.requestLink(email, authIdentityProviderService)
    }
    return this.confirmLink(email, body.token, authIdentityProviderService)
  }

  /** Fáze 1: vygeneruje token, uloží jen jeho hash, požádá o odeslání e-mailu eventem. Vždy stejná odpověď. */
  private async requestLink(email: string, authIdentityProviderService: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    const token = generateToken()
    await storeLink(this.pg_, email, token)
    const base = this.options_.linkBaseUrl || "http://localhost:8000/prihlasenie/potvrdit"
    const url = `${base.replace(/\/+$/, "")}?email=${encodeURIComponent(email)}&token=${token}`
    try {
      await this.eventBus_.emit({ name: MAGIC_LINK_REQUESTED_EVENT, data: { email, url, ttl_minutes: MAGIC_LINK_TTL_SECONDS / 60 } })
    } catch (error) {
      // Nikdy nesmí prozradit úspěch/neúspěch volajícímu (enumerace účtů).
      this.logger_.error("[auth-magic-link] vyžádání odeslání odkazu selhalo", error as Error)
    }
    return { success: false, error: "LINK_SENT" }
  }

  /** Fáze 2: atomicky spotřebuje pouze odpovídající platný token; chybný pokus nic nemaže. */
  private async confirmLink(email: string, token: string, authIdentityProviderService: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    if (!await consumeLink(this.pg_, email, token)) {
      return { success: false, error: "INVALID_OR_EXPIRED_TOKEN" }
    }

    const registration = await this.pg_.raw(`select payload from auth_registration_state where id=? and expires_at>now()`, [sha256Hex(email)])
    if (registration.rows[0]?.payload) {
      const existing = await this.pg_.raw(`select id from customer where lower(email)=lower(?) and deleted_at is null`, [email])
      if (existing.rows.length === 0) {
        const data = registration.rows[0].payload
        const consent = { terms: { accepted: true, version: data.terms_version, accepted_at: data.accepted_at }, privacy: { acknowledged: true, version: data.privacy_version, acknowledged_at: data.accepted_at }, newsletter: { accepted: data.newsletter_accepted, version: data.newsletter_version, accepted_at: data.newsletter_accepted ? data.accepted_at : null } }
        await this.pg_.raw(`insert into customer (id,email,first_name,last_name,has_account,metadata,created_at,updated_at) values (?,?,?,?,false,?::jsonb,now(),now()) on conflict do nothing`, [`cus_${randomUUID().replace(/-/g, "")}`, email, data.first_name, data.last_name, JSON.stringify({ registration_consents: consent })])
        if (data.newsletter_accepted && data.newsletter_version) {
          try { await this.eventBus_.emit({ name: AUTH_REGISTRATION_CONFIRMED_EVENT, data: { email, newsletter_version: data.newsletter_version } }) }
          catch (error) { this.logger_.error("[auth-magic-link] newsletter consent event failed", error as Error) }
        }
      }
    }

    let authIdentity
    try {
      authIdentity = await authIdentityProviderService.retrieve({ entity_id: email })
    } catch (error) {
      if (!(error instanceof MedusaError) || error.type !== MedusaError.Types.NOT_FOUND) throw error
      authIdentity = await authIdentityProviderService.create({ entity_id: email })
    }

    authIdentity = await this.linkExistingCustomer(authIdentity, email)
    if (registration.rows[0]?.payload) await this.pg_.raw(`delete from auth_registration_state where id=?`, [sha256Hex(email)])
    return { success: true, authIdentity }
  }

  /**
   * Zákazníci migrovaní v C2 mají účet (Customer), ale žádnou identitu pro přihlášení.
   * C2 záměrně nastavuje `has_account=false`; magic-link po ověření e-mailu je okamžik,
   * kdy se existující Customer propojí s AuthIdentity a účet aktivuje.
   *
   * Jeden SQL příkaz uzamkne kandidáty (`FOR UPDATE`), odmítne nejednoznačný e-mail
   * (`HAVING count(*) = 1` — víc zákazníků se stejným e-mailem se nepropojí nazdařbůh)
   * a atomicky aktualizuje AuthIdentity i `customer.has_account`. Souběžné požadavky
   * tak nemohou přiřadit stejnou identitu k různým zákazníkům ani nechat napůl
   * dokončený stav. Logika převzata z nezávislé implementace Codexu (`codex/auth-magic-link`,
   * 10. 10. 2026), jen s opravenými placeholdery (viz POZOR níže).
   *
   * POZOR: toto je knex `.raw()`, placeholdery jsou `?` (pozičně), NE pg-driver styl
   * `$1`/`$2` (ten bez knexího parsování skončí chybou "Expected N bindings, saw 0" —
   * ověřeno za běhu na reálném serveru i přímo v node s knexem).
   */
  private async linkExistingCustomer(authIdentity: any, email: string) {
    // `authIdentity.entity_id` neexistuje na AuthIdentityDTO (jen na vnořeném
    // ProviderIdentityDTO) -- ověřeno za běhu: kontrola `authIdentity.entity_id !== email`
    // byla vždy `undefined !== email`, tedy vždy true, a odmítla úplně každé přihlášení.
    // Email je už zaručený tím, že authIdentityProviderService.retrieve/create byl
    // volán přesně s `entity_id: email` (viz confirmLink výše), netřeba znovu ověřovat.
    const existingCustomerId = authIdentity.app_metadata?.customer_id
    if (existingCustomerId) {
      const { rows } = await this.pg_.raw(
        `update customer set has_account = true, updated_at = now()
         where id = ? and lower(email) = ? and deleted_at is null
         returning id`,
        [existingCustomerId, email]
      )
      if (rows.length !== 1) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account link is invalid")
      return authIdentity
    }

    const { rows: linked } = await this.pg_.raw(
      `with candidate_customers as materialized (
         select id from customer where lower(email) = ? and deleted_at is null order by id limit 2 for update
       ), unique_customer as (
         select min(id) as id from candidate_customers having count(*) = 1
       ), linked_identity as (
         update auth_identity as ai
         set app_metadata = coalesce(ai.app_metadata, '{}'::jsonb) || jsonb_build_object('customer_id', uc.id::text),
             updated_at = now()
         from unique_customer as uc
         where ai.id = ? and ai.deleted_at is null
           and nullif(ai.app_metadata->>'customer_id', '') is null
         returning ai.app_metadata, uc.id as customer_id
       ), activated_customer as (
         update customer as c set has_account = true, updated_at = now()
         from linked_identity as li
         where c.id = li.customer_id and c.deleted_at is null
         returning c.id
       )
       select li.app_metadata, li.customer_id
       from linked_identity as li join activated_customer as ac on ac.id = li.customer_id`,
      [email, authIdentity.id]
    )
    if (linked[0]) return { ...authIdentity, app_metadata: linked[0].app_metadata }

    // Jiné paralelní potvrzení mohlo právě provést vazbu. Načteme ji z DB a
    // ověříme, že stále patří odpovídajícímu zákazníkovi podle e-mailu (`auth_identity`
    // nemá sloupec entity_id -- ten je jen v `provider_identity` -- identitu tedy
    // jednoznačně určuje `ai.id`, přiřazený touto AuthIdentityProviderService).
    const { rows: current } = await this.pg_.raw(
      `select ai.app_metadata, c.id as customer_id
       from auth_identity as ai
       left join customer as c on c.id = ai.app_metadata->>'customer_id' and lower(c.email) = ? and c.deleted_at is null
       where ai.id = ? and ai.deleted_at is null`,
      [email, authIdentity.id]
    )
    const currentIdentity = current[0]
    const currentCustomerId = currentIdentity?.app_metadata?.customer_id
    if (currentCustomerId && currentIdentity.customer_id !== currentCustomerId) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account link is invalid")
    }
    return currentIdentity ? { ...authIdentity, app_metadata: currentIdentity.app_metadata } : authIdentity
  }
}

export default MagicLinkAuthService
