const helpers: any = require("../db-recovery.cjs")

describe("local database recovery safeguards", () => {
  const originalNodeEnv = process.env.NODE_ENV
  afterEach(() => { process.env.NODE_ENV = originalNodeEnv })

  it("allows only the named local database without URL overrides", () => {
    expect(helpers.validateLocalDatabaseUrl("postgres://localhost/anastasia_dev_wave1").pathname).toBe("/anastasia_dev_wave1")
    expect(helpers.validateLocalDatabaseUrl("postgres://[::1]/anastasia_dev_wave1").pathname).toBe("/anastasia_dev_wave1")
    expect(() => helpers.validateLocalDatabaseUrl("postgres://db.example/anastasia_dev_wave1")).toThrow("LOCAL_DATABASE_REQUIRED")
    expect(() => helpers.validateLocalDatabaseUrl("postgres://localhost/production")).toThrow("LOCAL_DATABASE_REQUIRED")
    expect(() => helpers.validateLocalDatabaseUrl("postgres://localhost/anastasia_dev_wave1?host=remote")).toThrow("LOCAL_DATABASE_REQUIRED")
  })

  it("refuses production mode and missing connection strings", () => {
    process.env.NODE_ENV = "production"
    expect(() => helpers.validateLocalDatabaseUrl("postgres://localhost/anastasia_dev_wave1")).toThrow("PRODUCTION_MODE_FORBIDDEN")
    expect(() => helpers.validateLocalDatabaseUrl(undefined)).toThrow("DATABASE_URL_REQUIRED")
  })

  it("confines generated backup names to private data storage", async () => {
    const file = await helpers.safeBackupPath("anastasia-test.dump")
    expect(file.startsWith(`${helpers.recoveryConstants.BACKUP_DIR}/`)).toBe(true)
    await expect(helpers.safeBackupPath("../../outside.dump")).rejects.toThrow("BACKUP_NAME_INVALID")
  })

  it("requires the explicit confirmation flag", () => {
    expect(helpers.isConfirmed([], "--confirm-empty-local-restore")).toBe(false)
    expect(helpers.isConfirmed(["--confirm-empty-local-restore"], "--confirm-empty-local-restore")).toBe(true)
  })
})
