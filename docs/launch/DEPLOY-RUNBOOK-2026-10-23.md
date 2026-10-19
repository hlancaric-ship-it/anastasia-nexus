# ANASTASIA × NEXUS – produkční runbook pro spuštění 23. 10. 2026

Stav: 18. 10. 2026, integrační větev `claude/integration-launch` (PR #43). Nic není nasazeno ani mergnuto.
**Backend běží na Medusa Cloud, plán Develop (29 USD/měs., už zaplacený)** (rozhodnuto 18. 10. 2026). Storefront a vlastní admin jsou statické a běží na Cloudflare Pages.
Dokument obsahuje jen postup a názvy proměnných. **Žádné skutečné klíče.** Hodnoty se zadávají přímo do Medusa Cloud,
Cloudflare a Stripe a nikdy nejdou do gitu ani do chatu s klientem.

Podrobnosti, na které runbook odkazuje:
- backend: `backend/docs/DEPLOY.md` (env §2, Stripe §3, ZeptoMail §4, kroky §5);
- NEXUS: `backend/NEXUS-INTEGRATION.md`;
- legacy redirecty: `backend/docs/wp/edge-redirects.md`;
- admin: `anastasia-admin/README.md`.

`<API>` dále znamená veřejnou URL backendu na Medusa Cloud:
`https://<subdoména>.medusajs.app` (plán Develop; vlastní doména `api.` by byla až od plánu Scale, nepotřebujeme ji).

Storefront i admin posílají přihlášení jako `Authorization: Bearer`, nespoléhají na cookies. Backend proto může běžet
na jiné doméně než web. Vlastní doména `api.` je jen kosmetika a na launch ji nepotřebujeme.

## 0. Architektura a domény

Domény jsou návrh, potvrzuje je vlastník (viz §7). DNS všech domén je na Cloudflare.

| Část | Kde běží | Doména (návrh) | Volá |
|---|---|---|---|
| Storefront (statický) | Cloudflare Pages, projekt `anastasia-web` | `www.anastasiaoz.eu` | backend, Stripe.js |
| Vlastní admin (statický) | Cloudflare Pages, projekt `anastasia-admin` | `admin.anastasiaoz.eu` (za Cloudflare Access) | backend |
| Backend Medusa 2.19 | **Medusa Cloud Develop**, region `eu-central-1`; PostgreSQL a úložiště souborů spravuje Cloud | `<API>` | NEXUS, Stripe, ZeptoMail |
| Zálohy DB | GitHub Actions `db-backup.yml` → R2 `anastasia-db-backups` (EU, účet L-Code) | – | read-only connection string Cloudu |
| NEXUS Worker | Cloudflare Workers `nexus-api-production`, D1 `nexus-voucher`, DO `VOUCHER_SECURITY` | `nexus.anastasiaoz.eu` | backend (booking sync, ops events) |
| Obrázky produktů | úložiště souborů Medusa Cloud (S3 + CDN, nahrává admin) | URL přidělí Cloud | – |

Storefront nikdy nevolá NEXUS přímo. Cenu počítá výhradně backend přes NEXUS (`/store/nexus-cart`, `/store/nexus-checkout`).

### Co backend na Medusa Cloud dělá jinak než na vlastním serveru

Řeší to `backend/src/lib/deploy-env.ts` a `medusa-config.ts`. Ověřeno unit testy a sestavením configu pro všechny typy prostředí.
- **Typ prostředí** se pozná podle `MEDUSA_CLOUD_ENVIRONMENT_TYPE`, ne podle `NODE_ENV`, protože ten si Cloud nastavuje sám:
  - `production` → ostrý provoz: live Stripe klíč + `whsec_` povinné;
  - `long-lived` (staging) a `preview-instance` (náhled PR) → live klíč zakázaný.
- **Databáze a soubory** si bere z Cloudu:
  - `DATABASE_URL` vkládá Cloud;
  - **Develop nemá Redis.** `defineConfig` Medusy na Cloudu bez `REDIS_URL` sám zapne in-memory workflow engine, cache, event bus a locking.
    Stejně běží lokální E2E i všechna CI (bez Redis). Na jednom sdíleném serveru Develop je to funkční;
    při restartu nebo redeployi se ztratí jen rozpracované události v paměti. Doručení do NEXUS a e-maily objednávek
    jsou trvalé workflow s obnovou (`medusa-event-delivery`, `order-email-recovery`). Kdyby Cloud `REDIS_URL` později dodal, použije ho automaticky;
  - obrázky jdou do S3 Cloudu přes IAM roli. Náš modul `S3_*` / R2 se na Cloudu neregistruje.
- **Migrace** spouští Cloud při každém deployi. Bootstrap obchodu (`src/migration-scripts/anastasia-bootstrap.ts`) běží jednou a automaticky.
  Je idempotentní, při chybě se zopakuje při dalším deployi. `medusa exec` na Cloudu není.
- **Build a start**: `medusa build` / `medusa start`. Čistý `npm ci` + `medusa build` s Cloud env ověřen lokálně (exit 0).

## 1. Párování tajemství (musí sedět na obou stranách)

Každé tajemství vygenerovat jednou (`openssl rand -hex 32`) a vložit na obě strany. Neshoda se projeví jako 401 nebo 503, nikdy jako tichá chyba.

| Backend (Medusa Cloud → Environment variables) | NEXUS Worker (`wrangler secret put … --env production`) | Směr | Při neshodě |
|---|---|---|---|
| `NEXUS_PRICING_URL` = `https://nexus.anastasiaoz.eu/api/nexus/pricing` | – | backend → Worker | košík 503 |
| `NEXUS_PRICING_API_KEY` | `MEDUSA_PRICING_API_KEY` | backend → Worker | košík 503 |
| `NEXUS_TENANT_ID` (např. `anastasia`) | `MEDUSA_PRICING_TENANT_ID` | obě | košík 503 |
| `NEXUS_SAFEORDER_URL` (prázdné = odvodí se z pricing URL) | – | backend → Worker | pokladna 503 |
| `NEXUS_MEDUSA_WEBHOOK_URL` = `https://nexus.anastasiaoz.eu/api/webhooks/medusa` | – | backend → Worker | události se nedoručí |
| `NEXUS_MEDUSA_WEBHOOK_SECRET` | `MEDUSA_WEBHOOK_SECRET` | backend → Worker | 401 ve Workeru |
| `NEXUS_BOOKING_SYNC_SECRET` | `MEDUSA_BOOKING_SYNC_SECRET` + `MEDUSA_BOOKING_SYNC_URL` = `<API>/hooks/nexus/booking-order` | Worker → backend | 503/401, termín se nepotvrdí |
| `OPS_INGEST_SECRET` | `OPS_INGEST_SECRET` + `OPS_INGEST_URL` = `<API>/hooks/ops/edge-events`, `OPS_INGEST_TENANT_ID` | Worker → backend | 401, chybí provozní události |
| `MEDIA_TOKEN_SECRET` | `MEDIA_TOKEN_SECRET` | obě | chráněná média 401 (fáze 2) |
| – | `HMAC_SECRET` (jen Worker, poukazy NEXUS; **nesmí** být shodný s pricing klíčem) | – | – |
| – | `MEDUSA_PRICING_POLICY_JSON` | – | košík 503 (Worker odmítne chybějící politiku) |
| – | `ENVIRONMENT=production` | – | bez něj by Worker nebyl v přísném CORS režimu |
| – | `ALLOWED_ORIGINS` = `https://www.anastasiaoz.eu` | – | – |

`MEDUSA_PRICING_POLICY_JSON` musí obsahovat `loyaltyTiers`, `brandLimits`, `categoryLimits` a `brandSaleDiscounts`.
Klíče `loyaltyTiers` odpovídají skupinám z bootstrapu: `ZR1` Bronze, `ZR2` Silver, `ZR3` Gold, `ZR4` VIP.
Na launch jsou úrovně **prázdné** (`"loyaltyTiers":{}`), tedy bez věrnostních slev; stejně běželo E2E.
Procenta si zvolí Lucia sama v adminu, jakmile bude editor politiky (fáze 2, §9). Do té doby je nevymýšlíme.

**Volitelné zpevnění Workeru:** Medusa Cloud má v EU statické odchozí IP `18.153.86.98`, `35.157.194.186` a `3.67.229.94`.
Na zóně `anastasiaoz.eu` lze přidat WAF pravidlo, které cesty `/api/nexus/pricing*` a `/api/webhooks/medusa` na `nexus.`
pustí jen z těchto IP. Pravidlo přidat až po zeleném smoke testu (§3) a seznam IP před tím znovu ověřit v dokumentaci Cloudu.

## 2. Pořadí nasazení (den D-2 až D)

Každý krok končí ověřením. Bez zeleného ověření se nepokračuje.

### 2.1 Merge a tag (Jose)
1. Review a merge PR #43 (obsahuje #38–#42) do `master`. CI musí být zelené na posledním commitu.
2. Tag `launch-2026-10-23` na merge commitu. Z tohoto tagu se buildují všechny části.

### 2.2 Medusa Cloud – projekt a prostředí
1. Organizace na cloud.medusajs.com, **plán Develop** (už zaplacený). Jiný plán se nekupuje.
   - Develop nemá vlastní zálohy Cloudu ani Redis. Zálohy řeší §4 (GitHub Actions → R2), Redis viz §0.
   - **Blokace k potvrzení (§8/1):** Develop má výpočetní limit „600 h/měs. na prostředí“, měsíc má 720–744 h.
2. **Create project → Import from GitHub**, repo `anastasia-nexus`:
   - produkční větev `master`;
   - **Project root directory: `backend`**;
   - region **`eu-central-1` (Frankfurt)**.
   GitHub App Medusy potřebuje přístup k repu. Repo patří Lucii a L-Code je v něm jako `L-Code-Dynamics-Dev`, takže instalaci aplikace schvaluje vlastník repa.
3. Hned při vytvoření vyplnit proměnné z přílohy A, bez nich první deploy spadne na kontrolách configu.
   - Hodnoty Stripe zatím **testovací** a `PAYMENTS_TEST_MODE=1` (fáze A, §3).
   - Proměnné z rezervovaných skupin, `S3_*` a `REDIS_URL` nevyplňovat. Spravuje je Cloud.
4. Deploy proběhne automaticky: `npm ci` → `medusa build` → migrace → migration script `anastasia-bootstrap` → `medusa start`.
   - Ověření v Cloud → Deployments → Logs:
     - build bez `error`;
     - v logu `[anastasia-bootstrap]` a publishable key;
     - žádná chyba z `medusa-config`.
   - `curl -fsS <API>/health` vrátí `OK`.
5. **Publishable key a region**: Cloud → Environment → *Medusa Admin* (`<API>/app`) → přihlášení účtem Medusa Cloud.
   - Settings → Publishable API Keys → `ANASTASIA storefront` (`pk_…`);
   - Settings → Regions → `reg_…`.
   Obě hodnoty jsou veřejné a jdou do buildu storefrontu.
6. **Správci adminu** (místo `medusa user`, CLI na Cloudu není):
   1. V `<API>/app` (Cloud přihlášení) → Settings → Users → *Invite* na servisní e-mail L-Code.
   2. Z odkazu pozvánky (`…/app/invite?token=<token>`) vzít token a otevřít `https://admin.anastasiaoz.eu/#/pozvanka/<token>`. Heslo se nastaví tam.
   3. Z našeho adminu (Nastavenia → Používatelia) pozvat Lucii. Heslo si zvolí sama, nikdo ho nezná.
7. **Read-only přístup pro zálohy:** Cloud → Environment → Database → *Read-only connection string* → zkopírovat
   rovnou do GitHub secretu `BACKUP_DATABASE_URL` (Příloha B). Nikam jinam ho neukládat.
   - **Restrict public access (IP allowlist) nezapínat.** Runnery GitHubu nemají pevné IP a záloha by přestala běžet.
     Ochranu dělá heslo read-only účtu a TLS (skript bez TLS odmítne spojení).
   - Write access k DB nezapínat, záloha ho nepotřebuje a skript účet se zápisem odmítne.
   - Hned po nastavení spustit workflow ručně (§4) a ověřit zelený běh.
8. Dlouhodobé staging prostředí (`long-lived`, větev `claude/integration-launch`) je volitelné a stojí navíc 60 USD/měs. Na launch nutné není.
   Preview prostředí PR jsou v plánu. Mají vlastní DB a live klíč v nich config odmítne.

### 2.3 Zálohy před prvním ostrým provozem
- Denní zálohu dělá GitHub Actions (§4). Před každým zásahem do dat navíc ruční běh workflow (*Run workflow*).
- První deploy jde do prázdné DB, ruční dump před ním není potřeba.
- Před fází B (§3) musí existovat aspoň jedna zelená produkční záloha a jeden restore drill z ní (§4.4).

### 2.4 NEXUS Worker
```sh
cd nexus
npx wrangler d1 migrations list nexus-voucher --remote --env production      # co chybí (0001–0007)
npx wrangler d1 export nexus-voucher --remote --env production --output pre-launch-nexus.sql   # záloha D1
npx wrangler d1 migrations apply nexus-voucher --remote --env production
# secrets z §1 (každý zvlášť, hodnotu zadat interaktivně, nikdy jako argument):
npx wrangler secret put MEDUSA_PRICING_API_KEY --env production
#   … MEDUSA_WEBHOOK_SECRET, MEDUSA_BOOKING_SYNC_SECRET, MEDUSA_BOOKING_SYNC_URL (<API>/hooks/nexus/booking-order),
#     OPS_INGEST_SECRET, OPS_INGEST_URL (<API>/hooks/ops/edge-events), OPS_INGEST_TENANT_ID, HMAC_SECRET, MEDIA_TOKEN_SECRET,
#     MEDUSA_PRICING_POLICY_JSON (JSON politika z §1),
#     ENVIRONMENT (=production), MEDUSA_PRICING_TENANT_ID (=anastasia), ALLOWED_ORIGINS (=https://www.anastasiaoz.eu)
npx wrangler secret list --env production    # kontrola: 13 názvů výše, hodnoty se nevypisují
npx wrangler deploy --env production
```
- Custom domain `nexus.anastasiaoz.eu` přidat na Worker: Workers → Settings → Domains.
- Ověření: v adminu Prehľad → Pripravenosť obchodu bez blokeru NEXUS a `POST /store/nexus-cart` na testovacím košíku vrátí cenu.
- Pořadí vůči backendu nevadí. Backend bez Workeru vrací v košíku 503 a nic nezapíše. Worker bez backendu jen nedoručí sync.

`ENVIRONMENT`, `MEDUSA_PRICING_TENANT_ID` a `ALLOWED_ORIGINS` nejsou tajné, Worker je ale čte stejně ze secrets i z vars.
Jako secrets přežijí každý `wrangler deploy`. Varianta s `vars` v `env.production` ve `wrangler.jsonc` je §8/3.

### 2.5 Storefront (Cloudflare Pages)
- Pages projekt napojený na repo, produkční větev `master`.
- Root directory: kořen repa. Build potřebuje `backend/docs/wp/redirects-map.csv`.
- Build command: `node storefront-prototype/build.mjs`.
- Output: `storefront-prototype/dist`.
- Node 20+. Storefront nemá npm závislosti.

| Pages env (Production) | Hodnota |
|---|---|
| `ANASTASIA_SITE_URL` | `https://www.anastasiaoz.eu` (zapne canonical, sitemap, robots, HSTS) |
| `ANASTASIA_API_ORIGIN` | `<API>` |
| `ANASTASIA_MEDIA_ORIGIN` | origin úložiště souborů Cloudu (viz níže) |
| `ANASTASIA_PUBLISHABLE_KEY` | `pk_…` z §2.2/5 |
| `ANASTASIA_REGION_ID` | `reg_…` z §2.2/5 |
| `ANASTASIA_STRIPE_PUBLISHABLE_KEY` | `pk_test_…`, po smoke testu `pk_live_…`, pak nový build |
| `SITE_THEME` | volitelně, výchozí motiv |

Neplatný tvar hodnoty build zastaví. Bez https se produkční build nedokončí.
Custom domain `www.anastasiaoz.eu` přidat v Pages → Custom domains.

**`ANASTASIA_MEDIA_ORIGIN`** jde do CSP `img-src`. Musí to být origin, ze kterého Cloud servíruje nahrané obrázky.
Zjistí se po prvním nahrání obrázku v adminu: URL obrázku v detailu produktu, stačí schéma + host.
Dokud není nastavený správně, obrázky produktů se na webu nezobrazí, ale nic jiného to neovlivní.

### 2.6 Vlastní admin (Cloudflare Pages)
- Build: `cd anastasia-admin && ANASTASIA_API_ORIGIN=<API> ANASTASIA_MEDIA_ORIGIN=<origin obrázků z §2.5> node build.mjs`.
- Output: `anastasia-admin/dist`.
- Doména `admin.anastasiaoz.eu`. Doporučeno ji navíc chránit Cloudflare Access (e-mail OTP pro Lucii a správce) jako druhou vrstvu před přihlášením Medusy.
- Po prvním přihlášení:
  1. Nastavenia → Vzhľad.
  2. Poukazy → Nastavenie poukazov → **Uložiť** (DEPLOY §2 to vyžaduje kvůli `GIFT_VOUCHER_DELIVERY`).
  3. Konzultácie → typy a týždenná dostupnosť.
- Medusa dashboard `<API>/app` zůstává pro servis (Cloud přihlášení). Lucia pracuje jen ve vlastním adminu.

### 2.7 Stripe
Postup je v DEPLOY §3.
1. Endpoint `<API>/hooks/payment/stripe_stripe` s událostmi:
   - `payment_intent.succeeded`;
   - `payment_intent.payment_failed`;
   - `payment_intent.amount_capturable_updated`;
   - `payment_intent.canceled`.
2. Signing secret uložit do `STRIPE_WEBHOOK_SECRET` (Medusa Cloud, Sensitive) a dát Redeploy. Změna proměnné se bez redeploye neprojeví.
3. Testovací a live režim mají **každý vlastní endpoint a vlastní `whsec_`**. URL je u obou stejná.
4. Apple Pay: ověřit doménu `www.anastasiaoz.eu` (Settings → Payment method domains).
5. Klub nepotřebuje vlastní webhook (DEPLOY §2).
6. Při přechodu na plán Scale s vlastní doménou `api.` přidat ve Stripe nový endpoint, ověřit ho a teprve pak smazat starý.

### 2.8 Cloudflare DNS, TLS a redirecty
1. Záznamy:
   - `www` → Pages `anastasia-web`;
   - `admin` → Pages `anastasia-admin`;
   - `nexus` → Worker;
   - `api` se na plánu Develop nezakládá (API běží na `*.medusajs.app`).
2. SSL/TLS: Full (strict), Always Use HTTPS, HSTS až po ověření všech subdomén.
3. **Legacy URL** (`backend/docs/wp/edge-redirects.md`):
   - 27 starých cest z GSC na novém webu existuje beze změny (build to hlídá);
   - 16 je jen přesměrování schématu a hostu. Řeší je Redirect Rule:
     - `anastasiaoz.eu/*` → `https://www.anastasiaoz.eu/${1}`, 301, zachovat query;
     - přesměrování z `http` řeší Always Use HTTPS.
   - **NEXUS Worker se na `www` neroutuje.** Neobsluhuje stránky webu a vrátil by 404.
   - Mapa starých cest produktů je prázdná, dokud se neimportuje katalog s `legacy_path` (fáze 2).
4. DNSSEC: při přechodu z Websupportu nejdřív vypnout DS u registrátora, pak přesunout NS, pak zapnout DNSSEC v Cloudflare.
5. Pošta (MX, SPF) zůstává na Active24. Přidat jen záznamy ZeptoMail (§2.9).

### 2.9 ZeptoMail
Postup je v DEPLOY §4.
1. Doména odesílatele `anastasiaoz.eu`: DKIM TXT a bounce CNAME **DNS only**.
2. SPF na Active24 rozšířit o include ZeptoMail, pokud ho ZeptoMail vyžaduje.
3. Env v Medusa Cloud:
   - `ZEPTOMAIL_API_KEY` (Sensitive);
   - `ZEPTOMAIL_FROM_EMAIL=noreply@anastasiaoz.eu`;
   - `ZEPTOMAIL_FROM_NAME=ANASTASIA`;
   - `ZEPTOMAIL_REPLY_TO` (schránka Lucie).
   Bez `ZEPTOMAIL_API_KEY` backend běží, ale e-maily neodchází, jen se zalogují bez osobních údajů. Kontrola 1 ve smoke testu (§3) to odhalí.
4. Ověření:
   - magic link na vlastní adresu;
   - kontaktní formulář: e-mail Lucii, „Odpovedať“ jde odesílatelce.

## 3. Smoke test

Obě fáze běží na **stejném produkčním prostředí Cloudu** se stejnou DB, doménami a buildem. Mění se jen Stripe.

**Fáze A** – `PAYMENTS_TEST_MODE=1`, testovací Stripe klíč (`sk_test_`/`rk_test_`), testovací webhook endpoint, `pk_test_` ve storefrontu.
`PAYMENTS_TEST_MODE` platí jen v produkčním prostředí. Live klíč config v tomto režimu odmítne, takže je nejde omylem zkombinovat.
Přepínač je potřeba proto, že na Cloudu je produkce určená typem prostředí a `NODE_ENV=staging` tam nastavit nejde.

Testovací karta `4242…` / 3DS `4000 0027 6000 3184`. Jen syntetické zákaznice s vlastními adresami týmu.

| # | Kontrola | Očekávání |
|---|---|---|
| 1 | Registrace magic linkem | e-mail dorazí, účet otevřen |
| 2 | Produkt → košík → doprava → pokladna | cena z NEXUS, doprava 6 €, DPH, objednávka v adminu |
| 3 | Admin: příprava → odeslání → refund 1 € | e-mail o odeslání, refund ve Stripe |
| 4 | Klub s 3DS | členství aktivní v účtu i adminu |
| 5 | Dárkový poukaz 50 € → uplatnění | e-mail obdarované s kódem, zůstatek se odečte |
| 6 | Konzultace: termín na webu → platba | termín `confirmed`, e-mail, v adminu |
| 7 | Kontakt + newsletter v patičce | e-mail Lucii, souhlas v adminu Newsletter |
| 8 | Chat z účtu → odpověď z adminu | e-mail se odkazem do účtu |
| 9 | `https://anastasiaoz.eu/zdrava-lekaren?utm_source=x` | 301 na `www`, query zachována |
| 10 | Admin Prehľad → Pripravenosť | žádný blocker |
| 11 | Obrázek produktu z adminu je vidět na webu | ověří `ANASTASIA_MEDIA_ORIGIN` (§2.5) |
| 12 | Cloud → Logs: běží plánované joby (`membership-billing` a další) | záznamy jobů bez chyb |

**Úklid po fázi A** (před fází B, schvaluje Lucky nebo Jose):
- testovací objednávky, zákaznice a členství z fáze A v adminu zrušit;
- testovací poukazy zneplatnit;
- nikdy nemazat DB celou, je v ní bootstrap.
Testovací platby ve Stripe zůstávají v testovacím režimu a s live nic nesdílí.

**Fáze B**, přepnutí na live:
1. Medusa Cloud → Environment variables:
   - `STRIPE_API_KEY` = live klíč;
   - `STRIPE_WEBHOOK_SECRET` = `whsec_` live endpointu;
   - `PAYMENTS_TEST_MODE` **smazat**;
   - Redeploy.
   Start ověří live klíč, `whsec_`, silné secrety a HTTPS CORS. Při chybě deploy neprojde a běží dál předchozí verze.
2. Pages: `ANASTASIA_STRIPE_PUBLISHABLE_KEY=pk_live_…` a nový build.
3. Jedna skutečná malá platba vlastní kartou týmu → plný refund.
4. Teprve pak zveřejnit.

## 4. Zálohy

Rozhodnutí A-17 (12. 10.): skripty + GitHub Actions + R2, žádná další služba ani placený plán. Medusa Cloud Develop
vlastní zálohy nemá, proto jediná produkční záloha DB je tato.

| Co | Jak | Kdo |
|---|---|---|
| PostgreSQL – denně | `.github/workflows/db-backup.yml`, 02:17 UTC, read-only connection string → R2 `anastasia-db-backups` | automaticky |
| PostgreSQL – před zásahem | stejný workflow ručně: Actions → *DB backup* → **Run workflow** (větev `master`) | kdo nasazuje |
| D1 `nexus-voucher` | Time Travel (30 dní) + `wrangler d1 export` před migrací | kdo nasazuje |
| Obrázky produktů | úložiště Cloudu; originály má Lucia a import | – |
| Restore drill | 1× před fází B a pak 1× měsíčně (§4.4) | L-Code |

### 4.1 Co jeden běh zálohy udělá (a kdy selže)
Skript `backend/src/scripts/backup-cloud.mjs`. Každý krok, který neprojde, ukončí běh chybou. Na selhání upozorní GitHub e-mailem.
1. Ověří, že účet **nemá právo zápisu** (žádné INSERT/UPDATE/DELETE/TRUNCATE ani vlastnictví tabulek, žádná superuser práva),
   nebo že jde o read-only repliku. Jinak `BACKUP_ROLE_NOT_READ_ONLY`.
2. Spojení jen přes TLS (`sslmode=require` doplní sám, `disable/allow/prefer` odmítne). Lokální adresa jako zdroj je zakázaná.
3. `pg_dump` musí být stejné nebo novější hlavní verze než server (runner má 16, Cloud import počítá s 16).
4. **Konzistence:** `pg_dump --format=custom` čte celou DB v jednom snapshotu (REPEATABLE READ). Zápisy během dumpu
   do zálohy nepatří, nic se nezamyká. Navíc se spočítají řádky všech tabulek těsně před a po dumpu.
5. **Úplnost a obnovitelnost:** dump se ihned celý obnoví do prázdné PostgreSQL 16 na runneru
   (`pg_restore --exit-on-error --single-transaction`). Počty řádků se porovnají: tabulka beze změny během dumpu musí
   sedět přesně, chybějící nebo přebývající tabulka je chyba, prázdná záloha je chyba.
6. **Šifrování:** gpg veřejným klíčem `ops/db-backup/anastasia-db-backup.pub.asc` (ed25519/cv25519,
   otisk `1EAF BE0E 9924 30E7 6411 1F85 9456 588C 3BAE 4AC8`). Soukromý klíč v GitHubu ani v R2 **není**.
   Nešifrovaný dump se smaže hned po zašifrování, R2 nikdy nevidí čitelná data.
7. Manifest `<objekt>.json` (bez osobních údajů): sha256 šifrovaného i dešifrovaného souboru, počty řádků, verze.
8. Nahrání do R2 a kontrola velikosti objektu (`head-object`). Shrnutí běhu je v Actions → běh → *Summary*.

Logy jsou veřejné (repo je veřejné): skript nevypisuje host, uživatele, heslo ani obsah DB; chybové hlášky z psql/pg_dump
se před výpisem čistí. Ověřeno testem (`db-backup-cloud.unit.spec.ts`).

### 4.2 Úložiště, retence, ochrana proti smazání
Bucket `anastasia-db-backups`, jurisdikce EU, Cloudflare účet L-Code (dočasně, Etapa 2 viz `MIGRACE-CLOUDFLARE-LUCIE.md`).
Bucket slouží jen zálohám ANASTASIA, nic jiného v něm není.

| Prefix | Co | Retence (lifecycle) | Zámek proti smazání (bucket lock) |
|---|---|---|---|
| `daily/RRRR/MM/` | každý běh | 35 dní | 30 dní |
| `monthly/RRRR/` | kopie běhu 1. dne v měsíci (UTC) | 400 dní | 365 dní |
| `selftest/` | jen ruční testy | 1 den | – |

Zámek znamená, že zálohu nesmaže ani přepíše nikdo, ani uniklý klíč, ani omylem spuštěný příkaz. Nedokončené uploady se mažou po 1 dni.
Velikost: dnešní data ~1,5 MB na zálohu; R2 do 10 GB je zdarma.

### 4.3 Kontrola, že zálohy běží
- Každý neúspěšný běh pošle GitHub e-mail lidem, kteří sledují repo (Lucky, Jose: Watch → Custom → Actions).
- Týdně v §6: Actions → *DB backup* → poslední běh zelený a mladší než 26 h.
- Plán workflow v neaktivním veřejném repu GitHub po 60 dnech vypíná. Workflow si ho proto každou noc sám znovu zapíná
  (`gh api …/enable`, oprávnění `actions: write`, nic jiného).
- Každý PR, který mění zálohovací skripty nebo workflow, spustí **selftest** na syntetické DB: odmítnutí účtu se zápisem,
  záloha se zkušební obnovou, odmítnutí neprázdného cíle, nečitelnost bez soukromého klíče, dešifrování + obnova,
  odhalení poškozeného souboru.

### 4.4 Obnova (restore drill i ostrá obnova)
Soukromý klíč a heslo k němu jsou jen v trezoru hesel L-Code (Lucky, Jose). Nikdy do GitHubu, Cloudu ani do chatu.
Potřebné nástroje: PostgreSQL 16 klient, gpg, aws-cli v2, Node 24, checkout repa.

```sh
cd backend
export R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_ENDPOINT=https://<účet>.eu.r2.cloudflarestorage.com R2_BUCKET=anastasia-db-backups
export BACKUP_GPG_PRIVATE_KEY_FILE=<soubor z trezoru> BACKUP_GPG_PASSPHRASE_FILE=<soubor s heslem, 0600>
aws s3 ls s3://anastasia-db-backups/daily/2026/10/ --endpoint-url "$R2_ENDPOINT"     # výběr zálohy

# a) Restore drill: obnova do PRÁZDNÉ lokální DB (nic jiného skript nepřijme)
createdb anastasia_restore_drill
export RESTORE_DATABASE_URL=postgres://localhost/anastasia_restore_drill
node src/scripts/restore-cloud.mjs --key=daily/2026/10/anastasia-….dump.gpg                                  # dry run
node src/scripts/restore-cloud.mjs --key=daily/2026/10/anastasia-….dump.gpg --confirm-empty-local-restore   # obnova
DATABASE_URL=$RESTORE_DATABASE_URL npx medusa db:migrate    # musí projít beze změn, pak dropdb

# b) Ostrá obnova produkce: jen ověřený dump pro import do Cloudu
node src/scripts/restore-cloud.mjs --key=daily/2026/10/anastasia-….dump.gpg --decrypt-only
#    → backend/data-private/backups/anastasia-….dump (0600, gitignored), smazat hned po importu
```
Každá cesta nejdřív ověří sha256 šifrovaného souboru proti manifestu, po dešifrování sha256 dumpu a čitelnost archivu.
Ostrá obnova produkce (rozhoduje Lucky nebo Jose):
1. Storefront do údržby (Pages rollback na stránku údržby) a Stripe webhook vypnout, aby nevznikaly nové objednávky.
2. Cloud → Environment → Database → **Export** aktuální DB (stav před obnovou, pro dohledání).
3. Cloud → Environment → Database → **Import** souboru z kroku b) (Cloud očekává `pg_dump -Fc` z PostgreSQL 16; náš dump to splňuje).
4. Redeploy (migrace doběhnou nad obnovenými daty) → smoke test §3 body 2, 10, 12 → webhook zapnout → web zpět.
5. Objednávky a platby vzniklé po čase zálohy dohledat ve Stripe.

