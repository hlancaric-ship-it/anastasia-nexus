// Produkční záloha PostgreSQL z Medusa Cloud → šifrovaně do R2 (A-17, rozhodnutí 12. 10. 2026).
// Pomocné funkce bez vedlejších efektů kromě spouštění klientů PostgreSQL / gpg / aws; logika je pokrytá unit testy.
const { spawn } = require("node:child_process")
const { createHash } = require("node:crypto")
const { createReadStream } = require("node:fs")

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"]
const INSECURE_SSLMODES = ["disable", "allow", "prefer"]
const OBJECT_NAME = /^anastasia-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump\.gpg$/

function parsePostgresUrl(value, label) {
  if (!value) throw new Error(`${label}_REQUIRED`)
  let url
  try { url = new URL(value) } catch { throw new Error(`${label}_INVALID`) }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error(`${label}_INVALID`)
  // `host=`/`hostaddr=` v query by přesměrovaly spojení mimo hostname, který kontrolujeme.
  for (const key of url.searchParams.keys()) if (["host", "hostaddr", "service", "passfile"].includes(key.toLowerCase())) throw new Error(`${label}_INVALID`)
  if (url.hash || !url.hostname || url.pathname.length < 2) throw new Error(`${label}_INVALID`)
  return url
}

function isLocalHost(url) {
  return LOCAL_HOSTS.includes(url.hostname)
}

/** Zdroj zálohy: vzdálená DB jen přes TLS; lokální jen výslovně pro self-test. */
function validateSourceUrl(value, { allowLocal = false } = {}) {
  const url = parsePostgresUrl(value, "BACKUP_DATABASE_URL")
  if (isLocalHost(url)) {
    if (!allowLocal) throw new Error("BACKUP_SOURCE_LOCAL_FORBIDDEN")
    return url
  }
  const mode = url.searchParams.get("sslmode")
  if (mode && INSECURE_SSLMODES.includes(mode.toLowerCase())) throw new Error("BACKUP_SOURCE_TLS_REQUIRED")
  if (!mode) url.searchParams.set("sslmode", "require")
  return url
}

/** Cíl zkušební / skutečné obnovy: vždy jen lokální (nebo služba runneru na localhost). */
function validateLocalTargetUrl(value, label = "RESTORE_DATABASE_URL") {
  const url = parsePostgresUrl(value, label)
  if (!isLocalHost(url)) throw new Error(`${label}_MUST_BE_LOCAL`)
  if (process.env.NODE_ENV === "production") throw new Error("PRODUCTION_MODE_FORBIDDEN")
  return url
}

function backupStamp(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-")
}

/** Klíče objektů v dedikovaném bucketu; 1. den v měsíci (UTC) navíc měsíční kopie. */
function objectKeys(now = new Date()) {
  const stamp = backupStamp(now)
  const yyyy = stamp.slice(0, 4), mm = stamp.slice(5, 7)
  const name = `anastasia-${stamp}.dump.gpg`
  const keys = [`daily/${yyyy}/${mm}/${name}`]
  if (now.getUTCDate() === 1) keys.push(`monthly/${yyyy}/${name}`)
  return { name, keys }
}

function validateObjectKey(key) {
  if (typeof key !== "string") throw new Error("BACKUP_KEY_INVALID")
  const m = /^(daily\/\d{4}\/\d{2}|monthly\/\d{4}|selftest)\/([^/]+)$/.exec(key)
  if (!m || !OBJECT_NAME.test(m[2])) throw new Error("BACKUP_KEY_INVALID")
  return key
}

// Účet zálohy nesmí umět zapisovat. Přijatelné je: žádná zápisová práva ani vlastnictví tabulek,
// nebo fyzicky read-only replika (pg_is_in_recovery). `default_transaction_read_only` samo nestačí, jde vypnout v session.
const READ_ONLY_CHECK_SQL = `SELECT json_build_object(
 'elevated', (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname = current_user),
 'writable', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')
   AND (pg_has_role(c.relowner, 'USAGE') OR has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE')
        OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE'))),
 'in_recovery', pg_is_in_recovery(),
 'server_version_num', current_setting('server_version_num')::int
)`

function evaluateReadOnly(row) {
  if (!row || typeof row !== "object") throw new Error("READ_ONLY_CHECK_FAILED")
  if (row.elevated !== false) return { ok: false, reason: "ROLE_ELEVATED" }
  if (Number(row.writable) === 0) return { ok: true, reason: "NO_WRITE_PRIVILEGES" }
  if (row.in_recovery === true) return { ok: true, reason: "READ_ONLY_REPLICA" }
  return { ok: false, reason: "WRITE_PRIVILEGES_PRESENT" }
}

// Počty řádků všech tabulek mimo systémová schémata v jednom read-only snapshotu.
const TABLE_COUNTS_SQL = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT coalesce(json_object_agg(t.name, t.n ORDER BY t.name), '{}'::json) FROM (
 SELECT format('%s.%s', n.nspname, c.relname) AS name,
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS n
 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND c.relkind IN ('r','p') AND NOT c.relispartition) t;
