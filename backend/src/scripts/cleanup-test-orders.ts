/**
 * Skript pro bezpečný úklid testovacích dat a anonymizaci před pentestem (L1 a L4):
 *   - Skupina A: testovací objednávky #62–#66 (storno)
 *   - Skupina B: starší testovací objednávky #50–#61 (storno)
 *   - Skupina C: hostující e2e zákazníci (anonymizace/výmaz PII)
 *   - Skupina D (L4): anonymizace migrovaných objednávek #40–#49 před pentestem
 *
 * Výchozí režim: DRY-RUN (jen vypíše, co by udělal).
 * Spuštění naostro:
 *   npx medusa exec src/scripts/cleanup-test-orders.ts --execute
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import { anonymizeCustomer } from "../modules/customer-privacy/erase"

export default async function cleanupTestOrders({
  container,
  args = [],
}: {
  container: MedusaContainer
  args?: string[]
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const execute = args.includes("--execute") || process.env.CONFIRM_CLEANUP === "1"

  logger.info(`[cleanup-test-orders] Režim: ${execute ? "OSTRE SPUSTENIE (--execute)" : "DRY-RUN (náhled)"}`)

  // 1. Zrušenie testovacích objednávok (#50-#66)
  const testDisplayIds = [50, 51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66]
  const { data: testOrders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "payment_status", "email", "metadata"],
    filters: { display_id: testDisplayIds },
  })

  logger.info(`[cleanup-test-orders] Nájdených ${testOrders.length} testovacích objednávok na storno.`)
  for (const ord of testOrders) {
    if (ord.status === "canceled") {
      logger.info(`  #${ord.display_id} (${ord.id}) už je zrušená.`)
      continue
    }
    if (execute) {
      await cancelOrderWorkflow(container).run({
        input: {
          order_id: ord.id,
          canceled_by: "system_cleanup",
        },
      })
      logger.info(`  #${ord.display_id} (${ord.id}) ZRUŠENÁ.`)
    } else {
      logger.info(`  [DRY-RUN] Bylo by zrušeno: #${ord.display_id} (${ord.id}, status: ${ord.status}, email: ${ord.email})`)
    }
  }

  // 2. Anonymizácia migrovaných objednávok #40-#49 pre pentest (L4)
  const auditProtectedIds = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]
  const { data: migOrders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "customer_id", "email"],
    filters: { display_id: auditProtectedIds },
  })
  logger.info(`[cleanup-test-orders] Nájdených ${migOrders.length} migrovaných objednávok na anonymizáciu pred pentestom (L4).`)
  for (const ord of migOrders) {
    if (!ord.customer_id) continue
    if (execute) {
      const cust = await db("customer").where({ id: ord.customer_id }).first()
      if (cust && !cust.email.startsWith("erased_")) {
        await anonymizeCustomer(db, cust)
        logger.info(`  Objednávka #${ord.display_id} zákazník ${ord.customer_id} ANONYMIZOVANÝ.`)
      }
    } else {
      logger.info(`  [DRY-RUN] Bylo by anonymizováno PII u #${ord.display_id} (zákazník: ${ord.customer_id}, email: ${ord.email})`)
    }
  }

  // 3. Zákazníci e2e+ (guest účty bez aktívnych objednávok)
  const e2eGuestIds = [
    "cus_01M5NXMR2ER55J16RD1MKAA36Q",
    "cus_01M5NXN1KTN95GD62ZRF5JKPC0",
    "cus_01M5RNFM9V2S8SC7AEXFNJQQHW",
    "cus_01M5RNGGA8JXX3APQ3NENABKRY",
    "cus_01M5SN5C202BZQT41P9C61QJXF",
    "cus_01M5W4C05T7BCPDAJSGRVFCNG8",
    "cus_01M5Z47QT1F0YP0T9QCKYQWTNQ",
  ]
  logger.info(`[cleanup-test-orders] Kontrola ${e2eGuestIds.length} e2e+ testovacích zákazníkov.`)
  for (const cid of e2eGuestIds) {
    const cust = await db("customer").where({ id: cid }).first()
    if (!cust) continue
    if (execute) {
      await anonymizeCustomer(db, cust)
      logger.info(`  E2E zákazník ${cid} anonymizovaný/vymazaný.`)
    } else {
      logger.info(`  [DRY-RUN] Bylo by vymazáno/anonymizováno: ${cid} (${cust.email})`)
    }
  }

  logger.info("[cleanup-test-orders] Kontrola a úklid dokončený.")
}
