#!/usr/bin/env node
import { spawn } from "node:child_process"
import recovery from "./db-recovery.cjs"
import { pathToFileURL } from "node:url"

const { assertPrivateRegularFile, isConfirmed, validateLocalDatabaseUrl } = recovery

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "ignore"] })
    let stdout = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.once("error", () => reject(new Error("RESTORE_PREFLIGHT_FAILED")))
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error("RESTORE_PREFLIGHT_FAILED")))
  })
}

async function main(args) {
  const url = validateLocalDatabaseUrl(process.env.DATABASE_URL)
  const backupArg = args.find((arg) => arg.startsWith("--file="))?.slice("--file=".length)
  if (!backupArg) throw new Error("BACKUP_FILE_REQUIRED")
  const backup = await assertPrivateRegularFile(backupArg)
  const dryRun = !isConfirmed(args, "--confirm-empty-local-restore")

  // Confirm this is a readable custom-format archive before checking/altering target.
  await run("pg_restore", ["--list", backup])
  const tableCount = Number((await run("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--dbname", url.toString(), "--command", "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')"])).trim())
  if (!Number.isInteger(tableCount)) throw new Error("RESTORE_PREFLIGHT_FAILED")
  if (tableCount !== 0) throw new Error("RESTORE_TARGET_NOT_EMPTY; restore refused without changing the database")
  if (dryRun) {
    console.log(`DRY RUN: archiv je čitelný a lokální DB ${url.pathname.slice(1)} nemá uživatelské tabulky.`)
    console.log("Pro obnovu spusť znovu s --confirm-empty-local-restore. Obnova je povolena jen do prázdné DB anastasia_dev_wave1.")
    return
  }

  await run("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", url.toString(), backup])
  console.log(JSON.stringify({ status: "RESTORE_COMPLETED", target: url.pathname.slice(1), backup }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}

export { main as runRestore }
