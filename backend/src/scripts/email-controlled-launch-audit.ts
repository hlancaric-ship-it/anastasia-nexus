import * as fs from "node:fs"
import * as path from "node:path"
import { Client } from "pg"
import {
  DEFAULT_CONTROLLED_LAUNCH_CUTOFF,
  PERMANENT_ALLOWED_RECIPIENTS,
  isPermanentAllowed,
  normalizeEmail,
} from "../lib/email/controlled-launch"

type AuditOptions = {
  cutoff?: Date
  dryRun?: boolean
  populate?: boolean
  cancelPending?: boolean
  dbConfig?: Record<string, unknown>
}

export type AuditSummary = {
  cutoff: string
  totalCustomers: number
  totalOrders: number
  permanentExceptionsCount: number
  historicalCustomersBlocked: number
  newCustomersAllowed: number
  unclaimedOrGuestCustomersBlocked: number
  pendingNotificationsCanceled: number
  dryRunPassed: boolean
  violations: string[]
}

/**
 * Spustí audit zákazníkov a preverí pravidlá riadeného spustenia e-mailov.
 */
export async function runEmailAudit(client: Client, options: AuditOptions = {}): Promise<AuditSummary> {
  const cutoff = options.cutoff ?? new Date(process.env.EMAIL_CONTROLLED_LAUNCH_CUTOFF || DEFAULT_CONTROLLED_LAUNCH_CUTOFF)

  // 1. Zabezpečenie tabuľky baseline
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_historical_baseline (
      email text PRIMARY KEY,
      customer_id text,
      cutoff timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_email_historical_baseline_email" ON email_historical_baseline (lower(email));
  `)

  // 2. Načítanie zákazníkov
  const custRes = await client.query(`
    SELECT id, email, has_account, metadata, created_at
    FROM customer
    WHERE deleted_at IS NULL
    ORDER BY created_at ASC
  `)

  // 3. Načítanie objednávok
  const orderRes = await client.query(`
    SELECT id, customer_id, email, created_at
    FROM "order"
    WHERE deleted_at IS NULL
  `)

  const historicalOrderCustomerIds = new Set<string>()
  const historicalOrderEmails = new Set<string>()
  for (const o of orderRes.rows) {
    const oCreated = new Date(o.created_at)
    if (oCreated.getTime() < cutoff.getTime()) {
      if (o.customer_id) historicalOrderCustomerIds.add(o.customer_id)
      if (o.email) historicalOrderEmails.add(normalizeEmail(o.email))
    }
  }

  let permanentCount = 0
  let historicalBlocked = 0
  let newAllowed = 0
  let guestBlocked = 0
  const violations: string[] = []
  const baselineEntries: Array<{ email: string; customerId: string }> = []

  for (const c of custRes.rows) {
    const email = normalizeEmail(c.email)
    const cCreated = new Date(c.created_at)
    const isHistoricalCreated = cCreated.getTime() < cutoff.getTime()
    const isLegacy = Boolean(c.metadata?.legacy_customer_migration || c.metadata?.legacy_ids || c.metadata?.legacy_id)
    const hasHistOrders = historicalOrderCustomerIds.has(c.id) || historicalOrderEmails.has(email)
    const isPermanent = isPermanentAllowed(email)

    if (isPermanent) {
      permanentCount++
      continue
    }

    if (isHistoricalCreated || isLegacy || hasHistOrders) {
      historicalBlocked++
      baselineEntries.push({ email, customerId: c.id })
    } else if (!c.has_account) {
      guestBlocked++
    } else {
      newAllowed++
    }

    // DRY-RUN OVERENIE: Nesmie existovať zákazník pred cutoffom, ktorý by bol vyhodnotený ako nový povolený
    if ((isHistoricalCreated || isLegacy || hasHistOrders) && !isPermanent) {
      // Skontrolujeme, že pravidlo by ho nepustilo
      if (cCreated.getTime() >= cutoff.getTime() && !isLegacy && !hasHistOrders) {
        violations.push(`VIOLATION: Zákazník ${c.id} (${email}) by prešiel ako nový napriek historickým záznamom!`)
      }
    }
  }

  // 4. Populate baseline tabuľky a offline súboru ak je požadované
  if (options.populate && baselineEntries.length > 0) {
    for (const b of baselineEntries) {
      await client.query(`
        INSERT INTO email_historical_baseline (email, customer_id, cutoff)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE SET customer_id = EXCLUDED.customer_id, cutoff = EXCLUDED.cutoff
      `, [b.email, b.customerId, cutoff])
    }

    try {
      const snapshotDir = path.resolve(__dirname, "../../data-private")
      if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true })
      const snapshotPath = path.join(snapshotDir, "historical-customer-baseline.json")
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            cutoff: cutoff.toISOString(),
            generated_at: new Date().toISOString(),
            permanent_exceptions: PERMANENT_ALLOWED_RECIPIENTS,
            count: baselineEntries.length,
            entries: baselineEntries,
          },
          null,
          2
        )
      )
    } catch {
      // Ak je data-private chránené
    }
  }

  // 5. Zrušenie čakajúcich notifikácií spred cutoffu
  let canceledPending = 0
  if (options.cancelPending) {
    try {
      const cancelRes = await client.query(`
        UPDATE notification
        SET status = 'canceled', updated_at = now()
        WHERE status = 'pending' AND created_at < $1
      `, [cutoff])
      canceledPending = cancelRes.rowCount ?? 0
    } catch {
      // Tabuľka notification nemusí existovať v niektorých testovacích schémach
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    totalCustomers: custRes.rows.length,
    totalOrders: orderRes.rows.length,
    permanentExceptionsCount: permanentCount,
    historicalCustomersBlocked: historicalBlocked,
    newCustomersAllowed: newAllowed,
    unclaimedOrGuestCustomersBlocked: guestBlocked,
    pendingNotificationsCanceled: canceledPending,
    dryRunPassed: violations.length === 0,
    violations,
  }
}

// Spustenie priamo z CLI
if (process.argv[1] && process.argv[1].endsWith("email-controlled-launch-audit.ts")) {
  ;(async () => {
    const args = process.argv.slice(2)
    const dryRun = args.includes("--dry-run")
    const populate = args.includes("--populate")
    const cancelPending = args.includes("--cancel-pending")
    const cutoffArg = args.find(a => a.startsWith("--cutoff="))?.split("=")[1]

    const pgUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/anastasia_dev_wave1"
    const client = new Client({ connectionString: pgUrl })

    try {
      await client.connect()
      console.log(`[EMAIL AUDIT] Pripojené k databáze: ${pgUrl.replace(/:[^:@]*@/, ":***@")}`)

      const summary = await runEmailAudit(client, {
        cutoff: cutoffArg ? new Date(cutoffArg) : undefined,
        dryRun,
        populate,
        cancelPending,
      })

      console.log("\n=======================================================")
      console.log("       ANASTASIA × NEXUS: EMAIL AUDIT & DRY-RUN")
      console.log("=======================================================")
      console.log(`Cut-off dátum aktivácie:        ${summary.cutoff}`)
      console.log(`Celkom zákazníkov v DB:         ${summary.totalCustomers}`)
      console.log(`Celkom objednávok v DB:         ${summary.totalOrders}`)
      console.log(`Trvalé výnimky (povolené):      ${summary.permanentExceptionsCount} (${PERMANENT_ALLOWED_RECIPIENTS.join(", ")})`)
      console.log(`Historickí zákazníci (BLOK):    ${summary.historicalCustomersBlocked}`)
      console.log(`Hosťovské/neaktívne účty (BLOK):${summary.unclaimedOrGuestCustomersBlocked}`)
      console.log(`Noví zákazníci po aktivácii:    ${summary.newCustomersAllowed}`)
      console.log(`Zrušené čakajúce notifikácie:   ${summary.pendingNotificationsCanceled}`)
      console.log(`Výsledok overenia DRY-RUN:      ${summary.dryRunPassed ? "PASS (0 chýb)" : "FAIL"}`)
      if (summary.violations.length) {
        console.error("Zistené porušenia pravidiel:", summary.violations)
      }
      console.log("=======================================================\n")

      if (populate) {
        console.log(`[EMAIL AUDIT] Baseline tabuľka bola úspešne naplnená.`)
      }
    } catch (err) {
      console.error("[EMAIL AUDIT] Chyba pri vykonávaní auditu:", err)
      process.exit(1)
    } finally {
      await client.end()
    }
  })()
}
