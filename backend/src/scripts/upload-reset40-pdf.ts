import type { ExecArgs } from "@medusajs/framework/types"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { parse } from "csv-parse/sync"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { headProtectedObject, protectedStorageClient, protectedStorageFromEnv } from "../lib/protected-library/storage"

const MAP_PATHS = [
  resolve(process.cwd(), "data-private/reset40-pdf-map.tsv"),
  resolve(process.cwd(), "backend/data-private/reset40-pdf-map.tsv"),
]

type PdfRecord = { week: number; type: string; oldPath: string }

function readPdfMap(): PdfRecord[] {
  const path = MAP_PATHS.find(existsSync)
  if (!path) throw new Error("RESET 40+ PDF map not found")
  const rows = parse(readFileSync(path, "utf8"), {
    delimiter: "\t",
    columns: ["week", "type", "oldPath"],
    skip_empty_lines: true,
    cast: (value, context) => context.column === "week" ? Number.parseInt(value, 10) : value,
  }) as PdfRecord[]
  if (!rows.length) throw new Error("RESET 40+ PDF map is empty")
  for (const row of rows) {
    if (!Number.isInteger(row.week) || row.week < 1 || row.week > 16 || !/^[a-z][a-z0-9-]*$/.test(row.type))
      throw new Error("Invalid RESET 40+ PDF map row")
    if (!/^\/media\/[a-z0-9]+\/[a-z0-9_.-]+\.pdf$/i.test(row.oldPath))
      throw new Error("Invalid legacy PDF path in map")
  }
  return rows
}

function keyFor(record: PdfRecord): string {
  return `reset-40-plus/tyzden-${String(record.week).padStart(2, "0")}/${record.type}.pdf`
}

function fetchPdf(path: string): Buffer {
  const url = `https://anastasiaoz.eu${path}`
  const data = execFileSync("curl", ["-k", "--fail", "--location", "--silent", "--show-error", "--max-time", "90", url], {
    encoding: "buffer",
    maxBuffer: 220 * 1024 * 1024,
  }) as Buffer
  if (data.length < 5 || data.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error("Legacy URL did not return a PDF")
  return data
}

/** Uploads only mapped RESET 40+ PDFs to the private protected-media bucket; dry-run is default. */
export default async function uploadReset40Pdf(_args: ExecArgs) {
  const rows = readPdfMap()
  const storage = protectedStorageFromEnv()
  if (!storage) throw new Error("Protected R2 storage is not configured")
  const client = protectedStorageClient(storage)
  const apply = process.env.PROTECTED_PDF_UPLOAD_APPLY === "1"
  let uploaded = 0
  let alreadyPresent = 0

  for (const row of rows) {
    const key = keyFor(row)
    const existing = await headProtectedObject(storage, key)
    if (existing) {
      if (existing.size <= 0 || existing.contentType !== "application/pdf")
        throw new Error(`Existing protected object is not a valid PDF: ${key}`)
      alreadyPresent++
      continue
    }
    if (!apply) continue
    const body = fetchPdf(row.oldPath)
    await client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: "application/pdf" }))
    const saved = await headProtectedObject(storage, key)
    if (!saved || saved.size !== body.length || saved.contentType !== "application/pdf")
      throw new Error(`Protected PDF upload verification failed: ${key}`)
    uploaded++
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", mapped: rows.length, uploaded, alreadyPresent, planned: apply ? 0 : rows.length - alreadyPresent }))
}
