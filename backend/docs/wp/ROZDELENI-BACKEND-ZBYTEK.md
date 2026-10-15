# Rozdělení zbývající backendové práce (Fáze 1)

Stav k 15. 10. 2026. Základ všech větví: `claude/backend-integration` (obsahuje gift-voucher, booking-availability,
chat, integrated-checkout, backend-admin-readiness, notifikace přes ZeptoMail). Integrátor: Claude.
Admin UI a storefront se **nezačínají** – jen backend: moduly, workflows, store/admin API, subscribers, testy.

## Pravidla (beze změny proti `CODEX-HANDOFF.md`)

- Každý balík ve vlastním worktree a větvi z `claude/backend-integration`:
  `git -C /Users/lucky/anastasia-nexus worktree add ../anastasia-nexus-codex-<balik> -b codex/<balik> origin/claude/backend-integration`.
- Nesahat na `package.json`/lockfile, `medusa-config.ts`, `.env*` – potřeby zapsat do `docs/wp/<balik>.md`, zapojí integrátor.
- Žádné produkční služby, žádný deploy, žádný skutečný e-mail ani platba. Jen syntetická data.
- Ceny, slevy, nároky a stavy vynucuje **jen server**. Log bez osobních údajů (`formatLogLine`/`redact`).
- Texty pro zákaznice slovensky. Dokumentace balíku česky v `docs/wp/<balik>.md`.
- Hotovo = `npx tsc --noEmit` + unit testy balíku zelené lokálně; plná sada a HTTP runner běží na GitHub Actions.
  **PG/Medusa/Jest lokálně nikdy souběžně s druhým agentem** – kdo spouští HTTP runner, ohlásí to.
- E-mail se posílá jen přes `notificationModuleService.createNotifications({ to, channel: "email", template, data })`
  s `idempotency_key`; šablonu doplní Claude (viz C-1), balík jen zdokumentuje název šablony a klíče `data`.

## Codex

### X1 `codex/legal-consents` – souhlasy a odstoupení od smlouvy
1. **Souhlas s VOP a GDPR při checkoutu:** obě completion cesty (standardní `completeCartWorkflow` přes `hooks.validate`
   i `nexus-checkout`) odmítnou košík bez souhlasu (`422 TERMS_NOT_ACCEPTED`). Souhlas se ukládá na košík přes
   store API (`POST /store/carts/:id/consents`) s verzí VOP/GDPR (konfigurovatelná, ne natvrdo v kódu) a časem
   a přenese se do objednávky (metadata nebo vlastní tabulka – zdůvodnit).
2. **Newsletter souhlas:** evidence přihlášení/odhlášení (e-mail, zdroj, verze textu, čas, stav), idempotentní,
   odhlášení tokenem bez přihlášení. Žádné rozesílání – jen evidence + admin API seznam/export CSV.
3. **Formulář odstoupení (14 dní, SR):** `POST /store/withdrawals` (přihlášená zákaznice k vlastní objednávce;
   kontrola lhůty od doručení/zaplacení, položky, důvod nepovinný), stavy `received → accepted|rejected → refunded`,
   admin API pro změnu stavu s auditem (`ops-audit`). Refund se **nespouští automaticky** – jen stav a vazba na objednávku.
   E-mail potvrzení přijetí: šablona `withdrawal-received-sk` (data zdokumentovat).
4. Testy: unit + HTTP scénáře (bez souhlasu 422 na obou cestách, cizí objednávka 404, po lhůtě 422, idempotence).

### X2 `codex/customer-gdpr` – export, výmaz a poznámky
1. `GET /store/customers/me/export` – JSON všech údajů zákaznice (profil, adresy, objednávky, rezervace, nároky,
   poukazy bez plných kódů cizích obdarovaných, chat, souhlasy z X1 až po merge). Rate limit.
2. Žádost o výmaz: `POST /store/customers/me/erasure-request` + admin API pro provedení. Provedení **anonymizuje**
   osobní údaje (jméno, e-mail, telefon, adresy, text chatu), objednávky a účetní data zachová (zákonná archivace),
   zruší aktivní přihlášení a magic-link tokeny. Idempotentní, s auditem, nevratné jen po potvrzení správcem.
3. Interní poznámky správce k zákaznici: admin API CRUD (`/admin/customers/:id/notes`), audit, nikdy ve store API.
4. Testy: izolace zákaznic (cizí export 404), anonymizace nezmění součty objednávek, opakované provedení beze změny.

### X3 `codex/order-self-cancel` – storno zákaznicí
1. `POST /store/orders/:id/cancel` – jen vlastní objednávka, jen dokud není odeslaná/vyřízená a digitální obsah
   nebyl zpřístupněný (pravidla zdokumentovat; konzultace podle lhůty – výchozí 24 h před termínem, konfigurovatelné).
2. Použít existující Medusa `cancelOrderWorkflow` + existující kompenzace (poukaz, rezervace, nároky, refund kartou
   z `compensation-payment-refunded`) – **nepsat druhou logiku vratek**.
3. E-mail: šablona `order-canceled-sk` (data zdokumentovat).
4. Testy: HTTP souběh dvou storen 200/409, cizí 404, po odeslání 409, rezervace uvolní termín, poukaz se obnoví.

## Claude

- **C-1 E-maily kompletně:** potvrzení objednávky (`order.placed`), přijetí platby, odeslání zásilky, vrácení peněz,
  storno, odstoupení, uvítání po první registraci; šablony do `notification-zeptomail/templates.ts`.
  **Texty šablon editovatelné z adminu** (self-service): tabulka přepisů předmětu/textu + admin API, výchozí z kódu,
  escapování zachované. Až po ověření domény: testovací doručení magic linku na adresu Luckyho.
- **C-2 Edge 301 přesměrování:** manifest z `export-edge-redirects.ts` + CSV GSC do NEXUS Workeru (zachovat query
  vč. QR parametrů, jen GET/HEAD, jen relativní cíle), testy ve workerd.
- **C-3 Doprava a sklad (mechanismus):** způsoby dopravy a doprava zdarma od částky jako nastavení v DB (ne natvrdo),
  stav skladem/vypredané ve store API, rezervace skladu při checkoutu. Konkrétní dopravce a ceny doplní Lucky.
- **C-4 Integrace:** review a merge X1–X3, plná regrese na GitHub Actions, `PROGRESS_LOG.md`, `REQUIREMENTS_MATRIX.md`,
  `docs/SECURITY_REVIEW.md`, `PRODUCTION_RUNBOOK.md`.

## Lucky (blokuje dokončení, nejde obejít kódem)

| Co | Proč |
|---|---|
| Stripe testovací klíč | K7 platba kartou / Apple Pay / Google Pay end-to-end |
| R2 bucket v Cloudflare účtu klientky | chráněná média RESET 40+ (A-07) živě |
| Účetní: sazby DPH, režim poukazu, fakturace | číslování faktur a DPH v cenách |
| Dopravci, ceny dopravy, osobní odběr, dobírka | C-3 hodnoty a SafeOrder pro dobírku |
| Reklamace: jen text, nebo formulář s workflow? | rozsah X1/X2 |
| Newsletter: jen evidence souhlasů, nebo i rozesílání? | X1 počítá jen s evidencí |
| Hosting Medusy + Postgres + Redis | produkční nasazení (Krok 6) |

Věrnostní úrovně se **nemění**, dokud Lucky nepotvrdí názvy a procenta (PROGRESS_LOG, sekce 8).
