#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { unlink, stat } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import recovery from "./db-recovery.cjs"

const { createExclusiveBackupFile, safeBackupPath, sha256, validateLocalDatabaseUrl } = recovery

function runPgDump(databaseUrl, outputFd) {
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--dbname", databaseUrl], { env: process.env, stdio: ["ignore", outputFd, "ignore"] })
    child.once("error", () => reject(new Error("PG_DUMP_FAILED")))
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("PG_DUMP_FAILED")))
  })
}

async function main(args) {
  const url = validateLocalDatabaseUrl(process.env.DATABASE_URL)
  const nameArg = args.find((arg) => arg.startsWith("--name="))?.slice("--name=".length)
  const destination = await safeBackupPath(nameArg)
  if (!args.includes("--confirm-local-backup")) {
    console.log(`DRY RUN: pg_dump custom-format lokální DB ${url.pathname.slice(1)} → ${destination}`)
    console.log("Pro zápis spusť znovu s --confirm-local-backup. Výstup může obsahovat osobní údaje; zůstane v gitignored data-private/.")
    return
  }

  const file = await createExclusiveBackupFile(destination)
  try {
    await runPgDump(url.toString(), file.fd)
    await file.close()
    const bytes = await stat(destination)
    const chunks = []
    for await (const chunk of createReadStream(destination)) chunks.push(chunk)
    console.log(JSON.stringify({ status: "BACKUP_CREATED", file: destination, bytes: bytes.size, sha256: sha256(Buffer.concat(chunks)) }))
  } catch {
    await file.close().catch(() => undefined)
    await unlink(destination).catch(() => undefined)
    throw new Error("BACKUP_FAILED; details withheld to avoid leaking connection data")
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1 })
}

export { main as runBackup }