**RPO 24 h** (poslední noční záloha; před rizikovým zásahem ruční běh), **RTO 4 h**.
Ověřeno 18. 10. 2026 na kopii lokální vývojové DB (172 tabulek): záloha → R2 → stažení → dešifrování → obnova
do prázdné DB → shoda počtů řádků se zdrojem → `medusa db:migrate` → `medusa develop` s `/health` 200 a produkty v API.
Produkční drill proběhne po prvním nočním běhu (§2.3).

## 5. Rollback

| Část | Postup | Data |
|---|---|---|
| Storefront / admin | Pages → Deployments → předchozí → *Rollback* | žádná |
| NEXUS Worker | `npx wrangler rollback --env production` | D1 migrace jsou aditivní; při poškození D1 Time Travel restore na čas před migrací |
| Backend kód | Medusa Cloud → Deployments → předchozí úspěšný deploy → **Redeploy**; nebo revert commitu na `master` (nový deploy) | Redeploy **nevrací DB**. Migrace Medusy jsou aditivní, starší kód nad novějším schématem běží |
| Backend data | ověřený dump z R2 (`restore-cloud.mjs --decrypt-only`) → Cloud → Database → Import, postup §4.4 | objednávky vzniklé po čase zálohy dohledat ve Stripe |
| Proměnné | změna hodnoty → Redeploy. Neplatná kombinace (např. live klíč mimo produkci) deploy zastaví a běží předchozí verze | – |
| Platby | Stripe → vypnout webhook endpoint / vrátit test klíče + `PAYMENTS_TEST_MODE=1`; storefront do údržby přes rollback Pages | Klub joby nic neúčtují, dokud neprojde platba |

