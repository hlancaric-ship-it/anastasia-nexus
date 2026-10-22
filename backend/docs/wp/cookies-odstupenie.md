# Cookies lišta + online odstúpenie od zmluvy (body 1–4 z `anastasia-admin/HANDOFF-cookies-odstupenie-minimax.md`)

**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1` (worktree `anastasia-nexus-release`) · **Nič nebolo pushnuté.**

## Zadanie

1. Cookies lišta na storefronte podľa časti E právnych textov klientky: nevyhnutné vždy,
   analytické/marketingové len po súhlase (výchozí vypnuté), tri tlačidlá stejnej váhy,
   uloženie voľby + odkaz „Nastavenia cookies“ v pätičke, **žiadny skript tretej strany pred súhlasom**,
   na mobile 360 px lišta nezakrýva viac než 40 % displeja.
2. Online odstúpenie od zmluvy podľa časti C: formulár (číslo objednávky, e-mail, položky, dátum),
   odeslanie vytvorí záznam pre admin + potvrzovací e-mail zákazníkovi (test len na
   `@l-code-dynamics.com`), prihlásenému zákazníkovi sa údaje predvyplnia z účtu.
3. Texty 1:1 slovensky z dokumentu klientky; chýbajúce údaje = placeholder + zápis do
   `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md`.
4. Len relevantné testy; commit len vlastných súborov; žiadny push; žiadny
   `git checkout/reset/stash/clean`; `.env` a `data-private` sa nemenia.

## Čo je hotové

| # | Stav | Kde |
|---|---|---|
| 1 | **VERIFIED** | Cookies lišta + panel nastavení na **všetkých 69 stránkach** webu; texty 1:1 z časti E |
| 2 | **VERIFIED** (backend + storefront), **IMPLEMENTED_UNVERIFIED** (admin UI) | Online odstúpenie od zmluvy: formulár, záznam, potvrdenie e-mailom, zoznam v administrácii |
| 3 | **VERIFIED** | Texty zostali 1:1; placeholders doplnené v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` (body 2, 3, 4, 5 + nový bod 15) |
| 4 | **VERIFIED** | Testy: storefront 17/17, backend 1424/1424, `tsc --noEmit` čistý |

## Kľúčové rozhodnutia (najnižšie riziko, najmenšia složitosť)

1. **Texty lišty sa neprepisujú do kódu ručne.** `storefront-prototype/src/cookie-consent.mjs`
   číta text prvej vrstvy, názvy tlačidiel („Odmietnuť voliteľné“ | „Nastaviť“ | „Prijať všetky“),
   odkaz „Nastavenia cookies“ a popis nevyhnutných technológií **priamo z `legacy-content.json`**
   (stránka `/cookies`, teda z prepisu dokumentu klientky). Ak text v dokumente chýba, build
   spadne – tlačidlo ani text sa nedajú „vymyslieť“ mimo klientkinho dokumentu.
2. **Názvy tlačidiel a odkazu sú z dokumentu klientky, nie z parafrázy zadania.** Zadanie
   pomenovalo tlačidlá „Prijať všetko“ / „Odmietnuť“ / „Nastavenia“; dokument klientky v časti E
   výslovne píše „Tlačidlá: „Odmietnuť voliteľné“ | „Nastaviť“ | „Prijať všetky““ a odkaz
   „Nastavenia cookies“. Priorita je 1:1 text (bod 3 zadania), inak by stránka `/cookies` a lišta
   hovorili o rovnakom tlačidle dvoma spôsobmi. **Rozdiel je zapísaný v prehľade
   `anastasia-admin/COOKIES-ODSTUPENIE-HOTOVO.md`** – ak má byť inak, zmení sa jedna konštanta
   v `src/cookie-consent.mjs`.
3. **Tri tlačidlá majú jednu CSS triedu** (`.cookie-btn`) – žiadne zvýraznenie, žiadny
   predvolený „Prijať všetky“. Rovnaká váha je overená testom aj meraním v prehliadači.
