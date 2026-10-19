/**
 * Kde backend běží a jaká pravidla platí. Čistá funkce bez závislostí, používá ji medusa-config.ts
 * i skripty (bootstrap), proto žádné importy z frameworku.
 *
 * Medusa Cloud si NODE_ENV nastavuje sám (rezervovaná proměnná) a nastavuje ji stejně pro produkci,
 * long-lived i preview prostředí. Na Cloudu proto rozhoduje MEDUSA_CLOUD_ENVIRONMENT_TYPE:
 *   production       → ostrý provoz (live Stripe povinný),
 *   long-lived       → staging (live Stripe zakázaný),
 *   preview-instance → náhled PR (live Stripe zakázaný).
 * Mimo Cloud platí jako dřív NODE_ENV=production.
 */
export type DeployEnv = {
  /** Běží na Medusa Cloud: EXECUTION_CONTEXT=medusa-cloud (podle toho i defineConfig skládá Cloud moduly) nebo MEDUSA_CLOUD_ENVIRONMENT_*. */
  onCloud: boolean
  cloudType: string | null
  /** Ostrý provoz: vyžaduje live Stripe a webhook secret, jinde je live klíč zakázaný. */
  isLive: boolean
  /** Nasazené prostředí (Cloud nebo NODE_ENV=production): silné secrety a HTTPS CORS povinné. */
  isDeployed: boolean
  /**
   * Ostrý Cloud, kde vlastník dočasně povolil testovací platby (PAYMENTS_TEST_MODE=1) kvůli
   * smoke testu před spuštěním. Live klíč je pak zakázaný, aby se nedaly omylem zkombinovat.
   */
  paymentsTestMode: boolean
  /** `medusa build`: secrety nemusí být při buildu k dispozici, kontroly běží až při startu. */
  isBuild: boolean
}

type Env = Record<string, string | undefined>

const truthy = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase())

export function resolveDeployEnv(env: Env = process.env, argv: string[] = process.argv): DeployEnv {
  const cloudType = (env.MEDUSA_CLOUD_ENVIRONMENT_TYPE || "").trim().toLowerCase() || null
  const onCloud = env.EXECUTION_CONTEXT === "medusa-cloud" || Boolean(cloudType || (env.MEDUSA_CLOUD_ENVIRONMENT_HANDLE || "").trim())
  const productionTarget = onCloud ? cloudType === "production" : env.NODE_ENV === "production"
  const paymentsTestMode = productionTarget && truthy(env.PAYMENTS_TEST_MODE)
  return {
    onCloud,
    cloudType,
    isLive: productionTarget && !paymentsTestMode,
    isDeployed: onCloud || env.NODE_ENV === "production",
    paymentsTestMode,
    isBuild: argv.slice(2).find((arg) => !arg.startsWith("-")) === "build",
  }
}
