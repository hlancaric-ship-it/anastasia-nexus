import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { AbstractAuthModuleProvider } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { generateToken, isValidMagicLinkAttempt, MAGIC_LINK_TTL_SECONDS, normalizeEmail, sha256Hex, stateKey } from "./policy"

export const MAGIC_LINK_REQUESTED_EVENT = "auth-magic-link.requested"

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
 * Token se v `AuthIdentityProviderService.setState` ukládá jen jako hash (viz policy.ts).
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
      return this.requestLink(email, authIdentityProviderService)
    }
    return this.confirmLink(email, body.token, authIdentityProviderService)
  }

  /** Fáze 1: vygeneruje token, uloží jen jeho hash, požádá o odeslání e-mailu eventem. Vždy stejná odpověď. */
  private async requestLink(email: string, authIdentityProviderService: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    const token = generateToken()
    await authIdentityProviderService.setState(stateKey(email), { email, tokenHash: sha256Hex(token) }, MAGIC_LINK_TTL_SECONDS)
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

  /** Fáze 2: ověří token proti uloženému hashi (jednorázově, getState ho po přečtení smaže). */
  private async confirmLink(email: string, token: string, authIdentityProviderService: AuthIdentityProviderService): Promise<AuthenticationResponse> {
    const state = (await authIdentityProviderService.getState(stateKey(email))) as { email: string; tokenHash: string } | null
    if (!isValidMagicLinkAttempt(state, email, token)) {
      return { success: false, error: "INVALID_OR_EXPIRED_TOKEN" }
    }

    let authIdentity
    try {
      authIdentity = await authIdentityProviderService.retrieve({ entity_id: email })
    } catch (error) {
      if (!(error instanceof MedusaError) || error.type !== MedusaError.Types.NOT_FOUND) throw error
      authIdentity = await authIdentityProviderService.create({ entity_id: email })
    }

    authIdentity = await this.linkExistingCustomer(authIdentity, email)
    return { success: true, authIdentity }
  }

  /**
   * Zákaznice migrované v C2 mají účet (Customer), ale žádnou identitu pro přihlášení.
   * C2 záměrně nastavuje `has_account=false`; magic link po ověření e-mailu je okamžik,
   * kdy se existující Customer propojí s AuthIdentity a účet aktivuje.
   * Jediný SQL statement uzamkne kandidáty, odmítne nejednoznačný e-mail a atomicky
   * aktualizuje AuthIdentity i `customer.has_account`. Souběžné požadavky tak nemohou
   * přiřadit stejnou identitu k různým zákaznicím ani nechat napůl dokončený stav.
   */
  private async linkExistingCustomer(authIdentity: any, email: string) {
    if (authIdentity.entity_id !== email) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account link is invalid")
    }

    const existingCustomerId = authIdentity.app_metadata?.customer_id
    if (existingCustomerId) {
      const { rows } = await this.pg_.raw(
        `update customer
         set has_account = true, updated_at = now()
         where id = $1 and lower(email) = $2 and deleted_at is null
         returning id`,
        [existingCustomerId, email]
      )
      if (rows.length !== 1) {
        throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account link is invalid")
      }
      return authIdentity
    }

    // `has_account` se záměrně nefiltruje: C2 zákaznice mají false, dokud e-mail
    // úspěšně neověří. LIMIT 2 + HAVING count(*)=1 zabrání náhodnému převzetí
    // libovolného záznamu při duplicitních adresách.
    const { rows: linked } = await this.pg_.raw(
      `with candidate_customers as materialized (
         select id
         from customer
         where lower(email) = $2 and deleted_at is null
         order by id
         limit 2
         for update
       ), unique_customer as (
         select min(id) as id
         from candidate_customers
         having count(*) = 1
       ), linked_identity as (
         update auth_identity as ai
         set app_metadata = coalesce(ai.app_metadata, '{}'::jsonb) || jsonb_build_object('customer_id', uc.id::text),
             updated_at = now()
         from unique_customer as uc
         where ai.id = $1
           and ai.entity_id = $2
           and ai.deleted_at is null
           and nullif(ai.app_metadata->>'customer_id', '') is null
         returning ai.app_metadata, uc.id as customer_id
       ), activated_customer as (
         update customer as c
         set has_account = true, updated_at = now()
         from linked_identity as li
         where c.id = li.customer_id and c.deleted_at is null
         returning c.id
       )
       select li.app_metadata, li.customer_id
       from linked_identity as li
       join activated_customer as ac on ac.id = li.customer_id`,
      [authIdentity.id, email]
    )
    if (linked[0]) {
      return { ...authIdentity, app_metadata: linked[0].app_metadata }
    }

    // Jiné paralelní potvrzení mohlo právě provést vazbu. Načteme ji z DB a
    // ověříme, že stále patří identitě tohoto e-mailu i odpovídající zákaznici.
    const { rows: current } = await this.pg_.raw(
      `select ai.app_metadata, c.id as customer_id
       from auth_identity as ai
       left join customer as c
         on c.id = ai.app_metadata->>'customer_id'
        and lower(c.email) = $2
        and c.deleted_at is null
       where ai.id = $1 and ai.entity_id = $2 and ai.deleted_at is null`,
      [authIdentity.id, email]
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
