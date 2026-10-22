import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { CHAT_MODULE, ChatPolicyError, type ChatMessageEvent } from "../modules/chat"
import ChatModuleService, { ConversationNotFoundError } from "../modules/chat/service"

export function chatService(req: AuthenticatedMedusaRequest): ChatModuleService {
  return req.scope.resolve(CHAT_MODULE) as ChatModuleService
}

export function requireActor(req: AuthenticatedMedusaRequest, res: MedusaResponse, actor: "customer" | "user"): string | null {
  const id = req.auth_context?.actor_type === actor ? req.auth_context.actor_id : undefined
  if (!id) res.status(401).json({ type: "unauthorized", message: "Přihlášení je povinné" })
  return id ?? null
}

const id = z.string().trim().min(1).max(64)

/** Těla požadavků: jen známá pole. Cokoli navíc (např. přílohy, HTML) se odmítne. */
export const customerNewConversationSchema = z.object({
  body: z.unknown(),
  subject: z.unknown().optional(),
  order_id: id.optional(),
  booking_id: id.optional(),
}).strict()
export const messageSchema = z.object({ body: z.unknown() }).strict()
/** Nová zpráva od administrace: zákazník, text a voliteľný popis (téma konverzace). */
export const adminNewMessageSchema = z.object({
  customer_id: id,
  body: z.unknown(),
  subject: z.string().trim().max(120).optional(),
}).strict()
export const conversationActionSchema = z.object({ action: z.enum(["close", "reopen", "mute", "unmute"]) }).strict()
export const blockSchema = z.object({ blocked: z.boolean(), reason: z.string().trim().max(300).optional() }).strict()

export function parseBody<T>(schema: z.ZodType<T>, req: AuthenticatedMedusaRequest, res: MedusaResponse): T | null {
  const parsed = schema.safeParse(req.body ?? {})
  if (parsed.success) return parsed.data
  const unknownKeys = parsed.error.issues.some((i) => i.code === "unrecognized_keys")
  res.status(400).json({
    type: "invalid_data",
    message: unknownKeys ? "Zpráva může obsahovat jen text (přílohy ani jiná pole nejsou podporovány)." : "Neplatná data požadavku.",
  })
  return null
}

export async function emitChatEvent(req: AuthenticatedMedusaRequest, name: string, data: ChatMessageEvent) {
  try {
    await req.scope.resolve(Modules.EVENT_BUS).emit({ name, data })
  } catch (error) {
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`[chat] emit ${name} selhal`, error as Error)
  }
}

/** Převod chyb chatu na HTTP: pravidla → 4xx s kódem, zámek → 503 (zkusit znovu), ostatní → 500 bez detailů. */
export function sendChatError(req: AuthenticatedMedusaRequest, res: MedusaResponse, error: unknown, label: string) {
  if (error instanceof ChatPolicyError) return res.status(error.status).json({ type: error.type, message: error.message })
  if (error instanceof ConversationNotFoundError) return res.status(404).json({ type: "not_found", message: "Konverzace nenalezena" })
  const code = (error as any)?.code ?? (error as any)?.cause?.code
  if (code === "55P03") return res.status(503).json({ type: "busy", message: "Server je právě vytížený, zkuste to prosím za chvíli." })
  req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`${label} selhalo`, error as Error)
  return res.status(500).json({ type: "unexpected_state", message: "Akce se nepovedla, zkuste to prosím znovu." })
}
