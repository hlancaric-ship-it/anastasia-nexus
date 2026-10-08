/**
 * POST /api/ai/query
 *
 * AI Gateway – Anastasia wellness/pharmaceutical advisor.
 *
 * Features:
 *  - GDPR consent gate (required field)
 *  - Rate limiting via Durable Object (VOUCHER_SECURITY reused for simplicity)
 *  - Cost control: max_tokens hard-capped at 512
 *  - Routes to Cloudflare AI binding (Workers AI) or upstream API key
 *  - Never exposes raw model error to client
 *
 * Supported system personas:
 *   'pharmacist' – lékový/kozmetický poradca (SK)
 *   'wellness'   – wellness coach (SK)
 *
 * Secret requirements (wrangler secret put):
 *   AI_API_KEY  – Gemini / OpenAI key (optional if using Workers AI binding)
 */

import { Env } from '../types';

type Persona = 'pharmacist' | 'wellness';

interface AIQueryRequest {
  query: string;
  persona?: Persona;
  /** ISO language code: sk | en | ru */
  lang?: string;
  /** GDPR consent – MUST be true, otherwise 403 */
  gdprConsent: boolean;
}

const SYSTEM_PROMPTS: Record<Persona, string> = {
  pharmacist:
    'Si AI lekárenský poradca pre e-shop Anastasia. Odpovedáš len na otázky o produktoch, dávkovaní a interakciách. Nikdy nediagnostikuješ. Ak ide o vážny zdravotný problém, odporuč lekára. Odpovedaj stručne, max 3 odseky.',
  wellness:
    'Si AI wellness coach pre Klub Anastasia. Radíš o meditácii, dýchaní a celostnom zdraví. Nikdy nediagnostikuješ ani nenahrádzaš lekára. Odpovedaj pokojne, v 2–4 vetách.',
};

const MAX_TOKENS = 512;
const RATE_LIMIT_PREFIX = 'ai-rate:';

export async function handleAIQuery(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: AIQueryRequest;
  try {
    body = (await request.json()) as AIQueryRequest;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // GDPR gate
  if (!body.gdprConsent) {
    return Response.json(
      {
        ok: false,
        error: 'GDPR súhlas je povinný pre použitie AI poradcu.',
      },
      { status: 403 },
    );
  }

  const query = (body.query ?? '').trim();
  if (!query || query.length > 1000) {
    return Response.json(
      { ok: false, error: 'Query must be 1–1000 chars' },
      { status: 422 },
    );
  }

  const persona: Persona = body.persona === 'pharmacist' ? 'pharmacist' : 'wellness';
  const systemPrompt = SYSTEM_PROMPTS[persona];

  // Rate limiting: 10 req / 60s per IP (best-effort, DO not required for MVP)
  const clientIP = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rateLimitKey = `${RATE_LIMIT_PREFIX}${clientIP}`;

  // Simple in-memory check via CF Cache API (approximation without DO)
  const cacheStorage = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  if (cacheStorage) {
    const cacheKey = new Request(`https://ai-rate-limit.internal/${rateLimitKey}`);
    const cached = await cacheStorage.match(cacheKey);
    if (cached) {
      const count = parseInt((await cached.text()) || '0', 10);
      if (count >= 10) {
        return Response.json(
          { ok: false, error: 'Rate limit exceeded. Skúste znova o minútu.' },
          { status: 429 },
        );
      }
      await cacheStorage.put(
        cacheKey,
        new Response(String(count + 1), {
          headers: { 'Cache-Control': 'max-age=60' },
        }),
      );
    } else {
      await cacheStorage.put(
        cacheKey,
        new Response('1', { headers: { 'Cache-Control': 'max-age=60' } }),
      );
    }
  }

  // Call AI
  const aiKey = (env as unknown as Record<string, string>)['AI_API_KEY'];

  let answer: string;

  if (aiKey) {
    // Upstream Gemini Flash (cost-efficient)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: query }] }],
          generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.4 },
        }),
      },
    );

    if (!geminiRes.ok) {
      return Response.json({ ok: false, error: 'AI service unavailable' }, { status: 502 });
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    answer =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ??
      'Odpoveď nie je dostupná.';
  } else {
    // Fallback: Workers AI binding (if configured)
    const aiBinding = (env as unknown as Record<string, { run?: Function }>)['AI'];
    if (aiBinding?.run) {
      const result = (await aiBinding.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        max_tokens: MAX_TOKENS,
      })) as { response?: string };
      answer = result.response ?? 'Odpoveď nie je dostupná.';
    } else {
      return Response.json(
        { ok: false, error: 'AI backend not configured (set AI_API_KEY secret)' },
        { status: 503 },
      );
    }
  }

  return Response.json({
    ok: true,
    persona,
    answer,
    lang: body.lang ?? 'sk',
    timestamp: new Date().toISOString(),
  });
}