4. **Voliteľné kategórie sú vypnuté od začiatku** a uložená voľba sa číta z `localStorage`
   (`anastasia.consent`). Kým zákazník nerozhodne, `anastasiaConsent.granted()` vracia `false`
   pre všetko okrem „necessary“ – voliteľný skript sa nenačíta.
5. **Stripe (jediný skript tretej strony) je nevyhnutná technológia a nečaká na súhlas.**
   `loadStripeScript()` v `public/app.mjs` načíta `https://js.stripe.com/v3` až v pokladni pri výbere
   platby kartou (nie skôr a nikde inde na webe). Súhlas s cookies sa pri platbe **nevyžaduje** a
   platba sa ním **nesmie blokovať** – oprava z `anastasia-admin/HANDOFF-stripe-cookies-fix.md`
   (blokovanie bolo odstránené 21. 10. 2026 večer).
6. **Limit 40 % displeja je v CSS, nie v heuristike:** `max-height:40vh` + `max-height:40svh`
   (menšia z dvoch hodnôt, bezpečnejšie pri adresnom riadku prehliadača) + `overflow-y:auto`.
   Overené v prehliadači na 360×640: lišta = 249 px = **38,9 %** displeja, obsah sa neposúva.
7. **Záznam odstúpenia je v module `legal`** (`legal_contract_withdrawal`), nie v novom module:
   registrácia nového modulu by si vyžadovala zmenu `medusa-config.ts`, ktorý je podľa pravidiel
   v `AGENTS.md` mimo vlastných súborov. Modul `legal` už vlastní súhlasy a odstúpenia.
8. **Opakované odoslanie toho istého oznámenia nevytvorí druhý záznam.** Zložením údajov sa
   počíta `fingerprint` (sha256 z čísla objednávky, e-mailu, položiek a dátumu); nad ním je
   unikátny index. E-mail ide s `idempotency_key`, takže sa nedvíja.
9. **Potvrdenie doručenia je `required: true`** (v adminu sa nedá vypnúť) – VOP čl. 9.2 sľubuje
   zákazníkovi potvrdenie na trvanlivom médiu. Obsahuje obsah oznámenia, dátum aj čas doručenia.
10. **Testovanie e-mailov:** `EMAIL_RECIPIENT_ALLOWLIST=@l-code-dynamics.com`. Mechanizmus je
    už v repozitári (provider `notification-zeptomail`/`notification-resend`), zapína sa
    premennou prostredia; v produkcii bez tejto premennej sa obmedzenie neuplatňuje.
    `.env` sa nemenil (nesmiem doňašať).

## Súbory

### Storefront
| Súbor | Zmena |
|---|---|
| `storefront-prototype/src/cookie-consent.mjs` | **nový** – texty 1:1 z `/cookies` + markup lišty a panelu nastavení |
| `storefront-prototype/public/consent.mjs` | **nový** – uloženie voľby (`localStorage`), brána `requireDecision()`, ovládanie UI, `anastasiaConsent.on()` pre budúce voliteľné skripty |
| `storefront-prototype/src/withdrawal.mjs` | **nový** – formulár online odstúpenia (názvy polí z vzorového formuláru klientky) |
| `storefront-prototype/public/withdrawal-form.mjs` | **nový** – logika formulára (predvyplnenie z účtu, odoslanie, hlásenie); testovateľná bez prehliadača |
| `storefront-prototype/build.mjs` | lišta a panel vložené do každej stránky |
| `storefront-prototype/src/dc.mjs` | odkaz „Nastavenia cookies“ v pätičke |
| `storefront-prototype/src/legacy.mjs` | formulár vložený za právny text stránky `/odstupenie` |
| `storefront-prototype/public/app.mjs` | inicializácia súhlasu pred pripojením k obchodu, brána pre Stripe, odoslanie formulára, predvyplnenie z účtu |
| `storefront-prototype/public/styles.css` | štýly lišty, panelu a formulára |
| `storefront-prototype/src/lib/api/http.mjs`, `src/lib/api/mock.mjs`, `src/lib/api/index.mjs` | `sendContractWithdrawal()` (http + mock + radenie zápisov) |
| `storefront-prototype/test/cookie-consent.test.mjs` | **nový** – 7 testov |
| `storefront-prototype/test/contract-withdrawal.test.mjs` | **nový** – 8 testov |

