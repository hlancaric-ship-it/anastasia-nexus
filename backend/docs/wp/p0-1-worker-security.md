# P0-1 — Worker security: ENVIRONMENT, webhook podpis, CORS

Repozitář `hlancaric-ship-it/anastasia-nexus`, výchozí větev `wave1-base` (`4397842`),
pracovní větev `claude/p0-worker-security`. Výsledný commit viz `git log` větve
(hash nelze zapsat do vlastního commitu). Nic nenasazeno, žádné produkční volání,
žádná migrace. Autorizace: úzce vymezená výjimka z ochrany `nexus/` v `AGENTS.md`
pro soubory `nexus/wrangler.jsonc`, `nexus/workers/api/http.ts`,
`nexus/workers/api/routes/medusaWebhook.ts` a související testy v `nexus/tests/`.

Zdroj plánu: zadání P0-1 (kapitola 19 `NEXUS_ARCHITECTURE_AS_IS.md`). Tento soubor
**není** v repozitáři ani na žádné větvi, plán proto nebyl čten a rozsah vychází
výhradně z textu zadání a z ověřeného stavu kódu.

## Nález (ověřený na baseline `4397842`)

1. `wrangler.jsonc` nedeklaroval `vars.ENVIRONMENT` v žádném cíli. `wrangler deploy
   --dry-run --env production` na baseline vypsal pouze bindingy DO a D1, bez
   `ENVIRONMENT`. Wrangler `vars` se do `env.*` nedědí, produkční Worker tedy běžel
   s `ENVIRONMENT === undefined`.
2. `medusaWebhook.ts` odmítal chybějící secret jen při `ENVIRONMENT === 'production'`.
   Při `undefined` (i při překlepu `prod`, `Production`, `staging`) přijal
   **nepodepsaný** webhook (HTTP 200, pokračuje na zápis receiptu do D1).
   Reprodukováno na baseline v Node i v workerd s reálným D1 (viz „Důkaz na baseline“).
3. `http.ts` vracel `Access-Control-Allow-Origin: *` při `ENVIRONMENT !== 'production'`,
   tedy i v nedeklarované produkci. Neplatný origin dostal literální
   `Access-Control-Allow-Origin: null`, což prohlížeč přiřadí requestům s
   `Origin: null` (sandboxed iframe, `data:`/`file:`); opaque kontexty tím dostaly
   grant. Preflight z nepovoleného originu končil 204.
4. Existující test `medusaWebhookRoute.test.ts` přijímal nepodepsaný webhook bez
   nastaveného `ENVIRONMENT` jako legitimní. Kódoval tedy zranitelné chování.

## Změny

| Soubor | Změna |
|---|---|
| `nexus/workers/api/http.ts` | `resolveRuntimeEnvironment` / `isStrictEnvironment`: uvolnění povolí jen přesné `development` a `test`, vše ostatní je produkce. `resolveAllowedOrigin` vrací `string \| null`, výchozí režim je přísný, wildcard se v přísném režimu nikdy nevrací (výslovné originy vedle `*` platí), `null` origin se nepovolí nikdy. `withCors` při zamítnutí neposílá žádnou `Access-Control-Allow-*` hlavičku (zůstává `Vary: Origin`). `preflightResponse` vrací 403 bez grantu pro nepovolený origin. |
| `nexus/workers/api/routes/medusaWebhook.ts` | Chybějící, prázdný, blank nebo ne-string `MEDUSA_WEBHOOK_SECRET` odmítne s 503 `MISSING_BINDING` (před čtením těla a před D1), pokud `ENVIRONMENT` není přesně `development`/`test`. Alert log `webhook.medusa.missing_secret` s `declaredEnvironment` (bez secretu). Pokud secret je, podpis se ověřuje vždy, v každém prostředí. Formát podpisu, okno 300 s a idempotence v D1 beze změny. |
| `nexus/wrangler.jsonc` | `vars.ENVIRONMENT = "development"` (top-level dev/staging), `env.production.vars.ENVIRONMENT = "production"`. Komentář ke vzoru dědičnosti a k tomu, co se nastavuje mimo repo. |
| `nexus/tests/unit/medusaWebhookSecurity.test.ts` | nový, 39 testů |
| `nexus/tests/unit/workerEnvironmentSecurity.test.ts` | nový, 155 testů (klasifikace prostředí, CORS, preflight, wrangler kontrakt, SafeOrder regrese) |
| `nexus/tests/workers/workerSecurity.test.ts` | nový, 9 testů v workerd s reálným D1 |
| `nexus/tests/unit/medusaWebhookRoute.test.ts` | 2 testy nyní výslovně `ENVIRONMENT: 'test'` pro lokální nepodepsaný tok |
| `nexus/tests/unit/nexusSafeOrderRoute.test.ts`, `nexus/tests/workers/safeOrder.test.ts` | aserce `Allow-Origin` `'null'` → `null` (hlavička chybí) |

Neměněno záměrně: `nexusSafeOrder.ts` (už fail-closed, allowlist `development`/`test`),
`index.ts`, `types.ts`, Shoptet webhook (fail-closed nezávisle na `ENVIRONMENT`),
Pricing, voucher, SafeOrder logika, kontrakt Medusa ↔ NEXUS.

## Dopad na NEXUS