Rozhodnutí o rollbacku dat dělá Lucky nebo Jose. Kód a Pages může vrátit kdokoli z týmu.

## 6. Provoz po spuštění

1. První týden kontrolovat denně:
   - admin Prehľad (pripravenosť);
   - Medusa Cloud → Logs, filtr `level=error`;
   - Stripe → Webhooks (žádné failed).
2. 25. 10. (přechod na zimní čas): zkontrolovat obnovy Klubu v adminu Klub → Obnovy platieb (INTEGRATION-REPORT P2).
3. ZeptoMail: v Zoho CPaaS sledovat bounce a odmítnutí.
4. Každá změna proměnné v Cloudu potřebuje Redeploy. Do té doby platí stará hodnota.
5. Týdně: Actions → *DB backup* zelený, poslední běh mladší než 26 h (§4.3). Měsíčně restore drill (§4.4).
6. Cloud → Usage: spotřeba výpočetních hodin prostředí vůči limitu Develop (§8/1).

## 7. Co dodá vlastník (Lucia / LUCRAT s.r.o.)

| # | Co | Proč | Termín |
|---|---|---|---|
| 1 | Přístup do Stripe účtu LUCRAT (live): zapnuté platební metody, ověřená firma, vytvoření webhooků (nebo pozvánka pro L-Code) | live platby | 21. 10. |
| 2 | Schválené verze právních textů (VOP, ochrana údajů, souhlas s newsletterem) → `LEGAL_*_VERSION`, `NEWSLETTER_CONSENT_VERSION` | souhlasy v pokladně a newsletteru | 21. 10. |
| 3 | E-mailová schránka pro zprávy z webu a chatu (`CONTACT_NOTIFY_EMAIL`, `CHAT_ADMIN_NOTIFY_EMAIL`, `ZEPTOMAIL_REPLY_TO`) | kontakt, chat | 20. 10. |
| 4 | Potvrzení domén (§0) a přístup k registrátorovi kvůli DNSSEC/NS | DNS | 20. 10. |
| 5 | Doprava zdarma od částky, lhůta zrušení konzultace | env | 20. 10. |
| 6 | Katalog produktů a typy konzultací (lze zadat v adminu) | obsah obchodu | 22. 10. |
| 7 | Schválení instalace GitHub App Medusa Cloud na repo `anastasia-nexus` (pokud ji nemůže schválit L-Code) | deploy backendu | 20. 10. |

