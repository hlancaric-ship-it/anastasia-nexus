# Předání práce Codexu: ANASTASIA e-shop (vlna 1, zbývající balíky)

Pro: Codex (enterprise režim). Od: Claude Code session, 9. 10. 2026.
Repo: `/Users/lucky/anastasia-nexus` (monorepo), backend: `backend/` (Medusa v2 2.19.0, Node 20+, npm 11.9, Postgres lokálně na socketu /tmp:5432).

## Kontext
Stavíme nový e-shop pro klientku ANASTASIA (LUCRAT s.r.o., SK) místo starého Umbraco e-shopu anastasiaoz.eu. Smlouva: `~/Desktop/ANASTASIA-audit/SMLOUVA-ANASTASIA-FINAL.html` (čl. 2 rozsah Fáze 1, příloha č. 1), rozpad prací `~/Desktop/ANASTASIA-audit/ROZPAD-faze1-narocnost.md`, audit starého systému `~/Desktop/ANASTASIA-audit/segment-*.md`. Zdroj starého e-shopu a dump DB: `~/Downloads/anozeu/` (DB.sql = MS SQL dump, 78 tabulek; zdroj v `dufeksoft.ecommerce.web/`).
Cena a rizika objednávek patří VÝHRADNĚ na backend / NEXUS Worker (`nexus/workers/api`), nikdy do klienta. Stávající server-verified NEXUS pricing (`backend/src/api/store/nexus-cart`, `nexus-checkout`, `backend/NEXUS-INTEGRATION.md`) nerozbít. Členský klub a předplatné jsou MIMO rozsah smlouvy.

## Pravidla (platí pro všechny)
- Pracuj na SVÉ větvi a ve SVÉM git worktree, nikdy přímo na `main`:
  `git -C /Users/lucky/anastasia-nexus worktree add ../anastasia-nexus-codex-<balik> -b codex/<balik>`.
  Merge řeší člověk (Lucky).
- Vlastníš jen soubory svého balíku (viz níže). Nesahej na `package.json`/lockfile (závislosti uveď do `docs/wp/<balik>.md`, přidá je integrátor), `medusa-config.ts`, `.env*`.
- Nečti ani nevypisuj `.env`, `~/Downloads/anozeu/Heslo.txt`, `~/Desktop/ANASTASIA-audit/db-pristup.txt`. Nikdy nevolej produkční služby, nenasazuj.
- PII zákazníků ze starého DB.sql necommituj. Data patří do `backend/data-private/` (je v .gitignore).
- TypeScript pro Medusa v2 (moduly, workflows, API routes dle jejích konvencí), žádný pseudokód, ošetři chyby a hrany, piš unit testy tam, kde to jde bez infrastruktury. Idempotence u všech importů a subscriberů.
- Dokumentaci balíku piš česky do `backend/docs/wp/<balik>.md`.
- Hotovo = `npx tsc --noEmit` a `npm run test:unit` v `backend/` zelené pro tvoje soubory.

## Rozdělení

### Codex (mechanické a izolované balíky)
**C1 `catalog-import`**: parser `backend/src/scripts/parse-legacy-db.ts` (DB.sql -> JSON do `backend/data-private/legacy/`) + idempotentní `backend/src/scripts/import-anastasia-catalog.ts` (medusa exec): produkty, varianty, kategorie, značky, ceny v EUR (koncové s DPH), sklad, digitální produkty (např. RESET 40+). Zachovej handle/slug a staré URL. Vlastní: tyto dva soubory + `data-private/legacy/`.

**C2 `customer-migration`**: `backend/src/scripts/migrate-legacy-customers-orders.ts` (čte JSON z C1; formát zdokumentuj v `docs/wp/customer-migration.md`): zákaznice, adresy, historické objednávky, staré přístupy k elektronickým produktům -> entitlements (přes API modulu, viz níže). Hesla NEPŘENÁŠET; hromadný „nastav si heslo“ e-mailem s náhodným tokenem. Dry-run s reportem, kontrolní součty (počty a částky), idempotence (klíč = původní e-mail/ID), žádné PII v logu (GDPR).

