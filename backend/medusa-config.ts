import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'
import { resolveDeployEnv } from './src/lib/deploy-env'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Medusa Cloud: NODE_ENV i DATABASE_URL/REDIS_URL spravuje Cloud, typ prostředí určuje MEDUSA_CLOUD_ENVIRONMENT_TYPE (viz src/lib/deploy-env.ts).
const deploy = resolveDeployEnv()
// Kontroly secretů a CORS běží při startu nasazeného prostředí; `medusa build` je přeskočí (secrety nemusí mít flag Build).
const isProduction = deploy.isDeployed && !deploy.isBuild
const jwtSecret = process.env.JWT_SECRET || (isProduction ? "" : "local-development-jwt-secret-change-before-deploy")
const cookieSecret = process.env.COOKIE_SECRET || (isProduction ? "" : "local-development-cookie-secret-change-before-deploy")
const storeCors = process.env.STORE_CORS || (isProduction ? "" : "http://localhost:8000")
const adminCors = process.env.ADMIN_CORS || (isProduction ? "" : "http://localhost:9000")
const authCors = process.env.AUTH_CORS || (isProduction ? "" : "http://localhost:9000")
const productionOriginListIsSafe = (value: string) => value.split(",").every((entry) => {
  try {
    const origin = new URL(entry.trim())
    return origin.protocol === "https:" && origin.origin === entry.trim()
  } catch {
    return false
  }
})
const productionSecretIsSafe = (value: string) => value.length >= 32 && !/^(replace|local|change|supersecret)/i.test(value)
if (isProduction && (
  (!deploy.onCloud && !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || "")) ||
  !productionSecretIsSafe(jwtSecret) || !productionSecretIsSafe(cookieSecret) || jwtSecret === cookieSecret ||
  !storeCors || !adminCors || !authCors ||
  !productionOriginListIsSafe(storeCors) || !productionOriginListIsSafe(adminCors) || !productionOriginListIsSafe(authCors)
)) {
  throw new Error("Production requires PostgreSQL, unique 32+ character secrets, and HTTPS-only STORE_CORS, ADMIN_CORS, and AUTH_CORS origins")
}

const env = (name: string): string => (process.env[name] || "").trim()
const flag = (name: string, fallback: boolean): boolean => {
  const value = env(name).toLowerCase()
  if (!value) return fallback
  return ["1", "true", "yes", "on"].includes(value)
}

// --- Stripe (platby kartou, Apple Pay, Google Pay přes Payment Element) ---
const stripeApiKey = env("STRIPE_API_KEY")
const stripeWebhookSecret = env("STRIPE_WEBHOOK_SECRET")
const stripeIsLiveKey = /^(sk|rk)_live_/.test(stripeApiKey)
if (stripeApiKey && !/^(sk|rk)_(test|live)_/.test(stripeApiKey)) {
  throw new Error("STRIPE_API_KEY must be a Stripe secret/restricted key (sk_/rk_ test or live)")
}
const stripeLiveRequired = deploy.isLive && !deploy.isBuild
if (!deploy.isLive && stripeIsLiveKey) {
  throw new Error(deploy.paymentsTestMode
    ? "PAYMENTS_TEST_MODE is on: use sk_test_ key, or remove PAYMENTS_TEST_MODE to go live"
    : "Live Stripe key refused outside production: use sk_test_ key for local development, staging and previews")
}
if (stripeLiveRequired && (!stripeApiKey || !stripeIsLiveKey || !/^whsec_/.test(stripeWebhookSecret))) {
  throw new Error("Production requires a live Stripe key (STRIPE_API_KEY=sk_live_/rk_live_) and STRIPE_WEBHOOK_SECRET (whsec_)")
}
if (deploy.paymentsTestMode && !deploy.isBuild) {
  console.warn("[medusa-config] PAYMENTS_TEST_MODE: production environment accepts only Stripe TEST payments – remove before launch")
}
if (stripeApiKey && !stripeWebhookSecret) {
  console.warn("[medusa-config] STRIPE_WEBHOOK_SECRET is not set: Stripe webhooks will be rejected (use `stripe listen` locally)")
}