## 8. Rozhodnutí a úkoly pro L-Code (Lucky / Jose)

1. **Plán Medusa Cloud: Develop 29 USD/měs. (už zaplacený, rozhodnuto).** Launch se nekupuje.
   Zálohy řeší §4 (GitHub Actions + R2, bez dalších nákladů), Redis není potřeba (§0).
   **BLOKACE, potřebuje potvrzení od Medusa (support / billing) do 21. 10.:** ceník uvádí u Develop výpočetní výkon
   „600 hrs/mo capped per environment“. Měsíc má 720–744 h, server API běží nepřetržitě. Pokud je limit tvrdý,
   produkce se ~25. den v měsíci zastaví. Dokumentace neříká, co se stane po jeho vyčerpání (uspání, vypnutí, doplatek).
   Do potvrzení sledovat Cloud → Usage (§6/6).
2. Organizace Medusa Cloud s plánem Develop existuje. Kdo z L-Code je v ní owner (jen owner zapíná write access k DB,
   ten ale nepotřebujeme) a kdo nastaví secrety zálohy (Příloha B).
3. Odsouhlasit dvoufázový smoke test na produkčním prostředí (§3: fáze A `PAYMENTS_TEST_MODE=1` + test klíče, fáze B live + jedna skutečná platba s refundem). Rozhoduje Jose.
4. Volitelně přesunout `ENVIRONMENT`, `MEDUSA_PRICING_TENANT_ID` a `ALLOWED_ORIGINS` do `vars` v `env.production` ve `wrangler.jsonc`, až budou domény potvrzené (malý PR).
5. Merge PR #43 → tag.
6. Cloudflare Access pro `admin.` (doporučení), WAF allowlist IP Cloudu na `nexus.` (§1, volitelné).
7. Zálohy denně, ne jen v pracovní dny: A-17 (12. 10.) počítalo s pracovními dny, Lucky 18. 10. zadal denně. Workflow běží denně.
8. Soukromý klíč zálohy a heslo přesunout do trezoru hesel a smazat z `backend/data-private/backup-keys/` (Příloha B).