### Backend
| Súbor | Zmena |
|---|---|
| `backend/src/modules/legal/models/legal-contract-withdrawal.ts` | **nový** – model `legal_contract_withdrawal` |
| `backend/src/modules/legal/migrations/Migration20261021100000.ts` | **nový** – tabuľka + indexy |
| `backend/src/modules/legal/service.ts` | `requestContractWithdrawal()`, `transitionContractWithdrawal()` |
| `backend/src/modules/legal/policy.ts` | `assertContractWithdrawalTransition()` |
| `backend/src/api/store/contract-withdrawal/route.ts` | **nový** – verejná trasa (záznam + potvrdenie e-mailom) |
| `backend/src/api/store/contract-withdrawal/policy.ts` | **nový** – validácia formuláru, fingerprint, pasca na roboty |
| `backend/src/api/admin/contract-withdrawals/route.ts` | **nový** – zoznam |
| `backend/src/api/admin/contract-withdrawals/[id]/route.ts` | **nový** – detail + zmena stavu s auditom |
| `backend/src/api/legal-middlewares.ts` | limit podľa IP (5/10 min) pre verejnú trasu, prihlásenie správcu pre admin trasy |
| `backend/src/modules/notification-zeptomail/templates.ts` | šablóny `contract-withdrawal-received-sk` (zákazník, `required`) a `contract-withdrawal-admin` (správca) |
| `backend/src/admin/routes/odstupenie/page.tsx` | **nový** – zoznam v administrácii + zmena stavu |
| `backend/src/modules/legal/__tests__/contract-withdrawal.unit.spec.ts` | **nový** – 9 testov |
| `backend/src/modules/notification-zeptomail/__tests__/template-texts.unit.spec.ts` | aktualizovaný zoznam povinných šablón + 2 nové testy |
| `backend/docs/wp/admin-function-map.json` | 3 nové trasy, nový model, nový test (kontrola `scripts/check-admin-function-map.py`) |
| `backend/docs/API-KATALOG.md` | 3 nové trasy, nový model, opravené počty (katalog bol neaktuálny: 104 → 114 súborov) |

## Ako to funguje

**Cookies:** pri načítaní stránky `initCookieConsent()` (beží pred pripojením k obchodu) zistí,
či je v `localStorage` uložená voľba. Nie je → zobrazí sa lišta (text klientky, tri tlačidlá
stejnej váhy). „Nastaviť“ (v lište aj v pätičke) otvorí panel s tromi kategóriami: Nevyhnutné
(vždy zapnuté, nedá sa vypnúť), Analytické a Marketingové (výchozí vypnuté). „Uložiť nastavenia“,
„Odmietnuť voliteľné“ a „Prijať všetky“ uložia voľbu a zavriu panel. Odkaz v pätičke vedie na
stránku `/cookies` (bez JavaScriptu) a otvorí panel (s JavaScriptom).

**Odstúpenie:** formulár na `/odstupenie` (číslo objednávky, dátum objednávky, položky, e-mail,
meno, voliteľný dôvod, súhlas s informáciou o súkromí) → `POST /store/contract-withdrawal`
(limit 5 pokusov / 10 min podľa IP, pasca na roboty) → záznam `legal_contract_withdrawal`
(pre správcu) + e-mail zákazníkovi `contract-withdrawal-received-sk` (obsah oznámenia, dátum
a čas doručenia) + e-mail správkyni `contract-withdrawal-admin` (ak je nastavený
`CONTACT_NOTIFY_EMAIL`). Správca vidí záznamy v administrácii (`/app/odstupenie`) a posúva stav
`received → processed → closed` (každá zmena v audite).