**C3 `qr-redirects`**: (a) generátor QR kupónů v administraci (smlouva čl. 2): `backend/src/api/admin/coupon-links/route.ts` (URL produkt+kupón a QR jako SVG/PNG bez externí služby; knihovnu `qrcode` uveď jako závislost), `backend/src/api/store/coupon-links/route.ts` (validace kódu serverem, sleva se NIKDY neuplatňuje na straně klienta), admin UI `backend/src/admin/routes/coupon-links/` (slovensky). Zjisti přesný tvar starých QR URL (`QuoteLinkController` ve zdroji starého e-shopu), aby vytištěné QR fungovaly 1:1. (b) 301 mapa: z `~/Desktop/ANASTASIA-audit/segment-INFRA-domeny-SEO.md` (SEO mapa, 39 stránek) a starých URL sestav `backend/docs/wp/redirects-map.csv` + návrh edge řešení (Cloudflare Redirect Rules / Worker snippet).

### Claude Code (kontext NEXUSu a integrace)
- **K1** úprava `nexus-cart` tak, aby věrnostní tier četl z metadat skupiny (`metadata.nexus_tier`), ne jen z názvu `ZR\d+`; skupiny Bronze/Silver/Gold/VIP.
- **K2** SafeOrder jako pre-checkout validace v `nexus-checkout` (fail-closed) + testy s mockem Workeru.
- **K3** dokončení modulu `entitlement` (rozpracováno, necommitnuto: `src/modules/entitlement`, `src/subscribers/entitlement-*`, `src/links/entitlement-*`, `src/api/*/entitlements`) - Codex jen volá jeho rozhraní, neupravuje ho.
- **K4** integrace všech větví, build, migrace na lokální DB `anastasia_dev_wave1`, závěrečné bezpečnostní review.

## Doplnění od Luckyho (9. 10. 2026): současný web je výchozí stav, ne šablona k výměně

Současné řešení na anastasiaoz.eu je výchozí stav, který NEXUS musí zachovat a technicky i obsahově na něj navázat. ANASTASIA není jen e-shop: jsou tam odborné konzultace, vzdělávací program RESET 40+ (168 €, 16 tematických týdnů), obsahová část Zdravý svet (samostatná stránka uvnitř webu, ne samostatný projekt), supervize, astrologický profil, články, recenze, informace o Lucii. Obsahové části se nesmí automaticky převést na prodejní stránky.

Technická stopa z veřejného webu (cookies): ASP.NET_SessionId, __RequestVerificationToken, yourAuthCookie, tedy ASP.NET session + autentizační cookie (náš audit potvrzuje Umbraco 8 / .NET). Z veřejného webu nejde ověřit administraci, DB, platební webhooky ani soukromé zákaznické účty: ověřovat proti zdrojáku (`~/Downloads/anozeu`), konfiguraci a testovacím scénářům.

Pravidla navíc:
1. U každé položky rozlišuj tři věci: **ověřený stav** / **předpoklad** / **požadavek čekající na implementaci**.
2. Řetěz řízení: současný stav -> požadovaný stav -> konkrétní implementace -> test -> akceptační kritérium. Backend a doménové jádro se ověřují PŘED frontendem; frontend až na závěr.
3. Nesmí zůstat opomenutá žádná sjednaná součást (traceabilita ke smlouvě čl. 2 a příloze č. 1).
4. Kritické oblasti: inventář webu (stránky, produkty, kategorie, články, média, formuláře, důležité URL); nákupní proces (košík, platby, potvrzení, rezervace, automatizace); existující klienti (účty, programy, přístupová práva, historie, přihlašování); QR kódy a staré odkazy (cílová stránka + aktivace slevy, ne jen přesměrování na úvod); obsah a administrace (kdo co spravuje, publikace, kurzy, jazykové varianty); bezpečnost a soukromí (zdravotní údaje, cookies, neveřejný obsah, AI); provozní migrace (zálohy, testovací prostředí, ověřování dat, rollback, spuštění až po schválení).

Nové balíky z tohoto doplnění:

**C4 `site-inventory`** (Codex, jen čtení + dokument): `backend/docs/wp/INVENTAR-A-AKCEPTACE.md`. Z dumpu, zdroje starého e-shopu a `~/Desktop/ANASTASIA-audit/segment-*.md` sestav inventář (stránky, produkty vč. služeb konzultace/supervize/astrologický profil, články, média, formuláře, URL, role a cookies) a tabulku „současný stav / požadovaný stav / implementace / test / akceptační kritérium“. U služeb zmapuj návaznost objednávka -> termín -> doručení služby (z kódu zjisti, jak je to dnes realizováno; co nejde zjistit, označ jako předpoklad). Nic neměň.

