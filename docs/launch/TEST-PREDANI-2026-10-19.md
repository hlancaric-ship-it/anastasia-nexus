# Testovací předání ANASTASIA – 19. 10. 2026

Stav: připraveno 18. 10. 2026, **nic není veřejně nasazené**. Nasazení až po souhlasu Luckyho.
Předání běží na subdoménách L-Code (`l-code-dynamics.com`, Cloudflare účet L-Code). **Doména a DNS Lucie se nemění.**
Ostrá doména, živé platby a převod na Cloudflare Lucie: až po samostatném schválení (runbook 23. 10., `MIGRACE-CLOUDFLARE-LUCIE.md`).

## 1. Adresy

| Část | Adresa | Kde běží |
|---|---|---|
| Web (storefront) | `https://anastasia-test.l-code-dynamics.com` | Worker `anastasia-test-web` (statické assety), účet L-Code |
| Admin | `https://anastasia-test-admin.l-code-dynamics.com` | Worker `anastasia-test-admin` (statické assety), účet L-Code |
| NEXUS (test) | `https://anastasia-test-nexus.l-code-dynamics.com` | Worker `nexus-api-anastasia-test`, D1 `nexus-voucher-anastasia-test`, vlastní DO |
| Backend | `https://<projekt>.medusajs.app` (přidělí Medusa Cloud) | Medusa Cloud Develop, `eu-central-1` |
| Zálohy DB | R2 `anastasia-db-backups` (EU), účet L-Code | GitHub Actions `db-backup.yml` |

Hostnamy jsou jednoúrovňové (pokryje je Universal SSL zóny) a 18. 10. byly volné (bez DNS záznamu).
DNS záznamy vytvoří Cloudflare sám při nasazení Workeru s custom domain. Ručně se v DNS nic nemění.

## 2. Pojistky testovacího provozu

| Riziko | Pojistka | Ověřeno |
|---|---|---|
| Indexace vyhledávači | build bez `ANASTASIA_SITE_URL`: `meta robots noindex,nofollow`, `robots.txt Disallow: /`, bez sitemap, `X-Robots-Tag: noindex, nofollow`; admin totéž + `robots.txt` | `deploy.sh` build zastaví, když něco chybí; `--smoke` kontroluje hlavičky naživo |
| Skutečná platba | storefront jen `pk_test_` (`deploy.sh` jiný odmítne); backend `PAYMENTS_TEST_MODE=1` + `sk_test_` (config live klíč s test módem odmítne) | suchý běh a negativní testy 18. 10. |
| E-mail skutečné zákaznici | ZeptoMail posílá jen na `EMAIL_RECIPIENT_ALLOWLIST`; při `PAYMENTS_TEST_MODE=1` (a na stagingu/náhledech) platí vždy, **bez seznamu neodejde nic**. Mimo seznam: záznam `send_suppressed` v logu bez adresy | unit testy `zeptomail.unit.spec.ts` (19/19) |
| Záměna s doménou Lucie | `deploy.sh` a `nexus-secrets.sh` odmítnou cokoli s `anastasiaoz` | negativní testy 18. 10. |
| Testovací data v produkčním NEXUS | samostatný Worker, D1 i DO stav; `wrangler … --env anastasia-test` | `--dry-run` 18. 10.: binding `nexus-voucher-anastasia-test` |
| Zákaznická data | DB na Cloudu je nová a prázdná, jen bootstrap; skuteční zákazníci v ní nejsou | – |

## 3. Postup nasazení (po souhlasu)

Každý krok končí ověřením. Bez zeleného ověření se nepokračuje.

### 3.1 Medusa Cloud (Lucky, nebo přístup pro L-Code)
1. Projekt: **Import from GitHub** `hlancaric-ship-it/anastasia-nexus`, root `backend`, region `eu-central-1`.
2. **Větev** (rozhodnutí Luckyho, kód testu je jen na `claude/integration-launch`, PR #43):
   - a) Jose zmerguje #43 do `master` → produkční větev Cloudu `master` (doporučeno, stejně jako runbook 23. 10.);
   - b) bez merge: produkční větev projektu dočasně `claude/integration-launch`, před 23. 10. přepnout na `master`.
