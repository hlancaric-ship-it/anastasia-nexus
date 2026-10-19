#!/usr/bin/env node
// Denní záloha produkční DB (Medusa Cloud, read-only connection string) → ověřená obnova → šifrování gpg → R2.
// Spouští .github/workflows/db-backup.yml; postup a obnova: docs/launch/DEPLOY-RUNBOOK-2026-10-23.md §4.
//
// Env: BACKUP_DATABASE_URL (read-only), RESTORE_TEST_DATABASE_URL (prázdná lokální DB pro zkušební obnovu),
//      BACKUP_GPG_PUBLIC_KEY_FILE, při --upload R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET.
// Výstup na stdout je jeden JSON řádek bez osobních údajů a bez údajů o připojení (logy veřejného repa).
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { openSync, closeSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import lib from "./db-backup-cloud.cjs"

const { validateSourceUrl, validateLocalTargetUrl, objectKeys, READ_ONLY_CHECK_SQL, evaluateReadOnly, TABLE_COUNTS_SQL,
  compareCounts, pgMajor, redactor, run, psqlJson, sha256File, r2Env } = lib

function arg(args, name) {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

async function upload(file, key, r2, redact) {
  const target = `s3://${r2.bucket}/${key}`
  await run("aws", ["s3", "cp", file, target, "--endpoint-url", r2.endpoint, "--only-show-errors", "--no-progress"], { env: r2.env, redact, stage: "UPLOAD" })
  const head = JSON.parse(await run("aws", ["s3api", "head-object", "--bucket", r2.bucket, "--key", key, "--endpoint-url", r2.endpoint, "--output", "json"], { env: r2.env, redact, stage: "UPLOAD_VERIFY" }))
  const size = (await stat(file)).size
  if (Number(head.ContentLength) !== size) throw new Error("UPLOAD_VERIFY_FAILED: velikost objektu nesedí")
  return size
}

export async function runBackup(args = [], env = process.env) {
  const allowLocal = args.includes("--allow-local-source")
  const source = validateSourceUrl(env.BACKUP_DATABASE_URL, { allowLocal })
  const target = validateLocalTargetUrl(env.RESTORE_TEST_DATABASE_URL, "RESTORE_TEST_DATABASE_URL")
  const publicKey = env.BACKUP_GPG_PUBLIC_KEY_FILE
  if (!publicKey) throw new Error("BACKUP_GPG_PUBLIC_KEY_FILE_REQUIRED")
  const doUpload = args.includes("--upload")
  const r2 = doUpload ? r2Env(env) : null
  const prefixOverride = arg(args, "prefix")
  if (prefixOverride && prefixOverride !== "selftest") throw new Error("BACKUP_PREFIX_INVALID")
  const redact = redactor([source, target])
  const pgEnv = { ...env, PGCONNECT_TIMEOUT: "20", PGAPPNAME: "anastasia-backup" }
  const now = new Date()

  // 1. Účet zálohy nesmí umět zapisovat do produkce.
  const ro = await psqlJson(source, READ_ONLY_CHECK_SQL, { env: pgEnv, redact, stage: "READ_ONLY_CHECK" })
  const verdict = evaluateReadOnly(ro)
  if (!verdict.ok) throw new Error(`BACKUP_ROLE_NOT_READ_ONLY: ${verdict.reason}`)

  // 2. pg_dump nesmí být starší než server (jinak dump odmítne nebo bude neúplný).
  const serverMajor = Math.floor(Number(ro.server_version_num) / 10000)
  const dumpMajor = pgMajor(await run("pg_dump", ["--version"], { stage: "PG_DUMP_VERSION" }))
  if (dumpMajor < serverMajor) throw new Error(`PG_DUMP_TOO_OLD: klient ${dumpMajor}, server ${serverMajor}`)

  // 3. Zkušební cíl musí být prázdný – obnova se nikdy nemíchá s jinými daty.
  const targetTables = await psqlJson(target, "SELECT json_build_object('n', count(*)) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')", { env: pgEnv, redact, stage: "RESTORE_TARGET_CHECK" })
  if (Number(targetTables.n) !== 0) throw new Error("RESTORE_TEST_TARGET_NOT_EMPTY")

  const work = await mkdtemp(path.join(env.RUNNER_TEMP || os.tmpdir(), "anastasia-backup-"))
  await chmod(work, 0o700)
  const { name, keys } = objectKeys(now)
  const plain = path.join(work, name.replace(/\.gpg$/, ""))
  const cipher = path.join(work, name)
  try {
    // 4. Konzistentní dump (jeden snapshot pg_dump) + počty řádků těsně před a po.
    const pre = await psqlJson(source, TABLE_COUNTS_SQL, { env: pgEnv, redact, stage: "COUNT_SOURCE" })
    const fd = openSync(plain, "wx", 0o600)
    try {
      await run("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-acl", "--dbname", source.toString()],
        { env: pgEnv, stdout: fd, redact, stage: "PG_DUMP" })
    } finally { closeSync(fd) }
    const post = await psqlJson(source, TABLE_COUNTS_SQL, { env: pgEnv, redact, stage: "COUNT_SOURCE" })

    // 5. Obnovitelnost: archiv je čitelný a celý se obnoví do prázdné DB v jedné transakci.
    await run("pg_restore", ["--list", plain], { stage: "PG_RESTORE_LIST" })
    await run("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", target.toString(), plain],
      { env: pgEnv, redact, stage: "RESTORE_TEST" })
    const restored = await psqlJson(target, TABLE_COUNTS_SQL, { env: pgEnv, redact, stage: "COUNT_RESTORED" })
    const check = compareCounts(pre, post, restored)
    if (!check.ok) throw new Error(`RESTORE_TEST_MISMATCH: ${check.errors.slice(0, 10).join(", ")}`)

    // 6. Šifrování veřejným klíčem; soukromý klíč v CI není. Nešifrovaný dump se hned maže.
    const plainSha = await sha256File(plain)
    const gnupg = path.join(work, "gnupg")
    await mkdir(gnupg, { mode: 0o700 })
    await run("gpg", ["--homedir", gnupg, "--batch", "--yes", "--no-tty", "--quiet", "--trust-model", "always",
      "--recipient-file", publicKey, "--compress-algo", "none", "--output", cipher, "--encrypt", plain], { stage: "ENCRYPT" })
    await rm(plain, { force: true })
    const cipherSha = await sha256File(cipher)
    const bytes = (await stat(cipher)).size

    // Manifest bez osobních údajů: kontrolní součty, počty řádků, verze. Obnova ho používá k ověření.
    const manifest = {
      format: "anastasia-db-backup/1", created_at: now.toISOString(), object: name,
      encrypted: { bytes, sha256: cipherSha, gpg_recipient_file: path.basename(publicKey) },
      dump: { format: "pg_dump custom", sha256: plainSha, pg_dump_major: dumpMajor, server_major: serverMajor },
      source_role: verdict.reason, restore_test: { status: "PASS", tables: check.tables, rows: check.rows, warnings: check.warnings },
      row_counts: restored,
    }
    const manifestFile = `${cipher}.json`
    await writeFile(manifestFile, JSON.stringify(manifest, null, 1), { mode: 0o600 })

    const uploaded = []
    if (doUpload) {
      const targetKeys = prefixOverride ? [`selftest/${name}`] : keys
      for (const key of targetKeys) {
        await upload(cipher, key, r2, redact)
        await upload(manifestFile, `${key}.json`, r2, redact)
        uploaded.push(key)
      }
    }
    const result = { status: "BACKUP_OK", object: name, bytes, sha256: cipherSha, restore_test: "PASS", tables: check.tables,
      warnings: check.warnings.length, uploaded }
    if (args.includes("--keep-local")) result.local_file = cipher
    console.log(JSON.stringify(result))
    return result
  } finally {
    await rm(plain, { force: true }).catch(() => undefined)
    if (!args.includes("--keep-local")) await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup(process.argv.slice(2)).catch((error) => { console.error(String(error.message)); process.exitCode = 1 })
}