**K5 `traceability`** (Claude): matice smlouva čl. 2 + příloha č. 1 -> balík -> test -> stav, aby nic sjednaného nechybělo. Hotovo před zahájením frontendu.

Poznámka k pořadí: storefront (frontend) se NEZAČÍNÁ, dokud nejsou backend a doménové jádro (pricing, SafeOrder, entitlements, migrace, QR, redirecty) ověřeny a K5 nemá zelenou.

## MASTER ENGINEERING DIRECTIVE (A-01 až A-18): finální rozdělení

Platí direktiva od Luckyho (9. 10. 2026): stavy `NOT_IMPLEMENTED/PARTIAL/BLOCKED/IMPLEMENTED_UNVERIFIED/VERIFIED/ACCEPTED/FUTURE_SCOPE`, žádné tvrzení bez důkazu, žádné produkční zásahy, spuštění jen po písemném schválení klientky. Jediný zdroj pravdy: `docs/REQUIREMENTS_MATRIX.md` (vlastní Claude, K5). Skutečný remote: `hlancaric-ship-it/anastasia-nexus` (direktiva zmiňuje `L-Code-Dynamics-Dev/nexus`; rozpor řeší Lucky).

| Požadavek | Vlastník | Balík |
|---|---|---|
| A-01 identita/passwordless | Claude | K6 `auth` (Medusa customer auth, ověřené řešení, ne vlastní protokol) |
| A-02 profil a knihovna | Claude | K3 `entitlement` + izolace dat (test změnou ID) |
| A-03 katalog/ceny EUR | Codex | C1 `catalog-import`; validaci ceny na backendu ověřuje Claude (K1) |
| A-04 checkout/persistence | Claude | K2 + K4 |
| A-05 Stripe + webhook | Claude | K7 `payments-verify` (podpis, idempotence, částka/měna, stavy) |
| A-06 produkt Nič nemusíš (EP.001, 38 €, 6 stop) | Codex data, Claude propojení | C1 (seed produktu+stop), K3 (entitlement) |
| A-07 chráněná média | Claude | K3 (podepsané krátkodobé URL, R2) |
| A-08 rezervace | FUTURE/ověřit smlouvu | K5 zapíše stav, neimplementuje |
| A-09 administrace | Codex po backendu | C5 `admin-ui` (až K4 zelená) |
| A-10 SafeOrder | Claude | K2 |
| A-11 Pricing + tenant izolace | Claude | K1 |
| A-12 voucher runtime | Claude | K8 `voucher-security` (souběh, jednorázovost) |
| A-13 QR kampaně | Codex | C3 |
| A-14 SK/EN/RU | Codex | C6 `i18n` (rozlišit chybějící vs. prázdný překlad) |
| A-15 inventář a migrace | Codex | C2, C4 |
| A-16 migrace DB a obnova | Claude + Codex | K4 migrace; C7 `restore-drill` skripty |
| A-17 monitoring/zálohy | Codex příprava | C7 (runbook, pg_dump/restore skript pro lokál; BLOCKED na přístupech) |
| A-18 Zlatá brána | nikdo | `FUTURE_SCOPE` |

Další balíky Codexu: **C5 `admin-ui`** (až po K4), **C6 `i18n`** (struktura překladů + kontrola pokrytí), **C7 `restore-drill`** (`docs/wp/PRODUCTION_RUNBOOK.md` + skripty zálohy/obnovy na lokální DB, nic na produkci), **C8 `e2e-scenarios`** (14 scénářů z direktivy kap. 8 jako testy proti lokálnímu backendu, až K4 zelená).

Pořadí: (1) paralelně C1–C4 + K1, K2, K3; (2) K4 integrace; (3) K5 matice + K6–K8; (4) C5–C8; (5) bezpečnostní review a report `READY/BLOCKED/NOT READY`. Storefront až po zelené matici.

## Otevřená rozhodnutí (Lucky)
Sazby DPH 23/19/5 % potvrdit s účetní; e-mailový provider (Resend/SMTP); dobírka a osobní odběr; co je Voucher za produkt (vlna 2).
