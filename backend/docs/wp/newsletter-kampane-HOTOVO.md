# Newsletter — kampane, test a rozosielanie (HOTOVO)

Stav: **IMPLEMENTED_UNVERIFIED**. Backend, admin API a admin obrazovka sú napísané a unit testy sú zelené.
Migrácia nebola spustená proti reálnej DB, odosielanie nebolo overené proti živému poskytovateľovi a admin obrazovka
ešte nie je zapojená do `anastasia-admin/app.mjs` (ten sa podľa zadania nemenil).

Dátum: 22. 10. 2026.

## Čo je hotové

- Nový modul `newsletter` s tabuľkami `newsletter_campaign` a `newsletter_delivery`
  (unikátny index `(campaign_id, consent_id)`).
- Admin API: zoznam a vytvorenie kampane, detail/úprava/mazanie konceptu, test, zaradenie do fronty, zrušenie.
- Background job `newsletter-send` (cron `*/10 * * * *`): dávka `NEWSLETTER_BATCH` (40), denný limit
  `NEWSLETTER_DAILY_LIMIT` (90 za 24 h), opätovná kontrola súhlasu **aj stavu kampane** pred každým e-mailom.
- Odosielanie ide cez existujúci notification modul (Resend / ZeptoMail), takže platí allowlist a logovanie.
- Podpísaný odhlasovací odkaz: `HMAC-SHA256(consent_id)` s `NEWSLETTER_UNSUBSCRIBE_SECRET` (min. 32 znakov),
  overenie v konštantnom čase. GET stránka nič nemení, POST odhlási. Hlavičky `List-Unsubscribe` a
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- Sanitizácia obsahu bez závislostí: whitelist značiek, iba `https:` odkazy a obrázky, `script`/`style` vrátane obsahu
  sa zahodia, značky sa vyvažujú.
- Šablóna e-mailu: krémová `#fbf8f2`, levanduľová `#8e7cc3`, šalviová `#5f7a5a`, ANASTASIA / LIGHT FOR THE FUTURE,
  tenký serif, slovenské texty, pätička s odkazom na odhlásenie.
- Admin obrazovka v novom súbore `anastasia-admin/newsletter.mjs` (3 karty, editor + živý náhľad v `iframe srcdoc`,
  toolbar, test, odoslanie s potvrdením, tabuľka kampaní, záložka odberateľov s exportom CSV, mobil pod seba).

## Súbory

Nové:

- `backend/src/modules/newsletter/` — `index.ts`, `policy.ts`, `sender.ts`, `service.ts`, `runtime.ts`,
  `models/newsletter-campaign.ts`, `models/newsletter-delivery.ts`,
  `migrations/Migration20261022120000.ts`, `__tests__/*` (4 sady).
- `backend/src/api/admin/newsletter/campaigns/` — `route.ts`, `shared.ts`,
  `[id]/route.ts`, `[id]/test/route.ts`, `[id]/send/route.ts`, `[id]/cancel/route.ts`.
- `backend/src/api/store/newsletter/unsubscribe/link/` — `route.ts`, `page.ts`.
- `backend/src/jobs/newsletter-send.ts`.
- `anastasia-admin/newsletter.mjs`.

Upravené (mimo nových súborov):

- `backend/medusa-config.ts` — registrácia `{ resolve: "./src/modules/newsletter" }`.
- `backend/src/modules/legal/service.ts` — nová metóda `unsubscribeConsent(consentId)`: nastaví stav
  `unsubscribed`, `unsubscribed_at` a zapíše `newsletter_consent_event`. Bez nej by POST odhlásenie nešlo
  cez legal service (ten vlastní tabuľku súhlasov).
- `backend/src/modules/notification-zeptomail/service.ts` — `providerHeaders()` a `headers` v payloade.
- `backend/src/modules/notification-resend/service.ts` — `headers` v payloade.
- `backend/docs/API-KATALOG.md` — nové trasy a modul; prepočítané hlavičkové počty (125 route súborov / 159 metód).
- `backend/docs/wp/admin-function-map.json` — nové trasy, zdroje, testy a zdrojové jednotky (kontrola v CI).
- `backend/docs/wp/newsletter-kampane-HOTOVO.md` — tento dokument.

## Presné zapojenie admin obrazovky do `app.mjs`

