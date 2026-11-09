import {
  evaluateRecipientEligibility,
  getControlledLaunchConfig,
  isPermanentAllowed,
  PERMANENT_ALLOWED_RECIPIENTS,
  type PolicyDatabaseAdapter,
} from "../controlled-launch"
import { sendEmail, type SendEmailInput } from "../send"
import ResendNotificationService from "../../../modules/notification-resend/service"
import { NotificationStatus } from "@medusajs/framework/utils"

describe("ANASTASIA × NEXUS — P0: Riadené spustenie e-mailov", () => {
  const CUTOFF = new Date("2026-11-09T00:00:00.000Z")
  const BEFORE_CUTOFF = new Date("2026-11-01T12:00:00.000Z")
  const AFTER_CUTOFF = new Date("2026-11-09T08:00:00.000Z")

  const defaultMockDb: PolicyDatabaseAdapter = {
    isBaselineReady: jest.fn(async () => ({ ready: true, count: 50 })),
    getBaselineCutoff: jest.fn(async () => CUTOFF),
    isEmailInBaseline: jest.fn(async () => false),
    getCustomerByEmail: jest.fn(async () => []),
    getHistoricalOrdersCount: jest.fn(async () => 0),
    getPendingRegistration: jest.fn(async () => null),
    getOrderCreatedAt: jest.fn(async () => AFTER_CUTOFF),
    isUnsubscribed: jest.fn(async () => false),
  }

  const baseConfig = {
    active: true,
    cutoff: CUTOFF,
    permanentRecipients: PERMANENT_ALLOWED_RECIPIENTS,
  }

  // --- 1. Trvalé výnimky (povolené vždy, bez ohľadu na dátum registrácie) ---
  describe("Trvalé výnimky", () => {
    it("5. zdravysvet.anastasiaoz@gmail.com -> povolené", async () => {
      const email = "zdravysvet.anastasiaoz@gmail.com"
      expect(isPermanentAllowed(email)).toBe(true)

      const res = await evaluateRecipientEligibility(
        { db: defaultMockDb, config: baseConfig },
        { to: email, template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("permanent_exception")
    })

    it("6. lucia.rogozanova@gmail.com -> povolené", async () => {
      const email = "lucia.rogozanova@gmail.com"
      expect(isPermanentAllowed(email)).toBe(true)

      const res = await evaluateRecipientEligibility(
        { db: defaultMockDb, config: baseConfig },
        { to: email, template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("permanent_exception")
    })

    it("7. ceo@l-code-dynamics.com -> povolené", async () => {
      const email = "ceo@l-code-dynamics.com"
      expect(isPermanentAllowed(email)).toBe(true)

      const res = await evaluateRecipientEligibility(
        { db: defaultMockDb, config: baseConfig },
        { to: email, template: "admin-password-reset" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("permanent_exception")
    })

    it("nerozlišuje veľkosť písmen a biele znaky u trvalých výnimiek", async () => {
      expect(isPermanentAllowed("  CEO@L-CODE-DYNAMICS.COM  ")).toBe(true)
      expect(isPermanentAllowed("Lucia.Rogozanova@Gmail.Com")).toBe(true)
      expect(isPermanentAllowed("ZDRAVYSVET.ANASTASIAOZ@GMAIL.COM")).toBe(true)

      const res = await evaluateRecipientEligibility(
        { db: defaultMockDb, config: baseConfig },
        { to: "  CEO@L-CODE-DYNAMICS.COM  ", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("permanent_exception")
    })
  })

  // --- 2. Nový zákazník vs. Historický zákazník ---
  describe("Zákaznícka identita", () => {
    it("1. Nový zákazník (vytvorený po aktivácii, has_account=true, bez histórie) -> e-mail sa odošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_new_123",
            email: "novy.zakaznik@priklad.sk",
            has_account: true,
            created_at: AFTER_CUTOFF,
            metadata: null,
          },
        ]),
        getHistoricalOrdersCount: jest.fn(async () => 0),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "novy.zakaznik@priklad.sk", template: "customer-welcome-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("verified_new_customer")
      expect(res.details?.customer_id).toBe("cus_new_123")
    })

    it("2. Historický zákazník (vytvorený pred cutoffom) -> e-mail sa neodošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_hist_old",
            email: "stary.zakaznik@priklad.sk",
            has_account: true,
            created_at: BEFORE_CUTOFF,
            metadata: null,
          },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "stary.zakaznik@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_customer")
    })

    it("3. Historický zákazník, ktorý sa prvýkrát prihlási cez magic link -> e-mail sa neodošle", async () => {
      // Zákazník zo starého webu má legacy migráciu a has_account=false (alebo práve prebehol legacy claim)
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_legacy_claim",
            email: "historicky.prihlasenie@priklad.sk",
            has_account: false,
            created_at: BEFORE_CUTOFF,
            metadata: { legacy_customer_migration: { legacy_ids: ["ec_442"] } },
          },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "historicky.prihlasenie@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(["historical_customer", "legacy_imported_customer", "guest_or_unclaimed_account"]).toContain(res.reason)
    })

    it("4. Historický zákazník s novým heslom -> e-mail sa neodošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_hist_pass",
            email: "nove.heslo.stary@priklad.sk",
            has_account: true,
            created_at: BEFORE_CUTOFF,
            metadata: null,
          },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "nove.heslo.stary@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_customer")
    })

    it("zákazník s historickými objednávkami spred cutoffu -> e-mail sa neodošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_with_orders",
            email: "stare.objednavky@priklad.sk",
            has_account: true,
            created_at: AFTER_CUTOFF, // hoci účet vznikol po cut-offe, má staré objednávky
            metadata: null,
          },
        ]),
        getHistoricalOrdersCount: jest.fn(async () => 2),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "stare.objednavky@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("customer_has_historical_orders")
    })

    it("zákazník evidovaný v historickom baseline -> e-mail sa neodošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        isEmailInBaseline: jest.fn(async () => true),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "baseline.zakaznik@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_baseline_customer")
    })
  })

  // --- 3. Neznámy príjemca a registrácia ---
  describe("Neznámy príjemca a nová registrácia", () => {
    it("8. Neznámy e-mail zadaný do magic-link formulára bez registrácie -> bez automatického povolenia", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => []),
        getPendingRegistration: jest.fn(async () => null), // žiadna čakajúca registrácia
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "cudzinec@neznama-domena.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("unknown_recipient_not_registered")
    })

    it("Nová registrácia (platný záznam v auth_registration_state) -> magic link na overenie sa odošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => []),
        getPendingRegistration: jest.fn(async () => ({
          payload: { first_name: "Jana", last_name: "Nová", email: "nova.registracia@priklad.sk" },
          created_at: AFTER_CUTOFF,
          expires_at: new Date(Date.now() + 30 * 60 * 1000),
        })),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "nova.registracia@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("new_registration_pending")
    })

    it("Pending registrácia s chýbajúcim created_at -> zablokované (invalid_pending_registration)", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => []),
        getPendingRegistration: jest.fn(async () => ({
          payload: { email: "bez-datumu@priklad.sk" },
          created_at: null,
        })),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "bez-datumu@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("invalid_pending_registration")
    })

    it("Pending registrácia s neplatným created_at -> zablokované (invalid_pending_registration)", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => []),
        getPendingRegistration: jest.fn(async () => ({
          payload: { email: "neplatny-datum@priklad.sk" },
          created_at: "not-a-valid-date",
        })),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "neplatny-datum@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("invalid_pending_registration")
    })

    it("Pending registrácia z obdobia pred cutoffom -> zablokované (historical_pending_registration)", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => []),
        getPendingRegistration: jest.fn(async () => ({
          payload: { email: "stara-registracia@priklad.sk" },
          created_at: BEFORE_CUTOFF,
        })),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "stara-registracia@priklad.sk", template: "magic-link-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_pending_registration")
    })
  })

  // --- 4. Historická fronta a objednávky ---
  describe("Historické objednávky a notifikácie", () => {
    it("9. Historická fronta oznámení: objednávka vytvorená pred cutoffom -> bez spätného rozoslania", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getOrderCreatedAt: jest.fn(async () => BEFORE_CUTOFF),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        {
          to: "zakaznik@priklad.sk",
          template: "order-placed-sk",
          resource_type: "order",
          resource_id: "order_hist_999",
        }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_order")
    })

    it("10. Nová objednávka oprávneného zákazníka po cutoffe -> potvrdenie sa odošle", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          {
            id: "cus_new_orderer",
            email: "novy.kupujuci@priklad.sk",
            has_account: true,
            created_at: AFTER_CUTOFF,
            metadata: null,
          },
        ]),
        getOrderCreatedAt: jest.fn(async () => AFTER_CUTOFF),
        getHistoricalOrdersCount: jest.fn(async () => 0),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        {
          to: "novy.kupujuci@priklad.sk",
          template: "order-placed-sk",
          resource_type: "order",
          resource_id: "order_new_123",
        }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("verified_new_customer")
    })
  })

  // --- 5. Fail-Closed a chybové stavy ---
  describe("Bezpečnosť a chybové stavy (Fail-Closed)", () => {
    it("11. Chyba databázy alebo kontroly identity -> odoslanie sa bezpečne zablokuje", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => {
          throw new Error("PG_CONNECTION_TIMEOUT")
        }),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "bezkontroly@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("verification_error")
    })

    it("Chýbajúci databázový adaptér mimo trvalých výnimiek zablokuje odoslanie", async () => {
      const res = await evaluateRecipientEligibility(
        { config: baseConfig },
        { to: "niekto@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("verification_error")
    })

    it("Neplatná e-mailová adresa je zablokovaná", async () => {
      const res = await evaluateRecipientEligibility(
        { db: defaultMockDb, config: baseConfig },
        { to: "neplatny-format", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("invalid_email")
    })

    it("Marketingová kampaň je počas riadeného spustenia zablokovaná", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_new", email: "novy@priklad.sk", has_account: true, created_at: AFTER_CUTOFF },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "novy@priklad.sk", template: "newsletter-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("marketing_disabled_during_controlled_launch")
    })

    it("Odhlásený používateľ nedostane e-mail", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_unsub", email: "odhláseny@priklad.sk", has_account: true, created_at: AFTER_CUTOFF },
        ]),
        isUnsubscribed: jest.fn(async () => true),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "odhláseny@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("unsubscribed")
    })
  })

  // --- 6. Integrácia v sendEmail ---
  describe("Integrácia v sendEmail", () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
      process.env = { ...originalEnv }
    })

    it("sendEmail potlačí odoslanie historickému zákazníkovi a vráti disabled", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      process.env.EMAIL_CONTROLLED_LAUNCH_CUTOFF = CUTOFF.toISOString()

      const mockNotifications = {
        createNotifications: jest.fn(async () => ({ id: "noti_123" })),
        listNotifications: jest.fn(async () => []),
      }

      // Mock PG connection s historickým zákazníkom
      const mockPg = jest.fn(() => ({
        whereRaw: jest.fn(() => ({
          whereNull: jest.fn(() => ({
            select: jest.fn(async () => [
              { id: "cus_hist", email: "hist@priklad.sk", has_account: true, created_at: BEFORE_CUTOFF },
            ]),
          })),
        })),
        where: jest.fn(() => ({
          andWhere: jest.fn(() => ({
            whereNull: jest.fn(() => ({
              count: jest.fn(() => ({
                first: jest.fn(async () => ({ count: 0 })),
              })),
            })),
          })),
        })),
      }))

      const container = {
        resolve: jest.fn((key: string) => {
          if (key === "notification") return mockNotifications
          if (key === "pg_connection") return mockPg
          return null
        }),
      }

      const result = await sendEmail(container as any, {
        to: "hist@priklad.sk",
        template: "order-placed-sk",
      })

      expect(result).toEqual({ status: "disabled" })
      expect(mockNotifications.createNotifications).not.toHaveBeenCalled()
    })

    it("sendEmail odošle notifikáciu trvalej výnimke aj v riadenom režime", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      process.env.EMAIL_CONTROLLED_LAUNCH_CUTOFF = CUTOFF.toISOString()

      const mockNotifications = {
        createNotifications: jest.fn(async () => ({ id: "noti_perm" })),
        listNotifications: jest.fn(async () => [
          { id: "noti_perm", status: NotificationStatus.SUCCESS, to: "ceo@l-code-dynamics.com", channel: "email", template: "order-placed-sk" },
        ]),
      }

      const container = {
        resolve: jest.fn((key: string) => {
          if (key === "notification") return mockNotifications
          return null
        }),
      }

      const result = await sendEmail(container as any, {
        to: "ceo@l-code-dynamics.com",
        template: "order-placed-sk",
      })

      expect(result).toEqual({ status: "sent" })
      expect(mockNotifications.createNotifications).toHaveBeenCalledTimes(1)
    })
  })

  // --- 7. Resend Notification Provider test ---
  describe("ResendNotificationService provider", () => {
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any

    it("Resend provider odošle e-mail na povolené adresy (zdravysvet, lucia, ceo)", async () => {
      const fetchImpl = jest.fn(async () => ({
        status: 200,
        json: async () => ({ id: "resend_msg_123" }),
      }))

      const service = new ResendNotificationService(
        { logger },
        {
          apiKey: "re_test_key_12345",
          fromEmail: "noreply@anastasiaoz.eu",
          recipientAllowlist: ["@l-code-dynamics.com"], // allowlist obsahuje len l-code
        },
        fetchImpl as any
      )

      // ceo@l-code-dynamics.com
      const resCeo = await service.send({
        to: "ceo@l-code-dynamics.com",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
      })
      expect(resCeo.id).toBe("resend_msg_123")

      // zdravysvet.anastasiaoz@gmail.com (nie je v allowliste @l-code-dynamics.com, ale je v trvalých výnimkách)
      const resZdravysvet = await service.send({
        to: "zdravysvet.anastasiaoz@gmail.com",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
      })
      expect(resZdravysvet.id).toBe("resend_msg_123")

      // lucia.rogozanova@gmail.com (nie je v allowliste, ale je v trvalých výnimkách)
      const resLucia = await service.send({
        to: "lucia.rogozanova@gmail.com",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
      })
      expect(resLucia.id).toBe("resend_msg_123")
    })

    it("Resend provider potlačí odoslanie neoprávnenému príjemcovi", async () => {
      const fetchImpl = jest.fn()

      const service = new ResendNotificationService(
        { logger },
        {
          apiKey: "re_test_key_12345",
          fromEmail: "noreply@anastasiaoz.eu",
          recipientAllowlist: ["@l-code-dynamics.com"],
        },
        fetchImpl as any
      )

      const result = await service.send({
        to: "cudzinec@gmail.com",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
      })

      expect(result).toEqual({})
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

  // --- 8. Povinný historický baseline pred aktiváciou ---
  describe("Povinný historický baseline", () => {
    it("chýbajúca tabuľka baseline: trvalé výnimky povolené, noví aj starí zákazníci zablokovaní", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        isBaselineReady: jest.fn(async () => ({ ready: false, error: "BASELINE_TABLE_MISSING" })),
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_new", email: "novy@priklad.sk", has_account: true, created_at: AFTER_CUTOFF },
        ]),
      }

      // Trvalé výnimky prejdú
      for (const email of ["zdravysvet.anastasiaoz@gmail.com", "lucia.rogozanova@gmail.com", "ceo@l-code-dynamics.com"]) {
        const res = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: email, template: "order-placed-sk" })
        expect(res.eligible).toBe(true)
        expect(res.reason).toBe("permanent_exception")
      }

      // Nový zákazník je zablokovaný kvôli baseline_not_ready
      const resNew = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "novy@priklad.sk", template: "order-placed-sk" })
      expect(resNew.eligible).toBe(false)
      expect(resNew.reason).toBe("baseline_not_ready")
      expect(resNew.details?.error).toBe("BASELINE_TABLE_MISSING")

      // Historický zákazník je tiež zablokovaný
      const resHist = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "stary@priklad.sk", template: "order-placed-sk" })
      expect(resHist.eligible).toBe(false)
      expect(resHist.reason).toBe("baseline_not_ready")
    })

    it("prázdna tabuľka baseline (count = 0): povolené len 3 trvalé výnimky", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        isBaselineReady: jest.fn(async () => ({ ready: false, count: 0, error: "BASELINE_EMPTY" })),
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_new", email: "novy@priklad.sk", has_account: true, created_at: AFTER_CUTOFF },
        ]),
      }

      const resPerm = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "ceo@l-code-dynamics.com", template: "order-placed-sk" })
      expect(resPerm.eligible).toBe(true)

      const resOther = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "novy@priklad.sk", template: "order-placed-sk" })
      expect(resOther.eligible).toBe(false)
      expect(resOther.reason).toBe("baseline_not_ready")
      expect(resOther.details?.error).toBe("BASELINE_EMPTY")
    })

    it("chyba pri kontrole baseline: fail-closed na baseline_not_ready pre bežných zákazníkov", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        isBaselineReady: jest.fn(async () => ({ ready: false, error: "BASELINE_QUERY_TIMEOUT" })),
      }

      const res = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "novy@priklad.sk", template: "order-placed-sk" })
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("baseline_not_ready")
      expect(res.details?.error).toBe("BASELINE_QUERY_TIMEOUT")
    })

    it("chýbajúca implementácia isBaselineReady na adaptéri vráti baseline_not_ready", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        isBaselineReady: undefined,
      }

      const res = await evaluateRecipientEligibility({ db, config: baseConfig }, { to: "novy@priklad.sk", template: "order-placed-sk" })
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("baseline_not_ready")
      expect(res.details?.error).toBe("BASELINE_CHECK_UNAVAILABLE")
    })
  })

  // --- 9. Dynamický aktivačný cut-off (odstránenie časovej medzery) ---
  describe("Dynamický aktivačný cut-off", () => {
    const ACTIVATION_TIME = new Date("2026-11-09T14:30:00.000Z")
    const IN_BETWEEN_TIME = new Date("2026-11-09T10:00:00.000Z") // po 00:00 UTC, ale PRED snapshotom
    const AFTER_ACTIVATION = new Date("2026-11-09T15:00:00.000Z") // po snapshote

    it("zákazník vytvorený medzi statickým cutoffom a reálnym snapshotom je zablokovaný ako historický", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getBaselineCutoff: jest.fn(async () => ACTIVATION_TIME),
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_gap", email: "gap@priklad.sk", has_account: true, created_at: IN_BETWEEN_TIME },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "gap@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(false)
      expect(res.reason).toBe("historical_customer")
    })

    it("zákazník vytvorený po reálnom okamihu aktivácie je povolený ako nový", async () => {
      const db: PolicyDatabaseAdapter = {
        ...defaultMockDb,
        getBaselineCutoff: jest.fn(async () => ACTIVATION_TIME),
        getCustomerByEmail: jest.fn(async () => [
          { id: "cus_after", email: "after@priklad.sk", has_account: true, created_at: AFTER_ACTIVATION },
        ]),
      }

      const res = await evaluateRecipientEligibility(
        { db, config: baseConfig },
        { to: "after@priklad.sk", template: "order-placed-sk" }
      )
      expect(res.eligible).toBe(true)
      expect(res.reason).toBe("verified_new_customer")
    })
  })

  // --- 10. Provider kontrola priamych volaní (Bypass & Marketing prevencia) ---
  describe("Notification Provider priame volania a bypass prevencia", () => {
    const originalEnv = { ...process.env }
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any

    afterEach(() => {
      process.env = { ...originalEnv }
    })

    it("priame volanie providera bez _controlled_launch_verified potlačí odoslanie neoprávnenému adresátovi", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      const fetchImpl = jest.fn()

      const service = new ResendNotificationService(
        { logger },
        { apiKey: "re_test_key_12345", fromEmail: "noreply@anastasiaoz.eu" },
        fetchImpl as any
      )

      const result = await service.send({
        to: "priamy.bypass@priklad.sk",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
        data: {}, // chýba _controlled_launch_verified: true
      })

      expect(result).toEqual({})
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("priame volanie providera s _controlled_launch_verified=true odošle správu cez provider", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      const fetchImpl = jest.fn(async () => ({
        status: 200,
        json: async () => ({ id: "resend_verified_456" }),
      }))

      const service = new ResendNotificationService(
        { logger },
        { apiKey: "re_test_key_12345", fromEmail: "noreply@anastasiaoz.eu" },
        fetchImpl as any
      )

      const result = await service.send({
        to: "novy.overeny@priklad.sk",
        channel: "email",
        template: "order-placed-sk",
        content: { subject: "Test", text: "Text" },
        data: { _controlled_launch_verified: true },
      })

      expect(result.id).toBe("resend_verified_456")
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it("trvalé výnimky sa odošlú priamo aj bez _controlled_launch_verified príznaku", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      const fetchImpl = jest.fn(async () => ({
        status: 200,
        json: async () => ({ id: "resend_perm_ok" }),
      }))

      const service = new ResendNotificationService(
        { logger },
        { apiKey: "re_test_key_12345", fromEmail: "noreply@anastasiaoz.eu" },
        fetchImpl as any
      )

      for (const email of ["zdravysvet.anastasiaoz@gmail.com", "lucia.rogozanova@gmail.com", "ceo@l-code-dynamics.com"]) {
        const result = await service.send({
          to: email,
          channel: "email",
          template: "order-placed-sk",
          content: { subject: "Test", text: "Text" },
        })
        expect(result.id).toBe("resend_perm_ok")
      }
      expect(fetchImpl).toHaveBeenCalledTimes(3)
    })

    it("priame odoslanie marketingového newslettera je v riadenom režime zablokované priamo v provideri", async () => {
      process.env.EMAIL_CONTROLLED_LAUNCH = "1"
      const fetchImpl = jest.fn()

      const service = new ResendNotificationService(
        { logger },
        { apiKey: "re_test_key_12345", fromEmail: "noreply@anastasiaoz.eu" },
        fetchImpl as any
      )

      const result = await service.send({
        to: "ktokolvek@priklad.sk",
        channel: "email",
        template: "newsletter-campaign",
        content: { subject: "Novinky", text: "Text" },
        data: { _controlled_launch_verified: true },
      })

      expect(result).toEqual({})
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })
})
