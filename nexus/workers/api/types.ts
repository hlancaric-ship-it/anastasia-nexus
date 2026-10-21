// Minimální typy Worker runtime + Env binding kontrakt.
//
// PROČ VLASTNÍ TYPY A NE `@cloudflare/workers-types`:
// package.json ten balík dnes NEMÁ a přidávat závislost není součástí
// tohoto kroku (master rule: pinuj verze, upgrady vědomě). Worker vrstva
// potřebuje z celého D1 API jen `prepare/bind/first/run/batch` -- to je
// pár řádků. Až se balík doplní, tenhle soubor se smaže a nahradí
// `types: ["@cloudflare/workers-types"]` v workers/tsconfig.json.
//
// Tvary odpovídají veřejnému D1 API (developers.cloudflare.com/d1/worker-api).

export interface D1Meta {
    /** Počet změněných řádků. §7: `meta.changes === 1` je JEDINÝ důkaz úspěchu čerpání. */
    readonly changes: number;
    readonly duration: number;
    readonly last_row_id: number;
    readonly rows_read?: number;
    readonly rows_written?: number;
}

export interface D1Result<T = Record<string, unknown>> {
    readonly results: T[];
    readonly success: boolean;
    readonly meta: D1Meta;
    readonly error?: string;
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    first<T = unknown>(column: string): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
    prepare(query: string): D1PreparedStatement;
    /**
     * D1 batch je jedna implicitní transakce, ale POZOR NA JEJÍ HRANICI:
     *
     * **Rollback nastane POUZE při SQL chybě.** Statement, který proběhne
     * bez chyby a jen nezmění žádný řádek (`meta.changes === 0`), chyba
     * NENÍ -- batch pokračuje a ostatní statementy se zacommitují.
     *
     * PROKÁZÁNO na CI proti reálné D1 (`tests/workers/schema.test.ts`,
     * skupina 8): batch s `UPDATE ... WHERE version = <konfliktní>` +
     * `INSERT` transakce dopadl `odectenoMinor: 0, zapsanychCerpani: 1`.
     * Oba statementy hlásily `success: true`.
     *
     * DŮSLEDEK PRO ČERPÁNÍ: UPDATE zůstatku a INSERT transakce NESMÍ jít
     * jedním batchem. Při konfliktu optimistického zámku by se zapsalo
     * čerpání BEZ odečtu -- a protože ten INSERT zabere partial unique
     * index `(voucher_id, order_id)`, následný retry by spadl na
     * constraintu a vyhodnotil se jako "idempotentní replay" =>
     * `consumed: true`. Objednávka by prošla jako zaplacená kreditem,
     * který se nikdy neodečetl.
     *
     * Správný vzor (viz `consumeCredit` v routes/voucher.ts):
     *   UPDATE samostatně -> ověřit `meta.changes === 1` -> teprve INSERT
     *   -> při unique violation na INSERTu KOMPENZOVAT odečet.
     *
     * `batch()` zůstává správný nástroj tam, kde na sobě statementy
     * nezávisejí podmínkou, kterou SQL nehlásí jako chybu.
     */
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/**
 * ============================================================================
 * KONTRAKT NONCE STORE -- replay protection (§6.2)
 * ============================================================================
 * V PoC je tohle Durable Object `SecurityCoordinator` s endpointem
 * `/reserve-nonce`: in-memory `Set` pro synchronní rezervaci + `state.storage`
 * pro perzistenci. Ten vzor je produkčně ověřený (parallel replay test).
 *
 * ZDE JE JEN ROZHRANÍ. DO třída se v tomhle kroku VĚDOMĚ NEPÍŠE -- je to
 * samostatná perzistenční vrstva s vlastním wrangler bindingem
 * (`durable_objects.bindings` + `migrations` v wrangler.jsonc, které tam
 * dnes nejsou) a patří do vlastního kroku.
 *
 * SÉMANTIKA, KTEROU IMPLEMENTACE MUSÍ SPLNIT:
 *   - `reserve(nonce)` je ATOMICKÉ test-and-set. Vrací `true` právě jednou
 *     pro daný nonce; každé další volání `false`. Ne "zkontroluj a pak zapiš"
 *     ve dvou krocích -- mezi nimi je TOCTOU okno a paralelní replay projde.
 *   - Musí být korektní i při SOUBĚŽNÝCH voláních ze dvou requestů. Proto
 *     DO (single-threaded aktér), ne KV (eventually consistent -- dva
 *     souběžné čtení uvidí "volný" nonce oba).
 *   - Selhání úložiště se NESMÍ tvářit jako úspěšná rezervace. Implementace
 *     hodí; volající (`routes/voucher.ts`) to překlopí na 503 a odečet
 *     neproběhne. U platidla je fail-closed jediná přípustná politika.
 *
 * ŽÁDNÝ FALLBACK: PoC má `CONFIG.MOCK_KV_STORE` pro případ chybějícího
 * bindingu. Pro platidlo se ten fallback NEKOPÍRUJE -- in-memory Map žije
 * per-isolate, takže by replay protection na druhém isolate mlčky
 * neexistovala. Chybí-li binding, request MUSÍ selhat.
 */
export interface NonceStore {
    /**
     * Atomická rezervace. `true` = nonce byl volný a je nyní zabraný.
     * `false` = už byl použit (replay).
     * Hodí při nedostupnosti úložiště -- NIKDY nevrací `true` "pro jistotu".
     */
    reserve(nonce: string, ttlSeconds: number): Promise<boolean>;