// --- Redis (jen pokud existuje REDIS_URL, jinak in-memory moduly pro lokální vývoj) ---
// Na Medusa Cloud Redis moduly (event bus, cache, workflow engine, locking) zřizuje Cloud sám a REDIS_URL
// je nastavená už při buildu – vlastní registrace by s nimi kolidovala a deploy by spadl.
const redisUrl = deploy.onCloud ? "" : env("REDIS_URL")
if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
  throw new Error("REDIS_URL must start with redis:// or rediss://")
}
if (isProduction && !deploy.onCloud && !redisUrl) {
  console.warn("[medusa-config] REDIS_URL is not set in production: in-memory event bus/cache/locking/workflow engine are not safe for production or multiple instances")
}

// --- Soubory: lokální disk (vývoj) nebo S3-kompatibilní úložiště (S3, Cloudflare R2) ---
const s3Bucket = env("S3_BUCKET")
const s3Configured = Boolean(s3Bucket && env("S3_FILE_URL") && env("S3_ACCESS_KEY_ID") && env("S3_SECRET_ACCESS_KEY") && env("S3_REGION"))
if (isProduction && !deploy.onCloud && !s3Configured) {
  console.warn("[medusa-config] S3_* is not configured in production: files would be stored on the local (ephemeral) disk of the Node host")
}