COMMIT;`

/**
 * Porovná obnovenou DB se zdrojem. `pre`/`post` = počty těsně před a po dumpu.
 * Tabulka beze změny během dumpu musí sedět přesně; změněná musí ležet mezi pre a post
 * (jinak jen varování – tabulka se během dumpu měnila oběma směry, např. košíky).
 */
function compareCounts(pre, post, restored) {
  const errors = [], warnings = []
  const source = Object.keys(pre).sort(), target = Object.keys(restored).sort()
  for (const t of source) if (!(t in restored)) errors.push(`MISSING_TABLE:${t}`)
  for (const t of target) if (!(t in pre)) errors.push(`EXTRA_TABLE:${t}`)
  for (const t of source) {
    if (!(t in restored)) continue
    const a = Number(pre[t]), b = Number(post[t] ?? pre[t]), r = Number(restored[t])
    if (a === b) { if (r !== a) errors.push(`ROW_COUNT:${t}`) }
    else if (r < Math.min(a, b) || r > Math.max(a, b)) warnings.push(`ROW_COUNT_CHANGED_DURING_DUMP:${t}`)
  }
  const rows = Object.values(restored).reduce((s, n) => s + Number(n), 0)
  if (!source.length || rows === 0) errors.push("EMPTY_BACKUP")
  return { ok: errors.length === 0, errors, warnings, tables: target.length, rows }
}

function pgMajor(versionText) {
  const m = /\b(\d{2,})(?:\.\d+)?/.exec(String(versionText))
  if (!m) throw new Error("PG_VERSION_UNKNOWN")
  return Number(m[1])
}

/** Odstraní z textu chyby URL, uživatele, heslo i hostitele (logy veřejného repa). */
function redactor(urls) {
  const secrets = []
  for (const u of urls.filter(Boolean)) {
    secrets.push(u.toString())
    if (u.password) secrets.push(decodeURIComponent(u.password), u.password)
    if (u.username) secrets.push(decodeURIComponent(u.username), u.username)
    if (u.hostname && !isLocalHost(u)) secrets.push(u.hostname)
  }
  const sorted = [...new Set(secrets.filter((s) => s && s.length >= 3))].sort((a, b) => b.length - a.length)
  return (text) => sorted.reduce((t, s) => t.split(s).join("***"), String(text))
}

function run(command, args, { env = process.env, stdout = "pipe", redact = (t) => t, stage = command } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", stdout, "pipe"] })
    let out = "", err = ""
    child.stdout?.setEncoding("utf8").on("data", (c) => { out += c })
    child.stderr.setEncoding("utf8").on("data", (c) => { if (err.length < 8000) err += c })
    child.once("error", () => reject(new Error(`${stage}_FAILED: ${command} není dostupný`)))
    child.once("exit", (code) => code === 0 ? resolve(out) : reject(new Error(`${stage}_FAILED (exit ${code}): ${redact(err).trim().split("\n").slice(-6).join(" | ")}`)))
  })
}

async function psqlJson(url, sql, opts = {}) {
  const out = await run("psql", ["--no-psqlrc", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "--dbname", url.toString(), "-c", sql], opts)
  const line = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).pop()
  if (!line) throw new Error(`${opts.stage ?? "PSQL"}_FAILED: prázdná odpověď`)
  return JSON.parse(line)
}

async function sha256File(file) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}

/** Prostředí pro aws CLI proti R2 (S3 API). */
function r2Env(env = process.env) {
  for (const k of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET"]) if (!env[k]) throw new Error(`${k}_REQUIRED`)
  if (!/^https:\/\/[a-f0-9]{32}\.(eu\.)?r2\.cloudflarestorage\.com\/?$/.test(env.R2_ENDPOINT)) throw new Error("R2_ENDPOINT_INVALID")
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET)) throw new Error("R2_BUCKET_INVALID")
  return {
    env: {
      PATH: env.PATH, HOME: env.HOME,
      AWS_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      AWS_DEFAULT_REGION: "auto", AWS_EC2_METADATA_DISABLED: "true", AWS_PAGER: "",
      // R2 nepodporuje nové výchozí checksumy aws-cli ≥ 2.23.
      AWS_REQUEST_CHECKSUM_CALCULATION: "when_required", AWS_RESPONSE_CHECKSUM_VALIDATION: "when_required",
    },
    endpoint: env.R2_ENDPOINT.replace(/\/$/, ""),
    bucket: env.R2_BUCKET,
  }
}

module.exports = {
  validateSourceUrl, validateLocalTargetUrl, objectKeys, validateObjectKey, backupStamp,
  READ_ONLY_CHECK_SQL, evaluateReadOnly, TABLE_COUNTS_SQL, compareCounts, pgMajor,
  redactor, run, psqlJson, sha256File, r2Env,
}