## 9. Fáze 2 (není nutné na 23. 10.)

- Editor věrnostních úrovní Bronze–VIP v adminu (funkce `loyalty`): procenta si nastaví Lucia sama, politika verzovaná na backendu → NEXUS.
- Materiály a faktury v účtu (R2 `MEDIA_BUCKET` binding ve Workeru, chráněná média).
- Legacy 301 cesty produktů po importu katalogu s `legacy_path` (`export-edge-redirects.ts` → manifest Workeru, route jen pro tyto cesty).
- SKU pro starší typy konzultací vzniklé před `3ecd65f` (nové typy z adminu SKU mají).
- Živý chat (polling), segmentace a rozesílka newsletteru, RBAC rolí v adminu.
- P2 položky z INTEGRATION-REPORT §3.

## Příloha A – proměnné backendu v Medusa Cloud

Zadávají se v Cloud → Project → Environment → Environment variables. Flagy:
- **S** = Sensitive (hodnota se po uložení nezobrazí);
- **B** = dostupná při buildu;
- **R** = dostupná za běhu.

`medusa build` načítá `medusa-config.ts`, proto proměnné, které config čte, mají B i R. Kontroly secretů při buildu neběží,
build projde i bez nich. Tajemství ale nikdy nevyplňovat jen jako B.