3. Proměnné (Environment variables), hodnoty secretů z `backend/data-private/test-predani/secrets.env` (jen u L-Code, gitignorováno):

| Proměnná | Hodnota pro test |
|---|---|
| `JWT_SECRET`, `COOKIE_SECRET` (S B R) | ze `secrets.env` |
| `STORE_CORS` | `https://anastasia-test.l-code-dynamics.com` |
| `ADMIN_CORS` | `https://anastasia-test-admin.l-code-dynamics.com` |
| `AUTH_CORS` | obě adresy výše, čárkou |
| `PAYMENTS_TEST_MODE` | `1` |
| `STRIPE_API_KEY` (S B R) | testovací `sk_test_`/`rk_test_` (stávající testovací účet Stripe) |
| `STRIPE_WEBHOOK_SECRET` (S B R) | `whsec_` testovacího endpointu z 3.4 |
| `MAGIC_LINK_BASE_URL` | `https://anastasia-test.l-code-dynamics.com/prihlasenie/potvrdit` |
| `ACCOUNT_URL` | `https://anastasia-test.l-code-dynamics.com/ucet` |
| `COUPON_LINK_STOREFRONT_ORIGIN` | `https://anastasia-test.l-code-dynamics.com` |
| `CHAT_ADMIN_URL` | `https://anastasia-test-admin.l-code-dynamics.com/#/chat` |
| `ZEPTOMAIL_API_KEY` (S B R), `ZEPTOMAIL_FROM_EMAIL` | stávající Mail Agent „Anastasia“; odesílatel z ověřené domény agenta |
| `EMAIL_RECIPIENT_ALLOWLIST` | `@l-code-dynamics.com,<e-mail Lucie>` (bez Lucie jen tým) |
| `CONTACT_NOTIFY_EMAIL`, `CHAT_ADMIN_NOTIFY_EMAIL` | adresa ze seznamu výše |
| `NEXUS_PRICING_URL` | `https://anastasia-test-nexus.l-code-dynamics.com/api/nexus/pricing` |
| `NEXUS_MEDUSA_WEBHOOK_URL` | `https://anastasia-test-nexus.l-code-dynamics.com/api/webhooks/medusa` |
| `NEXUS_TENANT_ID` | `anastasia` |
| `NEXUS_PRICING_API_KEY`, `NEXUS_MEDUSA_WEBHOOK_SECRET`, `NEXUS_BOOKING_SYNC_SECRET`, `OPS_INGEST_SECRET`, `MEDIA_TOKEN_SECRET` (S R) | ze `secrets.env` (stejné hodnoty dostane NEXUS v 3.2) |
| `GIFT_VOUCHER_DELIVERY` | `notification` |
| `ANASTASIA_REGION_COUNTRIES` | `sk` |
| ostatní z runbooku, příloha A | prázdné = výchozí; hodnoty od vlastníka (doprava, právní verze) doplní Lucia, až je zvolí |

   Nevyplňovat `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `S3_*`, `BACKEND_PUBLIC_URL` (spravuje Cloud).
4. Ověření: `curl -fsS https://<projekt>.medusajs.app/health` → `OK`, v logu `[anastasia-bootstrap]`.
   Z Medusa Admin (`<API>/app`) opsat publishable key (`pk_…`) a region (`reg_…`). Obě hodnoty jsou veřejné.

### 3.2 NEXUS test
```bash
ops/test-predani/nexus-secrets.sh https://<projekt>.medusajs.app   # secrety + URL backendu, nic nevypisuje
cd nexus && npx wrangler deploy --env anastasia-test                  # vytvoří i DNS záznam anastasia-test-nexus
```
D1 `nexus-voucher-anastasia-test` je založená a migrace 0001–0007 aplikované (18. 10.).
`ENVIRONMENT=production` (přísný CORS) a `ALLOWED_ORIGINS` (web + admin) jsou ve `wrangler.jsonc`.