`anastasia-admin/app.mjs` sa v tomto balíku **neupravoval**. Na zapojenie treba tri malé zmeny:

1. Hore k ostatným importom (za `import { securityView } from './security.mjs';`):

```js
import { newsletterView } from './newsletter.mjs';
```

2. Zmazať starú obrazovku `async function vNewsletter(view) { ... }` (v čase písania na riadkoch 3069–3079).
   Bez zmazania vznikne duplicitná deklarácia `vNewsletter` a modul sa neparsuje.

3. Za definíciu `freshView` (v čase písania končí na riadku 3983) vložiť:

```js
// Newsletter: kampane, test a rozosielanie. Obrazovka je v samostatnom module.
const vNewsletter = newsletterView({ api, esc, fmtDate, freshView });
```

Volanie v `vObsah` sa nemení — už teraz obsahuje `{ label: 'Newsletter', run: vNewsletter }`:

```js
const vObsah = (view) => subnav(view, [
  { label: 'E-maily', run: vEmaily },
  { label: 'Newsletter', run: vNewsletter },
  // ...
]);
```

`const` je v module inicializovaný pri načítaní, ale `vObsah` ho číta až pri kliknutí, takže poradie
(definícia `vObsah` vyššie, `vNewsletter` nižšie) funguje. Po zapojení overiť `node --check anastasia-admin/app.mjs`.

## API a tvary odpovedí

| Metóda | Cesta | Odpoveď |
|---|---|---|
| GET | `/admin/newsletter/campaigns?limit=&offset=` | `{ campaigns, count, limit, offset, stats: { subscribed, campaigns_sent, last_campaign } }` |
| POST | `/admin/newsletter/campaigns` | `201 { campaign }` |
| GET | `/admin/newsletter/campaigns/:id` | `{ campaign }` |
| POST | `/admin/newsletter/campaigns/:id` | `{ campaign }` (len `draft`) |
| DELETE | `/admin/newsletter/campaigns/:id` | `{ deleted: true }` (len `draft`) |
| POST | `/admin/newsletter/campaigns/:id/test` | `{ sent: true, to }` |
| POST | `/admin/newsletter/campaigns/:id/send` | `{ campaign }` so stavom `queued` |
| POST | `/admin/newsletter/campaigns/:id/cancel` | `{ campaign }` so stavom `cancelled` |
| GET | `/admin/newsletter?format=csv&limit=&offset=` | CSV súhlasov (existujúca trasa) |
| GET | `/store/newsletter/unsubscribe/link?c=&s=` | HTML potvrdenie (nič nemení) |
| POST | `/store/newsletter/unsubscribe/link?c=&s=` | HTML výsledok, odhlásenie |

Kampaň má polia `id, subject, preheader, body_html, status, queued_at, sent_at, recipients_count, sent_count,
failed_count, created_at, updated_at`. Stav prechádza `draft → queued → sending → sent`, z `queued`/`sending`
sa dá `cancelled`; späť sa už nemení.

## Premenné prostredia

| Premenná | Význam | Predvolené |
|---|---|---|
| `NEWSLETTER_UNSUBSCRIBE_SECRET` | HMAC kľúč na odhlasovací odkaz, min. 32 znakov. Bez neho sa neodošle nič. | — (povinné) |
| `NEWSLETTER_BATCH` | Najviac e-mailov za jeden beh jobu (1–200). | `40` |
| `NEWSLETTER_DAILY_LIMIT` | Najviac e-mailov za posledných 24 h (1–1000). | `90` |
| `NEWSLETTER_PUBLIC_URL` / `BACKEND_PUBLIC_URL` | Verejná adresa backendu do odhlasovacieho odkazu. | `http://localhost:9000` |
| `EMAIL_RECIPIENT_ALLOWLIST` | Čiarkou oddelené adresy/domény, na ktoré sa v test režime smie posielať. | podľa `deploy-env` |

## Bezpečnosť

- Bez `NEWSLETTER_UNSUBSCRIBE_SECRET` admin send aj job skončia chybou `NEWSLETTER_NOT_CONFIGURED` / preskočením;
  nikdy neodošlú e-mail bez funkčného odhlasovacieho odkazu.