**Nevyplňovat** (spravuje Cloud, rezervované nebo nahrazené):
- `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `PORT`;
- `MEDUSA_WORKER_MODE`, `EXECUTION_CONTEXT`, `SESSION_STORE`;
- `AWS_*`, `MEDUSA_CLOUD_*`;
- `S3_*` a `BACKEND_PUBLIC_URL`. Na Cloudu je ignoruje config.

| Proměnná | Flagy | Hodnota pro produkci |
|---|---|---|
| `JWT_SECRET` | S B R | `openssl rand -hex 32` |
| `COOKIE_SECRET` | S B R | `openssl rand -hex 32`, jiný než JWT |
| `STORE_CORS` | B R | `https://www.anastasiaoz.eu` |
| `ADMIN_CORS` | B R | `https://admin.anastasiaoz.eu` |
| `AUTH_CORS` | B R | `https://www.anastasiaoz.eu,https://admin.anastasiaoz.eu` |
| `STRIPE_API_KEY` | S B R | fáze A `sk_test_`/`rk_test_`, fáze B `sk_live_`/`rk_live_` |
| `STRIPE_WEBHOOK_SECRET` | S B R | `whsec_` endpointu z §2.7 (test / live) |
| `PAYMENTS_TEST_MODE` | B R | `1` jen ve fázi A, pak smazat |
| `STRIPE_CAPTURE` | R | výchozí `true` |
| `STRIPE_PAYMENT_METHOD_CONFIGURATION` | B R | volitelné, `pmc_…` |
| `MAGIC_LINK_BASE_URL` | B R | `https://www.anastasiaoz.eu/prihlasenie/potvrdit` |
| `ZEPTOMAIL_API_KEY` | S B R | klíč Mail Agentu |
| `ZEPTOMAIL_FROM_EMAIL` / `_FROM_NAME` / `_REPLY_TO` | B R | `noreply@anastasiaoz.eu` / `ANASTASIA` / schránka Lucie |
| `ZEPTOMAIL_API_URL` | B R | prázdné (EU výchozí) |
| `EMAIL_RECIPIENT_ALLOWLIST` | R | fáze A: adresy týmu (`@l-code-dynamics.com`, Lucia); s `PAYMENTS_TEST_MODE=1` bez seznamu neodejde žádný e-mail. Fáze B: smazat |
| `NEXUS_PRICING_URL` | R | `https://nexus.anastasiaoz.eu/api/nexus/pricing` |
| `NEXUS_PRICING_API_KEY` | S R | shodný s Workerem (§1) |
| `NEXUS_TENANT_ID` | R | `anastasia` |
| `NEXUS_SAFEORDER_URL` / `NEXUS_OPERATIONS_URL` | R | prázdné = odvodí se z `NEXUS_PRICING_URL` |
| `OPS_INGEST_TENANT_ID` | R | prázdné = `NEXUS_TENANT_ID` |
| `NEXUS_MEDUSA_WEBHOOK_URL` | R | `https://nexus.anastasiaoz.eu/api/webhooks/medusa` |
| `NEXUS_MEDUSA_WEBHOOK_SECRET` | S R | shodný s Workerem (§1) |
| `NEXUS_BOOKING_SYNC_SECRET` | S R | shodný s Workerem (§1) |
| `OPS_INGEST_SECRET` | S R | shodný s Workerem (§1) |
| `MEDIA_TOKEN_SECRET` | S R | shodný s Workerem (§1) |
| `MEDIA_DELIVERY_BASE_URL` | R | prázdné (fáze 2) |
| `ANASTASIA_REGION_COUNTRIES` | R | `sk` |
| `ANASTASIA_WAREHOUSE_CITY` / `_COUNTRY` / `_ADDRESS` | R | adresa skladu LUCRAT |
| `ANASTASIA_FREE_SHIPPING_FROM_EUR` | R | od vlastníka (§7/5) |
| `ACCOUNT_URL` | R | `https://www.anastasiaoz.eu/ucet` |
| `ACCOUNT_ORDERS_URL` / `ACCOUNT_BOOKINGS_URL` | R | prázdné = odvodí se z `ACCOUNT_URL` |
| `GIFT_VOUCHER_DELIVERY` | R | `notification` |
| `LEGAL_TERMS_VERSION` / `LEGAL_PRIVACY_VERSION` / `NEWSLETTER_CONSENT_VERSION` | R | od vlastníka (§7/2) |
| `ORDER_SELF_CANCEL_BOOKING_HOURS` | R | od vlastníka (§7/5) |
| `CONTACT_NOTIFY_EMAIL` / `CHAT_ADMIN_NOTIFY_EMAIL` | R | schránka Lucie |
| `CHAT_ADMIN_URL` | R | `https://admin.anastasiaoz.eu/#/chat` |
| `CHAT_STOREFRONT_URL` | R | prázdné = odvodí se z `ACCOUNT_URL` |
| `COUPON_LINK_STOREFRONT_ORIGIN` | R | `https://www.anastasiaoz.eu` |
| `COUPON_LINK_LEGACY_ORIGINS` | R | skutečné schválené původní originy QR (čárkou oddělené, včetně schématu/www); pouze pro import evidence |
| `OPS_EVENT_RETENTION_DAYS` / `OPS_AUDIT_RETENTION_DAYS` / `CHAT_RETENTION_DAYS` | R | prázdné = výchozí |

