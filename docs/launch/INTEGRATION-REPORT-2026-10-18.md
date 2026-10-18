# ANASTASIA × NEXUS – integrační report pro spuštění 23. 10. 2026

Stav k 18. 10. 2026 (aktualizováno odpoledne). Integrační větev: `claude/integration-launch` (draft PR #43).
Produkční postup: **`docs/launch/DEPLOY-RUNBOOK-2026-10-23.md`**.
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
| Konzultace – web | browser E2E | výběr typu a termínu na `/konzultacie`, held termín v košíku, platba, `confirmed` (`969577f`) |
| Admin – konzultace | browser E2E | typy (cena, délka, SKU), týdenní dostupnost a výjimky ve vlastním adminu (`2494903`) |
| Admin – nastavení poukazů | browser E2E | hodnoty, platnost, doručení, rozsah kategorií, uložení a reload (`73c0145`, evidence 56–57) |
| Kontakt + newsletter | 4/4 | zpráva → e-mail Lucii (`contact-form-admin`, reply-to odesílatelka), validace, past na roboty, limit 5/10 min; newsletter v patičce uloží souhlas s verzí textu (`00d9139`, evidence 58–59) |
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

~~Rezervace konzultací na webu, typy/dostupnost a nastavení poukazů v adminu, kontaktní formulář, newsletter v patičce~~:
**hotovo 18. 10.** (viz §1 a §5).
- **Materiály a faktury v účtu:** fáze 2.
- Chat bez živého pollingu (načte se při otevření).

## 3. Blokující problémy

**P0 (bez nich nelze 23. 10. spustit – provoz, ne kód):**
1. Hosting backendu je rozhodnutý: **Medusa Cloud** (18. 10.). Kód je připravený a ověřený (§8). Chybí:
   - zřízení organizace a projektu (import repa, root `backend/`, `eu-central-1`);
   - volba plánu: Launch kvůli zálohám a Redis, runbook §8/1;
   - produkční env podle runbooku, příloha A.
2. Merge PR #38–#43 do `master` – rozhoduje Jose.
3. Produkční env podle `backend/docs/DEPLOY.md` §2 (včetně sekce Funkce Fáze 1), Stripe live klíč + webhook `stripe_stripe`, ZeptoMail doména (DKIM/bounce) ověřená, `GIFT_VOUCHER_DELIVERY=notification`, `NEXUS_BOOKING_SYNC_SECRET` shodný s Workerem, `CHAT_ADMIN_URL` na vlastní admin.

**P1:**
1. ~~Rezervace konzultací z webu~~ – hotovo (`969577f`).
2. ~~Typy/dostupnost konzultací a nastavení poukazů ve vlastním adminu~~ – hotovo (`2494903`, `73c0145`).
3. ~~Kontaktní formulář~~ – hotovo, navíc newsletter v patičce ukládá souhlas (`00d9139`).
4. Guardy Klubu a konzultací (nákup produktu bez platného kontextu) zastaví nákup až při autorizaci platby, ne už při vložení do košíku; storefront tyto produkty z katalogu filtruje, riziko je jen u přímého volání API (objednávka nevznikne, chyba přijde pozdě).
5. Starší typy konzultací bez SKU (NEXUS reprice bez SKU nefunguje) – doplnit SKU při migraci dat.

**P2:**
- Drobná odchylka mostu NEXUS vs. Worker (lokální simulace workerd na macOS 12.6 nejde).
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
| `969577f` | storefront: rezervace konzultace přímo na webu |
| `2494903` | admin: typy konzultací a dostupnost |
| `575f062` | produkční build storefrontu a adminu pro Cloudflare Pages (`ANASTASIA_*` env, CSP, HSTS, sitemap) |
| `73c0145` | admin: nastavení dárkových poukazů |
| `00d9139` | kontaktní formulář a newsletter napojené na backend (`CONTACT_NOTIFY_EMAIL`) |
| `4e3ab38` | mapa funkcí adminu: `/store/contact` (CI membership) |
| `ce273f5`, `67796b8` | produkční runbook, věrnostní úrovně na launch prázdné |
| `8d41f3a` | **Medusa Cloud:** detekce prostředí, Cloud DB/Redis/soubory, bootstrap jako migration script, oprava buildu, `PAYMENTS_TEST_MODE`, runbook pro Cloud |

PR: #43 (draft, integrace) obsahuje #40, #42, #41, #39, #38. Všechny OPEN, merge dělá Jose.

## 6. GO / NO-GO pro 23. 10.

**Kód: GO** pro e-shop, objednávky a expedici, refundy, Klub (nákup, 3DS, obnova, zastavení), poukazy, účet a chat.
**Konzultace z webu: GO** (rezervace na webu doplněna). Kontakt a newsletter: GO.
**Nasazení na Medusa Cloud: kód GO** (§8).
**Spuštění celkově: NO-GO, dokud nejsou uzavřeny P0/1–3** (projekt a plán na Medusa Cloud, merge, produkční env/Stripe/ZeptoMail).
Pokud budou P0 hotové do 21. 10. a proběhne smoke test na produkci v test režimu Stripe (`PAYMENTS_TEST_MODE=1`), je 23. 10. reálné.

## 7. Postup nasazení a rollbacku

Kompletní postup (pořadí, párování tajemství Worker ↔ backend, Pages env, Stripe, DNS a redirecty, ZeptoMail, smoke test
ve dvou fázích, zálohy, rollback, co dodá vlastník) je v **`docs/launch/DEPLOY-RUNBOOK-2026-10-23.md`**.

## 8. Připravenost na Medusa Cloud (ověřeno lokálně 18. 10., `8d41f3a`)

| Kontrola | Výsledek |
|---|---|
| Config pro typy prostředí Cloudu (production / long-lived / preview, build bez secretů) | 11 kombinací. Live klíč jen v `production`, test klíč v `production` jen s `PAYMENTS_TEST_MODE`. Soubory přes S3 Cloudu (IAM), Redis moduly od Cloudu. Unit `deploy-env` 7/7 |
| Čistý `npm ci` + `medusa build` s Cloud env | exit 0. Předtím exit 1 kvůli typové chybě v `checkout-guard.ts`, na Cloudu by spadl deploy. Opraveno |
| `medusa db:migrate` na **prázdné** DB (jako první deploy) | migrace + migration script `anastasia-bootstrap` doběhnou: store EUR, kanál, `pk_`, region SK se Stripe a Klubem, DPH, sklad, doprava, 4 věrnostní skupiny. Opraveno: na prázdné DB ještě neexistoval store (zakládá ho až start), bootstrap by se odložil na další deploy |
| Opakovaný deploy | bootstrap se znovu nespustí (`script_migrations`) |
| `medusa start` sestaveného serveru s Cloud env | `/health` 200, `/store/regions` s `pk_` 200, Medusa dashboard `/app` 200 |
| Unit testy backendu | 1020/1020 |
| Browser E2E po změnách | celá sada zelená: 69 PASS v sériovém běhu. Scénáře, které spadly na timeoutu během souběžného buildu (nákup, objednávka, konzultace), prošly při opakování. Chat má upravený E2E skript (uzavřená konverzace z minulého běhu → „nová konverzácia“) |

Neověřitelné bez účtu Medusa Cloud (ověří smoke test §3, body 11–12):
- skutečný build a deploy v Cloudu;
- běh plánovaných jobů (`membership-billing`) na sdíleném serveru plánu Launch;
- URL úložiště obrázků pro `ANASTASIA_MEDIA_ORIGIN`.