- Pred každým e-mailom sa znova čítá stav súhlasu (`subscribed`) aj stav kampane; zrušenie počas behu zastaví
  zvyšné doručenia.
- Doručenia, ktoré neprejdú allowlistom, sa označia `skipped` / `recipient_not_allowlisted` a **nepočítajú sa**
  ako odoslané.
- Testovací e-mail je natvrdo obmedzený na doménu `@l-code-dynamics.com` (403 inak).
- Chybová správa doručenia sa ukladá bez e-mailovej adresy, bez riadkov, max. 200 znakov.
- Odhlasovací odkaz nemá `token` v otvorenom tvare; podpisuje sa `consent_id`, pretože v DB je len `token_hash`.
- Admin trasy vyžadujú `adminActor`; bez prihlásenia vracajú 401.

## Testy

Spustené v `backend/`:

```
npx tsc --noEmit
```

Výsledok: bez výstupu (PASS).

```
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest \
  src/modules/newsletter \
  src/modules/legal/__tests__/unsubscribe-consent.unit.spec.ts \
  src/modules/notification-resend/__tests__/headers.unit.spec.ts \
  --runInBand
```

Výsledok: **6 suite / 35 testov PASS** (sanitizácia, odhlasovací podpis a limity, šablóna, sender a zrušenie
počas behu, stavové prechody, legal unsubscribe, hlavičky Resend/ZeptoMail).

```
npm run test:unit
```

Výsledok po doplnení mapy a tohto dokumentu: **154/154 suite PASS, 1513/1513 testov PASS** (čas ~430 s).
Prvý beh pred doplnením mapy zlyhal len na `src/lib/__tests__/admin-function-map.unit.spec.ts`
(„Custom API coverage changed“), pretože nové trasy ešte neboli v `admin-function-map.json`.

Kontrola mapy:

```
python3 scripts/check-admin-function-map.py
```

Výsledok po doplnení: PASS (125 vlastných route súborov, 159 metód, 54 features).

Do mapy sa popri nových trasách obnovili aj dva už existujúce, nesúvisiace nesúlady: otisk zdroja
`/admin/product-catalogue` (hash v mape nezodpovedal zakomitovanému súboru) a odkaz na test
`storefront-prototype/test/digital-products.test.mjs`, ktorý bol medzitým premenovaný na `digital-content.test.mjs`.
Bez toho bola plná unit sada červená ešte pred týmto balíkom. Kód týchto súborov sa nemenil.

Admin súbor:

```
node --check anastasia-admin/newsletter.mjs
node -e "import('./anastasia-admin/newsletter.mjs').then(m => console.log(typeof m.newsletterView))"
```

Výsledok: syntax OK, export je `function`.

## Riziká a čo ešte overiť

- Migrácia `Migration20261022120000` nebola spustená proti reálnej DB. Pred nasadením: `medusa db:migrate`
  na lokálnej `anastasia_dev_wave1` a kontrola tabuliek/indexov.
- Odosielanie nebolo overené proti živému Resend/ZeptoMail. Prvý test poslať na adresu `@l-code-dynamics.com`.
- Admin obrazovka nie je zapojená; do `app.mjs` treba doplniť import, odstrániť starú `vNewsletter` a pridať
  `const vNewsletter = newsletterView({...})` podľa receptu vyššie.
- Job beží v procese Medusy; pri viacerých inštanciách môže dávku spustiť viac workerov. Proti dvojitému odoslaniu
  chráni `idempotency_key` v notification module a stav doručenia, ale pri škálovaní odporúčam job spúšťať len
  na jednej inštancii.
- Denný limit sa počíta z doručení v posledných 24 h v tej istej DB; pri obnovení databázy zálohou sa počítač
  môže líšiť.
- Skutočné doručenie do schránky nie je to isté ako „provider accepted“. Stav `sent` znamená, že notification
  modul správu prijal.

## Ďalší krok

1. Zapojiť obrazovku do `app.mjs` podľa receptu vyššie a overiť `node --check`.
2. Spustiť migráciu na lokálnej DB a testovací e-mail.
3. Spustiť plnú unit sadu po doplnení mapy a výsledok zapísať sem.
4. Po schválení Luckyho nastaviť `NEWSLETTER_UNSUBSCRIBE_SECRET` v prostredí a overiť odhlásenie z reálneho e-mailu.