## Overenie

```
cd backend && npx tsc --noEmit                                     # PASS (bez výstupu)
cd backend && npm run test:unit                                    # PASS 139 sád / 1424 testov
cd backend && python3 scripts/check-admin-function-map.py           # PASS 54 features, 114 custom routes
cd storefront-prototype && ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs   # 69 stránok OK
cd storefront-prototype && node --test test/cookie-consent.test.mjs test/contract-withdrawal.test.mjs test/navigation.test.mjs  # PASS 17/17
```

Overené v prehliadači (Playwright, 360×640 a 1280×900):

- lišta sa zobrazí na prvej návšteve, po „Odmietnuť voliteľné“ zmizne a voľba je uložená;
- po obnovení stránky sa lišta nezobrazí (voľba pretrváva);
- odkaz v pätičke otvorí panel, políčka voliteľných kategórií sú nezaškrtnuté, „Uložiť nastavenia“
  uloží len to, čo zákazník zapnul;
- lišta zaberá 249 px z 640 px = 38,9 % displeja, obsah sa neposúva;
- pri načítaní stránky nie je žiadny externý request (skript tretej strany sa nenačíta).

## Riziká

- **Placeholder je viditeľný návštevníkovi.** Body 4, 5 a 15 v `PRAVNE-TEXTY-DOPLNIT.md` sú otvorené;
  kým sa nedoplnia, lišta ukazuje `[doplní prevádzkovateľ]`. **Pred spustením webu treba doplniť
  zoznam cookies a účely voliteľných kategórií.**
- **Voliteľné kategórie nemajú podklad.** Kým nie je známy zoznam cookies, kategórie „Analytické“
  a „Marketingové“ sú prázdne (placeholder). Ak web používa iba nevyhnutné technológie, treba
  lištu prejsť na informačnú (dokument klientky to v časti E výslovne povoľuje).
- **Nová tabuľka vyžaduje migráciu.** `Migration20261021100000` v module `legal` sa musí spustiť
  pred nasadením trasy (medusa db:migrate). Bez tabuľky trasa vráti 503.
- **Platie kartou už nečaká na rozhodnutie o cookies.** Opravené 21. 10. 2026 večer: platobná brána
  Stripe je nevyhnutná technológia, načíta sa v pokladni pri výbere platby kartou a platba sa
  súhlasom s cookies neblokuje. Zostáva otvorené: zaradenie Stripe medzi nevyhnutné technológie
  treba potvrdiť s klientkou (`PRAVNE-TEXTY-DOPLNIT.md`, bod 16).
- **Admin UI nebola overená za behu** (backend s databázou v tejto úlohe nebežal) – typovo a prehliadačom
  je skompilovaná (`tsc --noEmit` čistý), ale kliknutie v živom adminovi overiť treba pri nasadení.
- **Formulár nesúvisí s objednávkou v databáze.** Zákazník píše číslo objednávky ručne (môže byť
  aj hostiteľský kód); server ich nesporovúva s objednávkou v `order`, aby fungoval aj pre
  zákazníka bez účtu. Správca overí číslo pri spracovaní záznamu.
- **Starý kanál odstúpenia zostáva.** `POST /store/withdrawals` (prihlásený zákazník, 14 dní)
  beží ďalej; ide o iný tok (položky z konkrétnej objednávky), obidva zapisujú do `legal` modulu.

## Ďalší krok

1. Klientka doplní body 1–5, 15 a 16 v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md`.
2. V prostredí: `EMAIL_RECIPIENT_ALLOWLIST=@l-code-dynamics.com` (test) a `CONTACT_NOTIFY_EMAIL`
   (adresát hlásenia o odstúpení), potom spustiť migráciu `medusa db:migrate`.
3. Ručne overiť v živom adminovi zoznam odstúpení a platbu kartou v pokladni (bez kliknutia na lištu cookies).
