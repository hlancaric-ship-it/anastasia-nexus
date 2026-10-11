const { createHash } = require("node:crypto")
const { lstat, mkdir, open, realpath } = require("node:fs/promises")
const path = require("node:path")

const BACKUP_DIR = path.resolve(__dirname, "../../data-private/backups")
const LOCAL_DB = "anastasia_dev_wave1"

function validateLocalDatabaseUrl(value) {
  if (!value) throw new Error("DATABASE_URL_REQUIRED")
  let url
  try { url = new URL(value) } catch { throw new Error("DATABASE_URL_INVALID") }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("LOCAL_DATABASE_REQUIRED")
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("LOCAL_DATABASE_REQUIRED")
  if (url.pathname !== `/${LOCAL_DB}` || url.search || url.hash) throw new Error("LOCAL_DATABASE_REQUIRED")
  if (process.env.NODE_ENV === "production") throw new Error("PRODUCTION_MODE_FORBIDDEN")
  return url
}

async function safeBackupPath(name, now = new Date()) {
  const basename = name ?? `anastasia-${now.toISOString().replaceAll(":", "-")}.dump`
  if (!/^anastasia-[a-zA-Z0-9T._-]+\.dump$/.test(basename)) throw new Error("BACKUP_NAME_INVALID")
  await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 })
  const directory = await realpath(BACKUP_DIR)
  const destination = path.join(directory, basename)
  if (!destination.startsWith(`${directory}${path.sep}`)) throw new Error("BACKUP_PATH_INVALID")
  return destination
}

async function assertPrivateRegularFile(filePath) {
  const resolved = path.resolve(filePath)
  const directory = await realpath(BACKUP_DIR)
  if (!resolved.startsWith(`${directory}${path.sep}`)) throw new Error("BACKUP_PATH_INVALID")
  const info = await lstat(resolved)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("BACKUP_FILE_INVALID")
  if ((info.mode & 0o077) !== 0) throw new Error("BACKUP_PERMISSIONS_INVALID")
  return resolved
}

async function createExclusiveBackupFile(filePath) {
  return open(filePath, "wx", 0o600)
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

function isConfirmed(args, expected) {
  return args.includes(expected)
}

module.exports = { validateLocalDatabaseUrl, safeBackupPath, assertPrivateRegularFile, createExclusiveBackupFile, sha256, isConfirmed, recoveryConstants: { BACKUP_DIR, LOCAL_DB } }