Na Cloudu config navíc kontroluje stejné věci jako na vlastním serveru. Start odmítne, pokud:
- secrety jsou slabé nebo shodné;
- CORS není HTTPS;
- v `production` chybí live Stripe klíč nebo `whsec_`;
- je live klíč mimo `production`, nebo spolu s `PAYMENTS_TEST_MODE`.

## Příloha B – zálohy DB: GitHub secrety a klíče

GitHub → repo `anastasia-nexus` → Settings → Environments → **`production-backup`**:
- *Deployment branches*: jen `master` (secrety se jinak do běhu nedostanou, ani z PR, ani z jiné větve);
- *Required reviewers*: nezapínat (noční běh by čekal na schválení).

| Název | Druh | Hodnota |
|---|---|---|
| `BACKUP_DATABASE_URL` | secret | read-only connection string z Cloud → Database (§2.2/7) |
| `R2_BACKUP_ACCESS_KEY_ID` | secret | R2 API token **Object Read & Write jen pro bucket `anastasia-db-backups`** |
| `R2_BACKUP_SECRET_ACCESS_KEY` | secret | k tokenu výše |
| `R2_BACKUP_ENDPOINT` | variable | `https://<id účtu>.eu.r2.cloudflarestorage.com` (EU endpoint, jinak bucket nenajde) |
| `R2_BACKUP_BUCKET` | variable | `anastasia-db-backups` |

R2 token vytvořit v Cloudflare → R2 → Manage API tokens → *Create Account API token* (ne User token, přežije odchod člověka),
oprávnění Object Read & Write, *Apply to specific buckets only* → `anastasia-db-backups`, TTL bez omezení.
Token na všechny buckety nepoužívat: v CI by uniklý klíč otevřel i média a jiné projekty.

Šifrovací klíč:
- veřejný: `ops/db-backup/anastasia-db-backup.pub.asc` (v repu, není tajný);
- soukromý + heslo: vytvořeny 18. 10. 2026, dočasně v `backend/data-private/backup-keys/` (gitignored, 0600) na stroji Luckyho.
  **Přesunout do trezoru hesel L-Code (dvě oddělené položky) a lokální soubory smazat.** Bez soukromého klíče nejde žádná
  záloha obnovit; ztráta klíče = ztráta všech záloh.
- Výměna klíče: nový pár, nový `.pub.asc` v PR, staré zálohy zůstávají čitelné starým klíčem (ten se nemaže, dokud nevyprší retence 400 dní).
