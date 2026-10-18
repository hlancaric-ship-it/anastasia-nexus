const lib: any = require("../db-backup-cloud.cjs")

describe("produkční záloha DB – pojistky", () => {
  const originalNodeEnv = process.env.NODE_ENV
  afterEach(() => { process.env.NODE_ENV = originalNodeEnv })

  it("zdroj: vzdálená DB jen přes TLS, lokální jen výslovně, žádné přesměrování hostitele", () => {
    expect(lib.validateSourceUrl("postgres://ro:pw@db.medusajs.cloud:5432/main").searchParams.get("sslmode")).toBe("require")
    expect(lib.validateSourceUrl("postgresql://ro:pw@db.example/main?sslmode=verify-full").searchParams.get("sslmode")).toBe("verify-full")
    expect(() => lib.validateSourceUrl("postgres://ro:pw@db.example/main?sslmode=disable")).toThrow("BACKUP_SOURCE_TLS_REQUIRED")
    expect(() => lib.validateSourceUrl("postgres://ro:pw@db.example/main?sslmode=prefer")).toThrow("BACKUP_SOURCE_TLS_REQUIRED")
    expect(() => lib.validateSourceUrl("postgres://ro:pw@db.example/main?host=evil")).toThrow("BACKUP_DATABASE_URL_INVALID")
    expect(() => lib.validateSourceUrl("postgres://localhost/main")).toThrow("BACKUP_SOURCE_LOCAL_FORBIDDEN")
    expect(lib.validateSourceUrl("postgres://localhost/main", { allowLocal: true }).hostname).toBe("localhost")
    expect(() => lib.validateSourceUrl("mysql://db.example/main")).toThrow("BACKUP_DATABASE_URL_INVALID")
    expect(() => lib.validateSourceUrl("postgres://db.example/")).toThrow("BACKUP_DATABASE_URL_INVALID")
    expect(() => lib.validateSourceUrl(undefined)).toThrow("BACKUP_DATABASE_URL_REQUIRED")
  })

  it("cíl obnovy smí být jen lokální a nikdy v produkčním režimu", () => {
    expect(lib.validateLocalTargetUrl("postgres://u:p@127.0.0.1:55432/restore").pathname).toBe("/restore")
    expect(() => lib.validateLocalTargetUrl("postgres://u:p@db.medusajs.cloud/main")).toThrow("RESTORE_DATABASE_URL_MUST_BE_LOCAL")
    process.env.NODE_ENV = "production"
    expect(() => lib.validateLocalTargetUrl("postgres://localhost/restore")).toThrow("PRODUCTION_MODE_FORBIDDEN")
  })

  it("klíče objektů: denní vždy, měsíční jen 1. den v měsíci (UTC)", () => {
    expect(lib.objectKeys(new Date("2026-10-23T02:17:05.123Z")).keys).toEqual(["daily/2026/10/anastasia-2026-10-23T02-17-05Z.dump.gpg"])
    expect(lib.objectKeys(new Date("2026-11-01T02:17:05Z")).keys).toEqual([
      "daily/2026/11/anastasia-2026-11-01T02-17-05Z.dump.gpg", "monthly/2026/anastasia-2026-11-01T02-17-05Z.dump.gpg"])
    for (const k of lib.objectKeys(new Date("2026-11-01T02:17:05Z")).keys) expect(lib.validateObjectKey(k)).toBe(k)
    expect(() => lib.validateObjectKey("daily/2026/10/../../x.dump.gpg")).toThrow("BACKUP_KEY_INVALID")
    expect(() => lib.validateObjectKey("other/anastasia-2026-10-23T02-17-05Z.dump.gpg")).toThrow("BACKUP_KEY_INVALID")
  })

  it("účet zálohy: bez zápisových práv, nebo read-only replika; jinak odmítnout", () => {
    expect(lib.evaluateReadOnly({ elevated: false, writable: 0, in_recovery: false })).toEqual({ ok: true, reason: "NO_WRITE_PRIVILEGES" })
    expect(lib.evaluateReadOnly({ elevated: false, writable: 12, in_recovery: true })).toEqual({ ok: true, reason: "READ_ONLY_REPLICA" })
    expect(lib.evaluateReadOnly({ elevated: false, writable: 12, in_recovery: false }).ok).toBe(false)
    expect(lib.evaluateReadOnly({ elevated: true, writable: 0, in_recovery: true })).toEqual({ ok: false, reason: "ROLE_ELEVATED" })
    expect(lib.evaluateReadOnly({ elevated: null, writable: 0, in_recovery: false }).ok).toBe(false)
    expect(() => lib.evaluateReadOnly(null)).toThrow("READ_ONLY_CHECK_FAILED")
  })

  it("porovnání obnovy: přesná shoda u tabulek beze změny, chybějící tabulka je chyba", () => {
    const pre = { "public.order": 5, "public.cart": 9, "public.store": 1 }
    expect(lib.compareCounts(pre, pre, { ...pre })).toMatchObject({ ok: true, tables: 3, rows: 15 })
    expect(lib.compareCounts(pre, pre, { ...pre, "public.order": 4 }).errors).toEqual(["ROW_COUNT:public.order"])
    expect(lib.compareCounts(pre, pre, { "public.order": 5, "public.store": 1 }).errors).toEqual(["MISSING_TABLE:public.cart"])
    expect(lib.compareCounts(pre, pre, { ...pre, "public.x": 0 }).errors).toEqual(["EXTRA_TABLE:public.x"])
    const post = { ...pre, "public.order": 7 }
    expect(lib.compareCounts(pre, post, { ...pre, "public.order": 6 })).toMatchObject({ ok: true, warnings: [] })
    expect(lib.compareCounts(pre, post, { ...pre, "public.order": 9 })).toMatchObject({ ok: true, warnings: ["ROW_COUNT_CHANGED_DURING_DUMP:public.order"] })
    expect(lib.compareCounts({}, {}, {}).errors).toEqual(["EMPTY_BACKUP"])
  })

  it("logy: z chyb zmizí URL, uživatel, heslo i hostitel", () => {
    const url = lib.validateSourceUrl("postgres://ro_user:S3cr%40t-pw@db-123.medusajs.cloud:5432/main")
    const redact = lib.redactor([url])
    const out = redact(`connection to server at "db-123.medusajs.cloud" failed for user "ro_user" pw S3cr@t-pw url ${url}`)
    expect(out).not.toMatch(/db-123|ro_user|S3cr/)
  })

  it("verze PostgreSQL a R2 prostředí", () => {
    expect(lib.pgMajor("pg_dump (PostgreSQL) 16.15 (Homebrew)")).toBe(16)
    expect(lib.pgMajor("pg_dump (PostgreSQL) 17.2")).toBe(17)
    const env = { PATH: "/usr/bin", R2_ACCESS_KEY_ID: "a", R2_SECRET_ACCESS_KEY: "b", R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`, R2_BUCKET: "anastasia-db-backups" }
    const r2 = lib.r2Env(env)
    expect(r2.env).toMatchObject({ AWS_ACCESS_KEY_ID: "a", AWS_REQUEST_CHECKSUM_CALCULATION: "when_required" })
    expect(r2.env).not.toHaveProperty("R2_SECRET_ACCESS_KEY")
    expect(() => lib.r2Env({ ...env, R2_ENDPOINT: "https://evil.example" })).toThrow("R2_ENDPOINT_INVALID")
    expect(() => lib.r2Env({ ...env, R2_BUCKET: "" })).toThrow("R2_BUCKET_REQUIRED")
  })
})