- **Webhook Medusa**: legitimní podepsané doručení (`t=<unix>,v1=<hex HMAC-SHA256 z "t.rawBody">`,
  ±300 s, `x-medusa-delivery` nebo `payload.id`) funguje beze změny ve všech prostředích.
  Změna dopadá jen na nepodepsané doručení bez secretu.
- **CORS, všechny routy**: `withCors` obaluje každou odpověď. Uvolnění zůstává jen při
  výslovném `development`/`test`. V produkci a při neznámém `ENVIRONMENT` musí být
  nastaven `ALLOWED_ORIGINS`, jinak prohlížečová volání (např. `/api/vouchers/validate`,
  `/api/klub/subscribe`, `/api/ai/query`) nedostanou CORS grant. Volání server-to-server
  (Medusa backend → `/api/nexus/*`, webhooky) CORS nepoužívají a nejsou dotčena.
- **Nasazení**: reálná doména storefrontu v repozitáři není, `ALLOWED_ORIGINS` proto
  v `wrangler.jsonc` není vymyšlen. Je to krok před spuštěním browser traffic.
- **Top-level cíl** (`wrangler deploy` bez `--env`) má nově `ENVIRONMENT=development`,
  tedy zachovává dosavadní lokální a dev chování.
- **Pricing, SafeOrder, voucher, Shoptet webhook**: bez změny kódu; SafeOrder
  `pp_system_default` regresně potvrzen (jen `development`/`test`).

## Důkaz na baseline

Nové testy spuštěny proti nezměněnému kódu (`4397842`) před implementací:
`medusaWebhookSecurity` 20 selhání z 39, `workerEnvironmentSecurity` 117 z 155
(část kvůli neexistujícím exportům), `workerSecurity` (workerd) 4 z 9. Klíčové
selhání na baseline: nepodepsaný webhook při chybějícím/přepsaném `ENVIRONMENT`
byl přijat (`expected 200 to be 503`, ověřeno v workerd s reálným D1); chybějící
allowlist vydal `*`.
Po implementaci všechny procházejí.

## Testy (po změně, Node 22, Linux)

| Příkaz | Výsledek |
|---|---|
| `cd nexus && npx tsc --noEmit` | exit 0 |
| `cd nexus && npx tsc --noEmit -p tests/workers/tsconfig.json` | exit 0 |
| `cd nexus && npm test` | 89 souborů, 1290/1290 prošlo (baseline 87 / 1096) |
| `cd nexus && npm run test:workers` | 5 souborů, 47/47 prošlo (baseline 4 / 38), workerd + reálný D1 |
| 8× opakovaný běh nových a dotčených Node testů | 8× 198/198 (bez flaky) |
| `wrangler deploy --dry-run --env production` (offline) | `env.ENVIRONMENT ("production")` |
| `wrangler deploy --dry-run` (top-level) | `env.ENVIRONMENT ("development")` |

Třída důkazu: unit (fake D1) a integration (workerd + reálný D1 test DB). Ne E2E,
ne produkce, ne GitHub Actions (nic nepushnuto).

## Reprodukce

```sh
cd nexus && npm ci
npx tsc --noEmit && npx tsc --noEmit -p tests/workers/tsconfig.json
npm test
npm run test:workers
WRANGLER_SEND_METRICS=false CI=1 npx wrangler deploy --dry-run --env production --outdir /tmp/wr
```

## Konfigurace a rollback

Před prvním produkčním nasazením (mimo repo, vyžaduje souhlas): `wrangler secret put
MEDUSA_WEBHOOK_SECRET --env production` (bez něj produkční webhook odpovídá 503, nikdy
200) a `ALLOWED_ORIGINS` jako var s přesnými originy storefrontu. Rollback: revert
commitu; žádné schéma ani data se nemění.

## Zbývající rizika (mimo P0-1)

1. `eventId` pro deduplikaci se bere z `x-medusa-delivery`, což je hlavička mimo podpis.
   Zachycené platné doručení jde v 5min okně přehrát s jinou hodnotou hlavičky a obejít
   idempotenci. Dnes jsou handlery jen logování, před napojením plateb/entitlementu
   musí být klíč odvozen z podepsaného obsahu.
2. CORS je politika prohlížeče. Worker neblokuje server-side žádost s cizím `Origin`;
   chrání je Bearer/HMAC. `/api/klub/subscribe` a `/api/ai/query` nemají autentizaci
   vůbec (veřejné, spotřebovávají Stripe/AI), `/api/vouchers/validate` je veřejné s rate limitem.
3. Dev top-level cíl bez nastaveného `MEDUSA_WEBHOOK_SECRET` přijme nepodepsaný webhook
   (výslovná dev výjimka). Pokud se top-level někdy nasadí veřejně, nastavit secret.
4. Reálné produkční hodnoty (secret, `ALLOWED_ORIGINS`) a živé chování nasazeného Workeru
   nebyly a nesmějí být ověřeny agentem.
5. Kolize klíče logu: `log(..., { event: eventName })` v `medusaWebhook.ts` přepisuje
   pole `event` (název logu). Netýká se bezpečnosti, zhoršuje filtrování logů.
6. `docs/REQUIREMENTS_MATRIX.md` (A-05, S1-09) nebyla měněna, nebyla v autorizaci.
