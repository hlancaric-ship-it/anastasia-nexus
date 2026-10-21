import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * Súkromné úložiisko chránených médií (R2 cez S3 API).
 *
 * Bucket, účet aj kľúče sú IBA z konfigurácie servera (`PROTECTED_R2_*`),
 * pretože úložiisko sa presúva na účet klientky. V kóde nie je natvrdo
 * žiadny názov bucketu ani účtu a klient nedostane nič iné než krátkodobý
 * presigned URL na konkrétny kľúč.
 */

export type ProtectedStorage = {
  /** S3-kompatibilný endpoint, napr. https://<ucet>.r2.cloudflarestorage.com */
  endpoint: string
  /** Názov súkromného bucketu. */
  bucket: string
  /** R2 používa "auto"; iný S3 provider vlastný región. */
  region: string
  accessKeyId: string
  secretAccessKey: string
}

/** Ako dlho je presigned URL platný (nahrávanie veľkého videa musí stihnúť). */
export const PROTECTED_UPLOAD_URL_TTL_SECONDS = 60 * 30

/**
 * Prečíta konfiguráciu úložiiska. Vráti null, ak nie je úplná – endpoint
 * potom odmietne nahrávanie s 503 a neuhádne žiadne údaje.
 */
export function protectedStorageFromEnv(env: NodeJS.ProcessEnv = process.env): ProtectedStorage | null {
  const endpoint = String(env.PROTECTED_R2_ENDPOINT ?? "").trim().replace(/\/+$/, "")
  const bucket = String(env.PROTECTED_R2_BUCKET ?? "").trim()
  const accessKeyId = String(env.PROTECTED_R2_ACCESS_KEY_ID ?? "").trim()
  const secretAccessKey = String(env.PROTECTED_R2_SECRET_ACCESS_KEY ?? "").trim()
  const region = String(env.PROTECTED_R2_REGION ?? "").trim() || "auto"
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  let url: URL
  try { url = new URL(endpoint) } catch { return null }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucket)) return null
  return { endpoint, bucket, region, accessKeyId, secretAccessKey }
}

/** Klient S3 pre R2 (path-style, aby sa nestavovala vlastná subdoména bucketu). */
export function protectedStorageClient(storage: ProtectedStorage): S3Client {
  return new S3Client({
    region: storage.region,
    endpoint: storage.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
  })
}

export type ProtectedUploadTarget = {
  /** Presigned URL na presný kľúč – bez iných práv. */
  url: string
  /** HTTP metóda nahrávania. */
  method: "PUT"
  /** Hlavičky, ktoré musí klient poslať presne takto. */
  headers: Record<string, string>
  /** Kedy URL prestane platiť. */
  expiresAt: string
  /** Kľúč objektu v bucketu. */
  key: string
}

/**
 * Vyrobí presigned PUT URL na konkrétny kľúč. URL platí len na PUT,
 * len na ten jeden objekt a len do uplynutia platnosti.
 */
export async function createProtectedUploadUrl(
  storage: ProtectedStorage,
  params: { key: string; contentType: string; expiresInSeconds?: number },
): Promise<ProtectedUploadTarget> {
  const expiresIn = Math.min(Math.max(params.expiresInSeconds ?? PROTECTED_UPLOAD_URL_TTL_SECONDS, 60), 3600)
  const client = protectedStorageClient(storage)
  const command = new PutObjectCommand({
    Bucket: storage.bucket,
    Key: params.key,
    ContentType: params.contentType,
  })
  const url = await getSignedUrl(client, command, { expiresIn })
  return {
    url,
    method: "PUT",
    headers: { "content-type": params.contentType },
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    key: params.key,
  }
}

export type ProtectedObjectInfo = {
  size: number
  contentType: string | null
}

function isNotFound(error: unknown): boolean {
  const meta = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
  if (meta?.httpStatusCode === 404) return true
  const name = (error as { name?: string })?.name
  return name === "NotFound" || name === "NoSuchKey" || name === "NoSuchBucket"
}

/**
 * Overí, že objekt v bucketu existuje a zistí jeho veľkosť.
 * Vráti null, keď objekt neexistuje; iné chyby nepreveruje ticho.
 */
export async function headProtectedObject(storage: ProtectedStorage, key: string): Promise<ProtectedObjectInfo | null> {
  const client = protectedStorageClient(storage)
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }))
    return { size: Number(result.ContentLength ?? 0), contentType: result.ContentType ?? null }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}