    /**
     * Rate limit dle §4 návrhu. `true` = request smí projít, `false` =
     * limit vyčerpán.
     *
     * PROČ TO PATŘÍ K NONCE STORE: obojí obsluhuje tentýž Durable Object
     * (`SecurityCoordinator`), protože obojí potřebuje JEDEN serializační
     * bod pro celou planetu -- rate limit rozprostřený přes isolaty by
     * limit vynásobil jejich počtem.
     *
     * KDE JE TO KRITICKÉ: `/validate` prozrazuje zůstatek platidla komukoli,
     * kdo uhodne kód. Entropie 8 znaků (~6,6×10¹¹) je obrana proti náhodě,
     * ne proti stroji, který zkouší tisíce kódů za minutu. Bez rate limitu
     * je §4 nesplněný.
     *
     * Hodí při nedostupnosti úložiště -- fail-closed, NIKDY nevrací `true`
     * "pro jistotu" (to by z výpadku DO udělalo otevřená vrátka).
     */
    checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitVerdict>;
}

export interface RateLimitVerdict {
    readonly allowed: boolean;
    /** Kolik pokusů ještě zbývá v aktuálním okně (pro `X-RateLimit-Remaining`). */
    readonly remaining?: number;
    /** Za kolik sekund to má smysl zkusit znovu (pro `Retry-After`). */
    readonly retryAfterSeconds?: number;
}

/** Durable Object namespace -- minimální tvar pro binding v `Env`. */
export interface DurableObjectId {
    toString(): string;
}

export interface DurableObjectStub {
    fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
}

/**
 * Env bindingy. Povinné položky NEMAJÍ `?` -- ale TypeScript o runtime
 * realitě nic neví, takže se stejně validují za běhu
 * (`assertRequiredBindings` v index.ts). Typ je dokumentace, ne obrana.
 */
/** Minimální tvar R2 API (jen to, co používá doručování médií). */
export interface R2ObjectBodyLike {
    readonly body: ReadableStream | null;
    readonly size: number;
    readonly httpEtag?: string;
    readonly range?: { offset?: number; length?: number };
    text(): Promise<string>;
}
export interface R2BucketLike {
    get(key: string, options?: { range?: { offset?: number; length?: number } }): Promise<R2ObjectBodyLike | null>;
    head(key: string): Promise<{ size: number; httpEtag?: string } | null>;
}

/**
 * Minimální rozhraní KV -- jen to, co potřebuje cenová politika.
 * Není to `@cloudflare/workers-types` (ten balík v repu není), stejně jako u D1.
 */
export interface KVNamespaceLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface Env {
    readonly ENVIRONMENT?: string;
    /** D1 binding dle wrangler.jsonc (`d1_databases[].binding = "DB"`). */
    readonly DB: D1Database;
    /**
     * HMAC klíč. NIKDY ve `vars` ani v wrangler.jsonc --
     * jen `wrangler secret put HMAC_SECRET` (příp. Secrets Store).
     */
    readonly HMAC_SECRET: string;
    /** Dedicated server-to-server credential for the Medusa pricing adapter. */
    readonly MEDUSA_PRICING_API_KEY?: string;
    /** Tenant bound to the Medusa credential; never selected by a storefront request. */
    readonly MEDUSA_PRICING_TENANT_ID?: string;
    /** Explicit execution deadline policy (1000..86400000 ms); absent disables scheduled recovery. */
    readonly NEXUS_EXECUTION_TIMEOUT_MS?: string;
    /** Full tenant pricing policy JSON; never fall back to another tenant's defaults. */
    readonly MEDUSA_PRICING_POLICY_JSON?: string;
    /**
     * KV s cenovou politikou poslanou z databáze Medusa (věrnostní úrovně).
     * Bez bindingu (nebo bez uložené hodnoty) Worker použije `MEDUSA_PRICING_POLICY_JSON`
     * -- fallback na env je vždy bezpečný, protože jde o tutéž tenantskou politiku.
     */
    readonly PRICING_POLICY?: KVNamespaceLike;
    /** Dedicated Medusa Cloud webhook signing secret; do not reuse HMAC_SECRET. */
    readonly MEDUSA_WEBHOOK_SECRET?: string;
    /** Explicit Medusa booking synchronization capability; absent URL disables the consumer. */
    readonly MEDUSA_BOOKING_SYNC_URL?: string;
    readonly MEDUSA_BOOKING_SYNC_SECRET?: string;
    /**
     * Durable Object pro nonce replay protection (§6.2). Binding dnes
     * v wrangler.jsonc NENÍ -- doplní ho krok, který DO třídu napíše.
     * Optional v typu, ale POVINNÝ za běhu pro `/redeem`: chybí-li,
     * redemption vrátí 503, nepokračuje bez replay ochrany.
     */
    readonly VOUCHER_SECURITY?: DurableObjectNamespace;
    /** Soukromý R2 bucket s placenými médii (A-07). Bez bucketu doručování vrací 503. */
    readonly MEDIA_BUCKET?: R2BucketLike;
    /** Sdílené tajemství s Medusa backendem (min. 32 znaků), `wrangler secret put MEDIA_TOKEN_SECRET`. */
    readonly MEDIA_TOKEN_SECRET?: string;
    /** Volitelný allowlist originů pro CORS, čárkou oddělený. */
    readonly ALLOWED_ORIGINS?: string;
    /** Sdílené tajemství order webhooku (Shoptet -> NEXUS). */
    readonly WEBHOOK_SECRET?: string;
    /**
     * Klíč, kterým Shoptet podepisuje těla webhooků (HMAC-SHA1).
     * TÁŽ hodnota, jakou má okfish Worker jako
     * `SHOPTET_WEBHOOK_SIGNING_KEY` -- podpis je nad tělem, takže
     * přeposlání ho nemění a NEXUS ho musí ověřit stejným klíčem.
     */
    readonly SHOPTET_WEBHOOK_SIGNING_KEY?: string;
    /**
     * Sdílené tajemství mezi okfish Workerem a NEXUSem. Dokazuje, že
     * payload přeposlal NÁŠ Worker, ne kdokoli, kdo zachytil platné tělo.
     * Bez něj by samotný HMAC dovolil replay.
     */
    readonly NEXUS_FORWARD_TOKEN?: string;
    /**
     * Shoptet Private API token pro čtení objednávek (§18.7 audit).
     * PRODUKČNÍ token okfish.sk -- zápis blokuje ReadOnlyGuard.
     */
    readonly SHOPTET_API_TOKEN?: string;
    /**
     * Kód produktu "kreditní poukaz" v Shoptet katalogu (§18 krok 3).
     * Množstvím se tvoří hodnota: 1500 Kč = 1500 ks à 1 Kč.
     *
     * BEZ HODNOTY SE POUKAZY NEVYSTAVUJÍ. Webhook to zaloguje s alertem
     * a skončí -- uhádnout kód nelze, vystavil by se poukaz za cizí
     * položku. Viz §18.10: produkt v okfish katalogu zatím NEEXISTUJE,
     * čeká se na rozhodnutí, jestli se založí (okfish dnes prodává jen
     * pevné nominály 20/30/50/100 € a ruční položku `DP`).
     *
     * Je to `var`, ne secret -- kód produktu není tajemství.
     */
    readonly VOUCHER_PRODUCT_CODE?: string;
    /**
     * Délka platnosti poukazu v MĚSÍCÍCH (§8: default 12 = 1 rok, §11:
     * konfigurovatelné per tenant). Bez hodnoty se použije default 12.
     *
     * Je to `var` ve wrangler.jsonc, ne secret -- není to tajemství, je to
     * business konfigurace. Až vznikne tenant config store (§11), přesune se
     * tam a tenhle binding zmizí; do té doby je to jediná dostupná
     * konfigurovatelná forma (§11 zakazuje dávat platnost natvrdo do kódu).
     */
    readonly VOUCHER_VALIDITY_MONTHS?: string;
    /** Volitelně: endpoint Medusa `/hooks/ops/edge-events` pro přeposílání warn/error událostí. */
    readonly OPS_INGEST_URL?: string;
    /** Sdílené tajemství s Medusou (`OPS_INGEST_SECRET`, min. 32 znaků) -- jen `wrangler secret put`. */
    readonly OPS_INGEST_SECRET?: string;
    /** Tenant, jehož události se přeposílají (= MEDUSA_PRICING_TENANT_ID). Jiné tenanty se neposílají. */
    readonly OPS_INGEST_TENANT_ID?: string;
    /**
     * Klíč AI poskytovatele pro `/api/ai/query` (Fáza 2).
     * NIKDY ve `vars` ani ve wrangler.jsonc -- jen `wrangler secret put AI_API_KEY`.
     * Bez klíče endpoint vrací 503 a AI se nevolá.
     */
    readonly AI_API_KEY?: string;
}
