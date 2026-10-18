# ANASTASIA × NEXUS – integrační report pro spuštění 23. 10. 2026

Stav k 18. 10. 2026. Integrační větev: `claude/integration-launch` (draft PR #43), HEAD `84538c2` + tento report.
Integrace obsahuje PR #40 (vlastní admin), #42 ⊃ #41 ⊃ #39 (Klub) a #38 (mapa adminu). Nic není mergnuto do `master` ani nasazeno.

Prostředí E2E: lokální Medusa 2.19 (`:9100`) na PostgreSQL kopii `anastasia_launch_e2e` (migrace z větve), most s kódem
NEXUS Workeru (`:8787`), `stripe listen` v testovacím účtu, vlastní admin (`:4178`), storefront (`:4173`), headless Chrome
(Playwright). Jen syntetická data a testovací karty Stripe. Evidence (JSON výsledky + skripty): `docs/launch/evidence-2026-10-18/`.

## 1. Hotové a ověřené funkce (browser E2E, skutečné volání backendu)

| Blok | Výsledek | Co přesně prošlo |
|---|---|---|
| Admin – produkt | 9/9 | přihlášení, kategorie, SKU předvyplněné, koncept, nahrání obrázku, publikace, cena 26,50 € a sklad 12 přes `shop-prices`, stav po reloadu, obrázek viditelný |
| Storefront – nákup | 9/9 | magic-link registrace, katalog a detail s cenou z backendu, košík, přepočet NEXUS, doprava 6 €, DPH, Stripe Payment Element, objednávka v DB |
| Admin – objednávka | 5/5 | detail, příprava, odeslání (e-mail o odeslání), refund 10 € přes Stripe |
| Klub – nákup | 9/9 (karta 3155) + 9/9 (karta 3184) | produkt členství v adminu, nabídka na webu, 3DS, aktivace, mandát, účet „Aktívne“, admin detail členky |
| Klub – obnova | 5/5 funkčních kroků | obnova vyžadující 3DS → „Potvrdiť platbu v banke“ v účtu → 3DS → prodloužení do 17. 12. → zastavení obnovy v účtu → admin „Obnovy platieb“ zaplacená |
| Klub – admin stop | 1/1 | admin zastaví automatickou obnovu jiné člence, DB `active|false` |
| Konzultace | 10/10 | admin typ + týdenní dostupnost, sloty, rezervace (held), připojení ke košíku, pokladna 40 €, platba → termín `confirmed`, admin seznam a detail, zrušení objednávky zruší termín + e-maily |
| Poukazy – web | 8/8 | nabídka hodnot z backendu, nákup 50 €, vydání, e-mail obdarované s kódem, uplatnění v košíku, doplatek 9 €, čerpání na 0, admin seznam maskovaně, detail s pohyby |
| Poukazy – admin | 4/4 | maskovaný seznam, historie pohybů, zneplatnění vyžaduje důvod, DB `void|0` |
| Účet a chat | 8/8 | účet bez přihlášení zamčený, reálné objednávky a termíny, zákaznice píše, bez nákupu blokováno, admin vidí, odpověď + e-mail, zákaznice vidí, uzavřená konverzace |
| Úvod (homepage) | PASS | kolekce jen ze skutečných produktů backendu |
| Bezpečnostní audit | 7/7 | viz níže |

Klub obnova běží s posunutými hodinami procesu (simulace dne obnovy, `shift-clock.cjs` + `renew-now.ts` volající
`runMembershipBilling` stejně jako job). DB se ručně nemění.

### Bezpečnost (ověřeno proti běžícímu backendu)
- **Admin RBAC:** 50 kombinací route × metoda ze všech vlastních `/admin/*` rout × (anonym, zákaznice) = 100 volání → 401/403, žádný únik.
- **Store routy se zákaznickými daty bez přihlášení:** 16/16 → 401/403.
- **IDOR:** cizí chat, členství (stop/payment/reconcile), booking (cancel/cart), objednávka (cancel/detail) → nic neprojde, stav beze změny.
  Nalezeno a opraveno: nativní `GET /store/orders/:id` vracelo e-mail a adresu komukoli s ID → nyní jen přihlášená vlastnice, jinak 404 (`1e07e36`).
- **Webhooky:** `/hooks/nexus/booking-order` bez secretu 503 (fail-closed), se špatným podpisem 401; `/hooks/ops/edge-events` 401;
  Stripe se špatným podpisem nevytvoří platbu (Medusa vrací 200 a ověřuje asynchronně).
- **`shop-prices`:** zákaznice 401, záporná cena / 3 desetinná místa / pole navíc 400, stará `expected_amount` 409, cizí `price_id` 409, cena nezměněna.
- **Cena z klienta:** `unit_price` v line-itemu 400, `metadata` ignorována, cena zůstává serverová 26,50 €.
- **Idempotence:** 3× replay stejného Stripe eventu → stále 1 objednávka, 1 platba, 1 capture.
- **Tajemství:** v gitu ani v buildu nic; `.env`, `data-private`, `dist` gitignored; produkční `medusa-config` odmítne start se slabými secrety, ne-HTTPS CORS, testovacím Stripe klíčem nebo bez `whsec_`.
- **Záloha/obnova:** `pg_dump -Fc` → `pg_restore --single-transaction` do scratch DB, počty řádků sedí, `db:migrate` na obnovené DB bez změn.

## 2. Nehotové funkce

- **Rezervace konzultací na webu:** storefront nemá UI výběru termínu (backend, platba a admin fungují; E2E volal store API pro sloty).
- **Vlastní admin:** chybí správa typů konzultací/dostupnosti a nastavení poukazů (jen API / Medusa admin).
- **Kontaktní formulář** na webu nic neodesílá.
- **Materiály a faktury v účtu:** fáze 2.
- Chat bez živého pollingu (načte se při otevření).

## 3. Blokující problémy

**P0 (bez nich nelze 23. 10. spustit – provoz, ne kód):**
1. Produkční hosting Medusy, PostgreSQL a Redis není zřízen; zálohy (šifrování, off-site, RPO/RTO, vlastník) nerozhodnuty – `backend/docs/wp/PRODUCTION_RUNBOOK.md`.
2. Merge PR #38–#43 do `master` – rozhoduje Jose.
3. Produkční env podle `backend/docs/DEPLOY.md` §2 (včetně sekce Funkce Fáze 1), Stripe live klíč + webhook `stripe_stripe`, ZeptoMail doména (DKIM/bounce) ověřená, `GIFT_VOUCHER_DELIVERY=notification`, `NEXUS_BOOKING_SYNC_SECRET` shodný s Workerem, `CHAT_ADMIN_URL` na vlastní admin.

**P1:**
1. Rezervace konzultací z webu (viz 2) – buď UI do 23. 10., nebo konzultace na launch nenabízet.
2. Typy/dostupnost konzultací a nastavení poukazů ve vlastním adminu.
3. Kontaktní formulář.
4. Guardy Klubu a konzultací (nákup produktu bez platného kontextu) zastaví nákup až při autorizaci platby, ne už při vložení do košíku; storefront tyto produkty z katalogu filtruje, riziko je jen u přímého volání API (objednávka nevznikne, chyba přijde pozdě).
5. Starší typy konzultací bez SKU (NEXUS reprice bez SKU nefunguje) – doplnit SKU při migraci dat.

**P2:**
- Default Sales Channel v bootstrapu; drobná odchylka mostu NEXUS vs. Worker (lokální simulace workerd na macOS 12.6 nejde).
- Obnovy během posunu hodin (DST) – ověřit 25. 10.; lokálně visí `mbr_01M56XY3A02CFZ0TFN6467ZDYQ` ve stavu `renewing` (syntetika, reconcile job).
- `/admin/readiness` počítá do „bez obrázku/kategorie“ i servisní produkty (Klub, konzultace, poukazy).
- Košík s poukazem: „Celkom 3,00 € / Vrátane DPH 9,91 €“ – DPH se počítá z ceny zboží (víceúčelový poukaz), právně správně, ale matoucí.
- Admin Klub › Členky hledá podle zákaznice, ne podle `mbr_` ID.
- Refund částečně zaplacené objednávky zapíše `refund_manual_review` (záměr – kontrola obsluhou).

## 4. CI a browser E2E s commity

CI (GitHub Actions) na `84538c2`: Backend + NEXUS regression ✅, Membership persistence ✅, Membership complete integration ✅,
Admin C5 workspace ✅, Admin store readiness ✅. Unit testy backendu (672) a NEXUS vitest (1230) zelené (agentní běh 16. 10.).

Browser E2E 18. 10. na HEAD `84538c2` (kód identický s `1e07e36`): všechny bloky výše zelené. Celá sada `run-all.sh` běžela
sériově; během běhu Medusa `develop` restartovala kvůli úpravě `DEPLOY.md` (watcher), proto se Klub opakoval – po opakování zelený.
Konzultace jednou neprošla na timeoutu kliknutí, opakování 10/10. Test poukazů měl zastaralý selektor (jméno obdarované už admin
karta neukazuje), opraven na maskovaný kód.

## 5. Změny a PR v této integraci (`claude/integration-launch`)

| Commit | Změna |
|---|---|
| `f5967a2` | nákup z adminu až po refund end-to-end |
| `fd7fc42` | Klub: obnova s 3DS potvrditelná v účtu, admin bez souběhu pohledů |
| `3ecd65f` | konzultace: digitální košík projde pokladnou, typ má SKU, admin ruší zaplacený termín přes objednávku |
| `8e7b013` | poukazy: nabídka jen z backendu, popisky v košíku, admin k dárkovým poukazům |
| `13a8fa8` | účet jen ze serveru, žádné ukázkové objednávky/termíny, chat bez mock fallbacku |
| `ff478a7` | úvod a obchod jen se skutečnými produkty, vrácené poukazy a QR odkaz + test proti tichému mock fallbacku |
| `b4a6486` | re-review mapy adminu (booking/types) |
| `1e07e36` | **security:** detail objednávky jen pro přihlášenou vlastnici |
| `84538c2` | `DEPLOY.md` + `.env.template`: produkční proměnné funkcí Fáze 1 |

PR: #43 (draft, integrace) obsahuje #40, #42, #41, #39, #38. Všechny OPEN, merge dělá Jose.

## 6. GO / NO-GO pro 23. 10.

**Kód: GO** pro e-shop, objednávky a expedici, refundy, Klub (nákup, 3DS, obnova, zastavení), poukazy, účet a chat.
**Konzultace z webu: NO-GO** bez UI rezervace (P1/1) – na launch buď doplnit, nebo nenabízet.
**Spuštění celkově: NO-GO, dokud nejsou uzavřeny P0/1–3** (hosting + zálohy, merge, produkční env/Stripe/ZeptoMail).
Pokud budou P0 hotové do 21. 10. a proběhne smoke test na produkci v test režimu Stripe, je 23. 10. reálné.

## 7. Postup nasazení a rollbacku

**Nasazení** (detail `backend/docs/DEPLOY.md` §5):
1. Jose zreviduje a mergne #43 (resp. #38–#42) do `master`; tag `launch-2026-10-23`.
2. Zřídit Postgres (SSL, denní záloha + PITR) a Redis; env dle DEPLOY §2 včetně Funkcí Fáze 1; nejdřív **testovací** Stripe klíče.
3. `npm ci && npm run build`; v `.medusa/server` `npx medusa db:migrate`; jednorázově `anastasia-bootstrap.ts`; admin uživatel.
4. Start za HTTPS proxy, `GET /health`; Stripe webhook `https://<backend>/hooks/payment/stripe_stripe` + `whsec`.
5. NEXUS Worker: secrets `MEDUSA_PRICING_API_KEY`, `MEDUSA_PRICING_TENANT_ID`, `MEDUSA_BOOKING_SYNC_SECRET`, `OPS_INGEST_SECRET` shodné s backendem; deploy Workeru.
6. Storefront a admin na Cloudflare Pages s produkční `apiBaseUrl` a publishable klíčem; CORS na backendu.
7. ZeptoMail: DKIM + bounce CNAME (DNS only), ověřit magic link na vlastní adresu; v adminu znovu uložit nastavení poukazů.
8. Smoke test v test režimu Stripe (nákup, Klub, poukaz, refund) → přepnout na live klíče → jedna reálná malá platba + refund.

**Rollback:**
- Před migrací `pg_dump -Fc` (ověřený postup obnovy výše). Aplikace: nasadit předchozí build/tag (Pages „rollback to deployment“, Medusa předchozí release).
- Migrace jsou aditivní; při problému s daty obnova z dumpu `pg_restore --single-transaction` do nové DB a přepnutí `DATABASE_URL`.
- Stripe: přepnout zpět na test klíče / vypnout webhook endpoint; Klub joby se zastaví s procesem, nic neúčtují.
- Worker: `wrangler rollback` na předchozí verzi.
