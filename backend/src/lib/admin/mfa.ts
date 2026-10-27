import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * Dvojfaktorové overenie administrátora (TOTP) na natívnych MFA provideroch Medusy.
 *
 * Medusa 2.19 má TOTP provider aj záložné kódy zabudnutia zabudnutia
 * (`auth_mfa_factor`, `auth_mfa_recovery_code`) – bez novej platenej služby.
 * Provider však vyžaduje `mfa.encryption_key` v konfigurácii auth modulu
 * (`medusa-config.ts`); kým ho integrátor nedoplní,Enrollment odmietne
 * s jasnou hláškou (fail-closed, nie tichý obchod bez 2FA).
 */

export const MFA_PROVIDER_TOTP = "totp"
export const MFA_ISSUER = "ANASTASIA"

export type MfaState = {
  /** Je dvojfaktorové overenie zapnuté? */
  enrolled: boolean
  provider: string | null
  factor_id: string | null
  /** Koľko záložných kódov zostáva. */
  recovery_codes_remaining: number
}

export type MfaIdentity = {
  auth_identity_id: string
  user_id?: string | null
  email?: string | null
}

const authService = (scope: MedusaContainer) => scope.resolve(Modules.AUTH) as any

/** Stav 2FA danej identity (bez tajomstiev – tie sa vracajú iba pri enrolmente). */
export async function readMfaState(scope: MedusaContainer, identity: MfaIdentity): Promise<MfaState> {
  const service = authService(scope)
  const factors = (await service.listAuthMfa({ auth_identity_id: identity.auth_identity_id })) ?? []
  const enabled = factors.find((factor: any) => factor.status === "enabled")
  const pending = factors.find((factor: any) => factor.status === "pending")
  const factor = enabled ?? pending
  let recoveryCodes = 0
  try {
    const codes = (await service.listAuthMfaRecoveryCodes({ auth_identity_id: identity.auth_identity_id })) ?? []
    recoveryCodes = codes.length
  } catch {
    recoveryCodes = 0
  }
  return {
    enrolled: Boolean(enabled),
    provider: factor?.provider ?? null,
    factor_id: factor?.id ?? null,
    recovery_codes_remaining: recoveryCodes,
  }
}

/** Začne enroláciu TOTP: vráti tajomstvo a otpauth URI (QR kód si vyrobí admin). */
export async function startTotpEnrollment(
  scope: MedusaContainer,
  identity: MfaIdentity,
  options: { label?: string | null; issuer?: string } = {},
) {
  const service = authService(scope)
  return service.startAuthMfa({
    auth_identity_id: identity.auth_identity_id,
    provider: MFA_PROVIDER_TOTP,
    label: options.label ?? identity.email ?? null,
    issuer: options.issuer ?? MFA_ISSUER,
  })
}

/** Overí prvý kód a zapne faktor; vráti nové záložné kódy (zobrazí sa raz). */
export async function verifyTotpFactor(
  scope: MedusaContainer,
  identity: MfaIdentity,
  input: { factor_id: string; code: string; recovery_code_count?: number },
) {
  const service = authService(scope)
  const factor = await service.verifyAuthMfa({
    id: input.factor_id,
    auth_identity_id: identity.auth_identity_id,
    code: input.code,
  })
  const { codes } = await service.generateAuthMfaRecoveryCodes({
    auth_identity_id: identity.auth_identity_id,
    count: input.recovery_code_count ?? 10,
  })
  return { factor, recovery_codes: codes as string[] }
}

/** Vypne faktor – vyžaduje platný kód (dôkaz, že kto vypína, je prihlásený). */
export async function disableTotpFactor(
  scope: MedusaContainer,
  identity: MfaIdentity,
  input: { factor_id: string; code: string },
) {
  const service = authService(scope)
  // Faktor musí patriť prihlásenej identite a kód sa overí vždy – nezávisle od politiky
  // vypínania v konfigurácii Medusy (pri inej než `challenge` by Medusa kód neoverila).
  const [factor] = (await service.listAuthMfa({ id: input.factor_id, auth_identity_id: identity.auth_identity_id })) ?? []
  if (!factor) throw new Error("MFA_FACTOR_NOT_FOUND")
  if (!(await confirmTotpCode(scope, identity, input.code))) throw new Error("MFA_CODE_INVALID")
  return service.disableAuthMfa({ id: input.factor_id, method: MFA_PROVIDER_TOTP, code: input.code })
}

/** Nové záložné kódy (staré sa zneplatnia). */
export async function regenerateRecoveryCodes(
  scope: MedusaContainer,
  identity: MfaIdentity,
  count = 10,
): Promise<string[]> {
  const service = authService(scope)
  const { codes } = await service.generateAuthMfaRecoveryCodes({
    auth_identity_id: identity.auth_identity_id,
    count,
  })
  return codes as string[]
}

/**
 * Opätovné overenie kódom z aplikácie pred citlivou zmenou (nové záložné kódy).
 * Ukradnutý token relácie bez telefónu tak nové záložné kódy nevyrobí. Bez zapnutého 2FA vráti false.
 */
export async function confirmTotpCode(scope: MedusaContainer, identity: MfaIdentity, code: string): Promise<boolean> {
  if (!identity.auth_identity_id || !/^\d{6,8}$/.test(code)) return false
  const service = authService(scope)
  const factors = (await service.listAuthMfa({ auth_identity_id: identity.auth_identity_id })) ?? []
  if (!factors.some((factor: any) => factor.status === "enabled")) return false
  try {
    const challenge = await service.createAuthMfaChallenge({ auth_identity_id: identity.auth_identity_id })
    const verified = await service.verifyAuthMfaChallenge({ id: challenge.id, method: MFA_PROVIDER_TOTP, code })
    return Boolean(verified?.completed_at)
  } catch {
    return false
  }
}
