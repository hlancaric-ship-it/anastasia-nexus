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
   * Atomické SQL (UPDATE ... WHERE customer_id IS NULL) zaručuje, že propojení proběhne
   * nejvýš jednou i při souběžných požadavcích; vrácené app_metadata je vždy aktuální z DB.
   */
  private async linkExistingCustomer(authIdentity: any, email: string) {
    if (authIdentity.app_metadata?.customer_id) return authIdentity
    try {
      // has_account se NEFILTRUJE: migrované zákaznice (C2) mají has_account=false (hesla se nepřenáší,
      // viz migrate-legacy-customers-orders.ts) a magic-link je právě cesta, jak jim poprvé účet aktivovat.
      // POZOR: toto je knex `.raw()`, placeholdery jsou `?` (pozičně), NE pg-driver styl `$1`/`$2`
      // (ten bez knexího parsování skončí chybou "Expected N bindings, saw 0" — ověřeno za běhu).
      const { rows: customers } = await this.pg_.raw(
        `select id from customer where lower(email) = ? and deleted_at is null limit 1`,
        [email]
      )
      const customerId = customers[0]?.id
      if (!customerId) return authIdentity

      const { rows: linked } = await this.pg_.raw(
        `update auth_identity set app_metadata = coalesce(app_metadata, '{}'::jsonb) || jsonb_build_object('customer_id', ?::text)
         where id = ? and (app_metadata->>'customer_id') is null and deleted_at is null
         returning app_metadata`,
        [customerId, authIdentity.id]
      )
      if (linked[0]) {
        await this.pg_.raw(`update customer set has_account = true where id = ? and has_account = false`, [customerId])
        return { ...authIdentity, app_metadata: linked[0].app_metadata }
      }

      const { rows: current } = await this.pg_.raw(`select app_metadata from auth_identity where id = ?`, [authIdentity.id])
      return current[0] ? { ...authIdentity, app_metadata: current[0].app_metadata } : authIdentity
    } catch (error) {
      this.logger_.error("[auth-magic-link] propojení se zákaznickým účtem selhalo", error as Error)
      return authIdentity
    }
  }
}

export default MagicLinkAuthService