const fileProvider = s3Configured
  ? {
      resolve: "@medusajs/medusa/file-s3",
      id: "s3",
      options: {
        file_url: env("S3_FILE_URL"),
        access_key_id: env("S3_ACCESS_KEY_ID"),
        secret_access_key: env("S3_SECRET_ACCESS_KEY"),
        region: env("S3_REGION"),
        bucket: s3Bucket,
        ...(env("S3_ENDPOINT") ? { endpoint: env("S3_ENDPOINT") } : {}),
        ...(env("S3_ENDPOINT") ? { additional_client_config: { forcePathStyle: true } } : {}),
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: {
        upload_dir: "static",
        backend_url: `${env("BACKEND_PUBLIC_URL") || "http://localhost:9000"}/static`,
      },
    }

// --- Notifikace: e-maily přes ZeptoMail, pokud je nastavený klíč; jinak jen log bez osobních údajů (viz docs/DEPLOY.md) ---
const zeptoMailEnabled = Boolean(env("ZEPTOMAIL_API_KEY"))
// Testovací provoz (PAYMENTS_TEST_MODE na ostrém Cloudu, staging, náhledy PR): e-maily jen na EMAIL_RECIPIENT_ALLOWLIST,
// bez seznamu neodejde nic. Ostrý provoz bez omezení, pokud seznam výslovně nenastavíš.
const emailRecipientAllowlistRaw = env("EMAIL_RECIPIENT_ALLOWLIST")
const emailTestTraffic = deploy.paymentsTestMode || (deploy.onCloud && deploy.cloudType !== "production")
const emailRecipientAllowlist = emailRecipientAllowlistRaw || emailTestTraffic
  ? (emailRecipientAllowlistRaw || "").split(",").map((entry) => entry.trim()).filter(Boolean)
  : undefined
const notificationProviders: Array<Record<string, unknown>> = zeptoMailEnabled
  ? [
      {
        resolve: "./src/modules/notification-zeptomail",
        id: "zeptomail",
        options: {
          channels: ["email"],
          apiKey: env("ZEPTOMAIL_API_KEY"),
          fromEmail: env("ZEPTOMAIL_FROM_EMAIL"),
          fromName: env("ZEPTOMAIL_FROM_NAME") || "ANASTASIA",
          replyTo: env("ZEPTOMAIL_REPLY_TO") || undefined,
          apiUrl: env("ZEPTOMAIL_API_URL") || undefined,
          recipientAllowlist: emailRecipientAllowlist,
        },
      },
      // kanál feed (in-app) zůstává na log provideru – jeden kanál smí mít jen jeden provider
      { resolve: "./src/modules/notification-log", id: "local", options: { channels: ["feed"] } },
    ]
  : [{ resolve: "./src/modules/notification-log", id: "local", options: { channels: ["email", "feed"] } }]

const modules: Array<Record<string, unknown>> = [
  // Na Medusa Cloud skládá file modul defineConfig sám (S3 Cloudu přes IAM roli a Cloudem vložené S3_*);
  // vlastní registrace by ho přepsala. Média webu jsou mimo Medusu (R2 přes NEXUS Worker).
  ...(deploy.onCloud ? [] : [{
    key: Modules.FILE,
    resolve: "@medusajs/medusa/file",
    options: { providers: [fileProvider] },
  }]),
  {
    key: Modules.NOTIFICATION,
    resolve: "@medusajs/medusa/notification",
    options: { providers: notificationProviders },
  },
  {
    key: Modules.AUTH,
    resolve: "@medusajs/medusa/auth",
    options: {
      providers: [
        { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
        {
          resolve: "./src/modules/auth-magic-link",
          id: "magic-link",
          options: { linkBaseUrl: env("MAGIC_LINK_BASE_URL") },
        },
      ],
    },
  },
  { resolve: "./src/modules/entitlement" },
  { resolve: "./src/modules/booking" },
  { resolve: "./src/modules/gift-voucher" },
  { resolve: "./src/modules/chat" },
  { resolve: "./src/modules/ops-audit" },
  { resolve: "./src/modules/email-template" },
  { resolve: "./src/modules/legal" },
  { resolve: "./src/modules/customer-privacy" },
  { resolve: "./src/modules/auth-security" },
  // Klub ANASTASIA: členství, smlouvy, obnovy a přístup (vlastní Codex, viz docs/wp/membership-checkout.md)
  { resolve: "./src/modules/membership" },
]

if (stripeApiKey) {
  modules.push({
    key: Modules.PAYMENT,
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: [
        {
          // Provider ID v Medusa: pp_stripe_stripe, webhook: POST /hooks/payment/stripe_stripe
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret,
            // Digitální produkty: platba se stahuje okamžitě. STRIPE_CAPTURE=false = ruční capture.
            capture: flag("STRIPE_CAPTURE", true),
            // Payment Element + automatické metody (karty, Apple Pay, Google Pay dle nastavení Stripe účtu).
            automaticPaymentMethods: true,
            ...(env("STRIPE_PAYMENT_METHOD_CONFIGURATION") ? { paymentMethodConfiguration: env("STRIPE_PAYMENT_METHOD_CONFIGURATION") } : {}),
          },
        },
        {
          // Klub: první platba i obnova (pp_membership_stripe_membership). initiate nepotvrzuje,
          // off-session potvrzení až v authorize po validaci jádra a SafeOrder. Běžný provider výše zůstává.
          resolve: "./src/modules/membership-stripe",
          id: "membership",
          options: { apiKey: stripeApiKey, webhookSecret: stripeWebhookSecret, capture: true },
        },
      ],
    },
  })
}

if (redisUrl) {
  modules.push(
    { key: Modules.EVENT_BUS, resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
    { key: Modules.CACHE, resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
    { key: Modules.WORKFLOW_ENGINE, resolve: "@medusajs/medusa/workflow-engine-redis", options: { redisUrl } },
    {
      key: Modules.LOCKING,
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } },
        ],
      },
    },
  )
}

module.exports = defineConfig({
  projectConfig: {
    // Na Cloudu databaseUrl ani redisUrl nenastavujeme (spravuje je Cloud).
    ...(deploy.onCloud ? {} : { databaseUrl: process.env.DATABASE_URL }),
    ...(redisUrl ? { redisUrl } : {}),
    http: {
      storeCors,
      adminCors,
      authCors,
      jwtSecret,
      cookieSecret,
    }
  },
  modules,
})
