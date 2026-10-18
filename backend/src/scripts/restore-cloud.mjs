#!/usr/bin/env node
// Obnova zálohy z R2 (backup-cloud.mjs): stažení → kontrola sha256 podle manifestu → dešifrování → obnova do PRÁZDNÉ lokální DB.
// Produkci (Medusa Cloud) touto cestou neobnovujeme: pro Cloud vznikne ověřený dump (--decrypt-only), který se nahraje
// v Cloud dashboardu (Database → Import dump). Postup: docs/launch/DEPLOY-RUNBOOK-2026-10-23.md §4–5.
//
// Použití:
//   node restore-cloud.mjs --key=daily/2026/10/anastasia-…dump.gpg    (stáhne z R2; potřebuje R2_* env)
//   node restore-cloud.mjs --file=/cesta/anastasia-…dump.gpg            (manifest vedle souboru: <file>.json)
//   + --decrypt-only     jen ověřený .dump do backend/data-private/backups (pro import do Cloudu)
//   + --confirm-empty-local-restore   skutečná obnova do RESTORE_DATABASE_URL (jinak dry run)
// Env: BACKUP_GPG_PRIVATE_KEY_FILE, volitelně BACKUP_GPG_PASSPHRASE_FILE, RESTORE_DATABASE_URL (lokální, prázdná).
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import lib from "./db-backup-cloud.cjs"

const { validateLocalTargetUrl, validateObjectKey, TABLE_COUNTS_SQL, redactor, run, psqlJson, sha256File, r2Env } = lib
const BACKUP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data-private/backups")

function arg(args, name) {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

export async function runRestore(args = [], env = process.env) {
  const key = arg(args, "key"), file = arg(args, "file")
  if (!key === !file) throw new Error("PASS_EXACTLY_ONE_OF_--key_OR_--file")
  const decryptOnly = args.includes("--decrypt-only")
  const confirmed = args.includes("--confirm-empty-local-restore")
  const target = decryptOnly ? null : validateLocalTargetUrl(env.RESTORE_DATABASE_URL)
  const privateKey = env.BACKUP_GPG_PRIVATE_KEY_FILE
  if (!privateKey) throw new Error("BACKUP_GPG_PRIVATE_KEY_FILE_REQUIRED")
  const redact = redactor([target])

  const work = await mkdtemp(path.join(os.tmpdir(), "anastasia-restore-"))
  await chmod(work, 0o700)
  try {
    let cipher, manifestFile
    if (key) {
      validateObjectKey(key)
      const r2 = r2Env(env)
      cipher = path.join(work, path.basename(key))
      manifestFile = `${cipher}.json`
      for (const [k, f] of [[key, cipher], [`${key}.json`, manifestFile]])
        await run("aws", ["s3", "cp", `s3://${r2.bucket}/${k}`, f, "--endpoint-url", r2.endpoint, "--only-show-errors", "--no-progress"], { env: r2.env, stage: "DOWNLOAD" })
    } else {
      cipher = path.resolve(file)
      manifestFile = `${cipher}.json`
    }
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
    if (manifest.format !== "anastasia-db-backup/1") throw new Error("MANIFEST_FORMAT_UNKNOWN")
    if ((await sha256File(cipher)) !== manifest.encrypted.sha256) throw new Error("ENCRYPTED_SHA256_MISMATCH: soubor je poškozený nebo podvržený")

    const gnupg = path.join(work, "gnupg")
    await mkdir(gnupg, { mode: 0o700 })
    const gpg = ["--homedir", gnupg, "--batch", "--yes", "--no-tty", "--quiet"]
    const pass = env.BACKUP_GPG_PASSPHRASE_FILE ? ["--pinentry-mode", "loopback", "--passphrase-file", env.BACKUP_GPG_PASSPHRASE_FILE] : []
    await run("gpg", [...gpg, ...pass, "--import", privateKey], { stage: "GPG_IMPORT_KEY" })
    const plain = path.join(work, path.basename(cipher).replace(/\.gpg$/, ""))
    await run("gpg", [...gpg, ...pass, "--output", plain, "--decrypt", cipher], { stage: "DECRYPT" })
    await chmod(plain, 0o600)
    if ((await sha256File(plain)) !== manifest.dump.sha256) throw new Error("DUMP_SHA256_MISMATCH")
    await run("pg_restore", ["--list", plain], { stage: "PG_RESTORE_LIST" })

    if (decryptOnly) {
      await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 })
      const out = path.join(BACKUP_DIR, path.basename(plain))
      await copyFile(plain, out)
      await chmod(out, 0o600)
      console.log(JSON.stringify({ status: "DUMP_READY", file: out, bytes: (await stat(out)).size, sha256: manifest.dump.sha256, created_at: manifest.created_at }))
      return
    }

    const tables = await psqlJson(target, "SELECT json_build_object('n', count(*)) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')", { redact, stage: "RESTORE_TARGET_CHECK" })
    if (Number(tables.n) !== 0) throw new Error("RESTORE_TARGET_NOT_EMPTY; obnova odmítnuta bez změny databáze")
    if (!confirmed) {
      console.log(JSON.stringify({ status: "DRY_RUN_OK", note: "archiv ověřen, cíl je prázdný; pro obnovu přidej --confirm-empty-local-restore", created_at: manifest.created_at }))
      return
    }
    await run("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", target.toString(), plain], { redact, stage: "RESTORE" })
    const restored = await psqlJson(target, TABLE_COUNTS_SQL, { redact, stage: "COUNT_RESTORED" })
    const expected = manifest.row_counts ?? {}
    const mismatch = Object.keys(expected).filter((t) => Number(restored[t]) !== Number(expected[t]))
    const extra = Object.keys(restored).filter((t) => !(t in expected))
    if (mismatch.length || extra.length) throw new Error(`RESTORE_MISMATCH: ${[...mismatch, ...extra].slice(0, 10).join(", ")}`)
    console.log(JSON.stringify({ status: "RESTORE_COMPLETED", target: target.pathname.slice(1), tables: Object.keys(restored).length, created_at: manifest.created_at }))
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRestore(process.argv.slice(2)).catch((error) => { console.error(String(error.message)); process.exitCode = 1 })
}