### 3.3 Web a admin
```bash
export ANASTASIA_API_ORIGIN=https://<projekt>.medusajs.app ANASTASIA_PUBLISHABLE_KEY=pk_… \
       ANASTASIA_REGION_ID=reg_… ANASTASIA_STRIPE_PUBLISHABLE_KEY=pk_test_…
ops/test-predani/deploy.sh            # build + kontroly + dry-run
ops/test-predani/deploy.sh --deploy   # nasazení (vytvoří DNS záznamy obou subdomén)
ops/test-predani/deploy.sh --smoke    # 200, noindex, CSP, robots.txt, žádný live klíč → SMOKE_OK
```

### 3.4 Stripe (testovací režim)
Stripe Dashboard v **Test mode** → Webhooks → endpoint `https://<projekt>.medusajs.app/hooks/payment/stripe_stripe`,
události stejné jako runbook §2.7. `whsec_` → `STRIPE_WEBHOOK_SECRET` v Cloudu → redeploy. Platba testovací kartou `4242 4242 4242 4242`.

### 3.5 Přístupy do adminu (bez sdílení hesel)
1. L-Code: v `<API>/app` (přihlášení Medusa Cloud) → Settings → Users → Invite na servisní adresu L-Code.
   Token z pozvánky otevřít jako `https://anastasia-test-admin.l-code-dynamics.com/#/pozvanka/<token>` a nastavit heslo.
2. **Lucia:** v našem adminu Nastavenia → Používatelia → pozvat její e-mail. Odkaz s tokenem jí pošleme **jiným kanálem
   než tento dokument** (osobně / telefonem / SMS), heslo si zvolí sama, nikdo jiný ho nezná. Token je jednorázový.
   Pokud je její adresa v `EMAIL_RECIPIENT_ALLOWLIST`, dostane ho i e-mailem.
3. Žádná hesla se neposílají e-mailem, chatem ani se nezapisují do repa.

### 3.6 Zabezpečení adminu
- Admin data chrání přihlášení Medusy (Bearer token, bez cookies třetích stran). Statické soubory adminu žádná data neobsahují.
- **Doporučené navíc:** Cloudflare Access (Zero Trust, free plán do 50 uživatelů) na `anastasia-test-admin.l-code-dynamics.com`
  s povolenými e-maily (`@l-code-dynamics.com` + Lucia, jednorázový PIN e-mailem). Token L-Code na to nemá oprávnění,
  zapíná se v dashboardu: Zero Trust → Access → Applications → Self-hosted. NEXUS a backend Access mít nesmí (volá je server).

### 3.7 Zálohy
Workflow `db-backup.yml` zálohuje do R2 `anastasia-db-backups` (runbook §4, příloha B). Pro test je potřeba:
- GitHub environment `production-backup` se secrety (read-only connection string z Cloudu, R2 token jen pro bucket);
- plánovaný běh jde jen z výchozí větve, tedy až po merge #43 (varianta 2a). Do té doby ruční běh (*Run workflow*),
  pokud environment povolí i větev `claude/integration-launch`.

## 4. Smoke test předání (po 3.1–3.5)
1. `deploy.sh --smoke` → `SMOKE_OK`.
2. Web: titulka, e-shop, detail produktu, košík (cena přišla z NEXUS, žádná 503).
3. Pokladna: platba `4242…`, objednávka v adminu, potvrzovací e-mail jen na adresu ze seznamu.
4. Objednávka na adresu mimo seznam: v logu backendu `send_suppressed`, e-mail neodešel.
5. Admin: přihlášení, objednávky, produkty, chat. Lucia se přihlásí vlastním heslem.
6. `curl -sI https://anastasia-test.l-code-dynamics.com/ | grep -i x-robots-tag` → `noindex, nofollow`.

## 5. Úklid po testu (až po schválení)
`wrangler delete` Workerů `anastasia-test-web`, `anastasia-test-admin`, `nexus-api-anastasia-test` (smaže i jejich custom domains),
`wrangler d1 delete nexus-voucher-anastasia-test`, smazat `backend/data-private/test-predani/`, Stripe testovací webhook, Cloud proměnné přepsat na runbook 23. 10.
