# Vernostné úrovne: politika v DB, zaradenie zákazníčiek a zľava na serveri

**Balík:** vernostné úrovne (Bronze/Silver/Gold/VIP = ZR1–ZR4) včetně administrácie
a automatického priradenia podľa útraty.
**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1` (nepushnuté) · **UI:** `anastasia-admin/HANDOFF-vernostne-urovne.md`

## Čo je hotové

Zákazníčka má vernostnú úroveň a zľava sa počíta výhradne na serveri. Lucia si úrovne,
zľavy a prahy nastaví v administrácii (backend je pripravený, UI robí paralelná session
admin MiniMax podľa handoffu) a zákazníčku môže ručne priradiť k úrovni; automatické
priradenie podľa celkovej zaplatené útraty beží po každej zaplatenej objednávke.

### Úložisko politiky a zaradenia

| Vec | Kde | Prečo |
|---|---|---|
| Politika (úroveň, zľava 0–50 %, prah útraty, zapnutie) | `store.metadata.loyalty_policy` (nastavenia obchodu) | vzor dopravcov – bez nového modulu a migrácie; pred launchom prázdna (0 %) |
| Úroveň zákazníčky | jej skupina (`Bronze`…`VIP` majú `metadata.nexus_tier` = ZR1…ZR4) | rovnako ju číta cenový adapter (`resolveCustomerTier`) – zľava v košíku sa prepojí bez zásahu do cenového kódu |
| Ručný zámok | samostatná skupina `Věrnost – ruční zámok` | zákazníčka si ju neprepíše (store API neumožňuje meniť skupiny ani si zapisovať metadáta) a automatika ju neprepiše |
| Celková útrata | počítaná z objednávok (zachytené platby mínus refundy) | nemusí sa skladovať; prepočítava sa pri každom automatickom priradení |

Prečo nie nový Medusa modul: `medusa-config.ts` je mimo hraníc tohto balíka
(vlastní ho integrátor) a politika musí fungovať bez zásahu do nasadenia. Skupiny už
v katalógu sú, takže sa nepridáva nový koncept modelu ani migrácia.

### Admin API (nové)

- `GET /admin/nexus/loyalty-policy` – politika; `PUT` – uloženie (validácia 0–50 %,
  jedinečné kódy, rastúce prahy) + audit + odoslanie do Workera.
- `GET /admin/nexus/loyalty-customers?tier=&q=&limit=&offset=` – zákazníčky s úrovňou,
  serverový filter (`ZR1`…`ZR4`, `none` = bez úrovne), hľadanie a stránkovanie.
- `POST /admin/nexus/customers/:id/tier` – ručné priradenie (`ZR1`…`ZR4`, vždy so zámkom)
  alebo `automatic` (zámok sa zruší a úroveň sa prepočíta podľa útraty).
- `POST /admin/nexus/customers/tiers` – hromadné priradenie (jedna úroveň pre viac
  zákazníčiek alebo rôzne úrovne po zákazníčkach), max. 200 naraz.

Každá zmena má záznam v `ops_audit` (`admin.loyalty.policy.update`,
`admin.loyalty.customer.tier.update`).

### Automatické priradenie

`backend/src/subscribers/loyalty-tier-assigned.ts` (udalosť `payment.captured`) prepočíta
celkovú útratu zákazníčky a podľa prahov v politike priradí úroveň.

- Ručný zámok sa **nikdy** neprepiše.
- Bez nastavenej politiky (prázdne úrovne) sa **nemení nič**.
- Úroveň pod prahom sa odoberie (zákazníčka nemá žiadnu úroveň).
- Idempotentné: útrata sa počíta z objednávok, nie z inkrementálneho počítadla.

### Ceny: iba na serveri (a prečo tak)

Worker je autorita na výpočet ceny. Backend mu posiela iba **kód úrovne** (`customerTier`),
nikdy percentá. Politika (mapa `ZR1..ZR4 → podiel zľavy`) sa do Workera dostáva
podepsaným webhookom `POST /api/nexus/pricing-policy` a ukladá sa do KV tenantu
(`nexus/workers/api/pricing-policy-store.ts`).

**Prečo nie „percentá v požiadavke“:** keby procento prišlo v cenovej požiadavke, backend
by si určoval výši zľavy a politika v `MEDUSA_PRICING_POLICY_JSON` by bola len dekorácia.
Push politiky (podepsaný, jednosmerný) udržuje Worker ako jedinú autoritu a zákazníčka
ani backend si percentá nemôžu poslať. Klient vôbec nepozná, koľko percentá získa –
vidí len výslednú cenu.

**Bezpečný fallback:** bez KV bindingu (alebo bez uloženej hodnoty) Worker použije
`MEDUSA_PRICING_POLICY_JSON` – tú istú tenantskou politiku. Env politika je vždy povinná
(nie sú v nej limity značek a kategorií); z DB sa prepisujú iba `loyaltyTiers`.

Podpis je rovnaký ako pri medusa webhooku (`X-Medusa-Signature: t=<čas>,v1=<hmac>`,
tajomstvo `MEDUSA_WEBHOOK_SECRET`). Cudí tenant, zlá platba aj neplatná mapa sa odmietnu
(fail-closed). KV sa čte s cache 30 s v izolátu.

## Ako to overiť

### Unit testy (backend)

```
cd backend && npm run test:unit
```

- `src/lib/loyalty/__tests__/policy.unit.spec.ts` – validácia zľavy 0–50 %, kód úrovne,
  jedinečnosť, rastúce prahy, výber úrovne podľa útraty, mapa pre Worker, výpočet útraty.
- `src/lib/loyalty/__tests__/settings.unit.spec.ts` – čítanie/zápis politiky v nastaveniach.
- `src/lib/loyalty/__tests__/auto-assign.unit.spec.ts` – automatické priradenie: zámok,
  prázdna politika, pod prahom, bez zmeny.
- `src/lib/nexus/__tests__/loyalty-policy-sync.unit.spec.ts` – podpis, telo, odmietnutie.
- `src/api/admin/nexus/__tests__/*.unit.spec.ts` – auth, validácia, audit, filtre.
- `src/api/store/nexus-cart/__tests__/loyalty-pricing.unit.spec.ts` – košík posiela kód
  úrovne a zľava zodpovedá DB politike.

### NEXUS Worker

```
cd nexus && npm test          # node testy (tests/unit/pricingPolicy.test.ts)
cd nexus && npm run test:workers   # workerd testy (tests/workers/pricingPolicy.test.ts)
```

Workerd testy na tejto macOS verzi nespustia (macOS 12.6 < 13.5 – workerd vyžaduje
13.5+), rovnaké obmedzenie je zapísané v AGENTS.md. Logika je pokrytá aj node testami
(podpis, tenant, limity, fallback, KV).

## Čo treba dorobiť pred produkciou

1. **Env promennej backendu** (na serveri): `NEXUS_PRICING_POLICY_URL` (napr.
   `https://<worker>/api/nexus/pricing-policy`) a `NEXUS_MEDUSA_WEBHOOK_SECRET` (už existuje
   pre medusa webhook). Bez `NEXUS_PRICING_POLICY_URL` sa politika uloží, ale Worker ju
   nepreberie – admin to vidí v `worker_sync.synced === false`.
2. **KV binding Workera**: `wrangler kv namespace create "nexus-pricing-policy-<env>"` a ID
   doplniť do `wrangler.jsonc` (top-level + `env.production` + `env.anastasia-test`) – zatiaľ
   je tam placeholder, takže `wrangler deploy` skončí chybou, kým sa ID nedoplní.
3. **`.env.template`** (integrátor): doplniť `NEXUS_PRICING_POLICY_URL`.
4. Skupinu `Věrnost – ruční zámok` založí bootstrap (`anastasia-bootstrap.ts`) – je
   idempotentný a beží znova bezpečne.
5. **UI administrácie** – podľa `anastasia-admin/HANDOFF-vernostne-urovne.md`.

## Riziká a limity

- **Úroveň vidí cenový adapter zo skupiny.** Ak niekoho zákazníčku ručne vloží do skupiny
  `Gold` priamo v Medusa adminu (mimo našich endpointov), dostane zľavu Gold, ale bez
  ručného zámoku – automatika ju môže prepočítať podľa útraty. Zámok sa dá zapísať cez
  naše API.
- **Útrata sa počíta zo zachytených platieb.** Objednávka zaplatená prevodom sa započíta
  až po zachytení platby (subscriber `payment.captured`).
- **Zmena politiky neprepojí existujúce košíky.** Prepočítanie košíka prebehne pri
  ďalšej interakcii s košíkom (`/store/nexus-cart`), nie okamžite po uložení politiky.
- **`worker_sync.synced === false` nie je chyba uloženia.** Politika zostáva v DB; Worker ju
  preberie pri ďalšom uložení.
- Workerd testy na lokálnom macOS nespustia – overenie je node testami.

## Čo sa NEMENÍ

- Ceny, košík, checkout, platby a SafeOrder – backend im iba posiela kód úrovne.
- Doručovací worker (`nexus/workers/api/routes/mediaDelivery.ts`) a tokeny médií.
- Kód modulu `entitlement` (privatív sa volá, nemení sa).
