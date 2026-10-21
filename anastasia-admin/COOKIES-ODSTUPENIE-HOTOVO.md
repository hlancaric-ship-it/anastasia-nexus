# Cookies lišta + online odstoupení — HOTOVO

**Dátum:** 21. 10. 2026 · **Vetva:** `release/predani-faze1` (worktree `anastasia-nexus-release`) · **Nič nebolo pushnuté.**
**Prehľad balíka (rozhodnutia, súbory, riziká):** `backend/docs/wp/cookies-odstupenie.md`

---

## 1. Cookies lišta na storefrontu

**Stav: hotovo a overené.**

- Lišta je na **všetkých 69 stránkach** webu (vložená do statického HTML pri builde, skript spravuje
  iba viditeľnosť a uloženie voľby).
- **Text prvej vrstvy je 1:1 z dokumentu klientky** (časť E). Texty sa neprepisujú do kódu ručno –
  lišta ich číta priamo zo znenia stránky `/cookies`, takže nemôžu odísť od dokumentu. Ak v dokumente
  chýba údaj, zostane viditeľný placeholder `[doplní prevádzkovateľ]`.
- **Tri tlačidlá stejnej váhy:** „Odmietnuť voliteľné“ | „Nastaviť“ | „Prijať všetky“ – jedna CSS
  trieda, žiadne zvýraznenie, žiadny predvolený „prijať“.
- **Nevyhnutné vždy** (zaškrtnuté, nedá sa vypnúť); **analytické a marketingové vypnuté**, kým
  zákazník nevyberie.
- **Voľba sa uloží** v prehliadači (`localStorage`) a pretrváva medzi návštevami.
- **Odkaz „Nastavenia cookies“ je v pätičke** na každej stránke; otvorí ten istý panel s
  jednotlivými kategóriami (bez JavaScriptu vedie na stránku `/cookies`).
- **Žiadny skript tretej strany sa pred súhlasom nenačíta.** Web načítal výhradne vlastné súbory.
  Jediný externý skript (Stripe, platobná brána) patrí medzi **nevyhnutné** technológie: načíta sa
  až v pokladni pri výbere platby kartou a **nečaká na rozhodnutie o cookies** (platba kartou sa
  súhlasom nesmie blokovať). Oprava: `anastasia-admin/HANDOFF-stripe-cookies-fix.md`.
- **Mobil 360 px:** lišta zaberá 249 px z 640 px = **38,9 % displeja** (limit 40 % je v CSS:
  `max-height: 40svh`, prípadný prebytok sa listuje vnútri lišty). Obsah sa na 360 × 640 neposúva.

**Rozdiel v názvoch tlačidiel (k rozhodnutiu):** zadanie balíka pomenovalo tlačidlá „Prijať všetko“ /
„Odmietnuť“ / „Nastavenia“, ale **dokument klientky v časti E píše „Tlačidlá: „Odmietnuť voliteľné“ |
„Nastaviť“ | „Prijať všetky““** a odkaz v pätičke má byť „Nastavenia cookies“. Zvolili sme znenie
dokumentu, lebo bod 3 zadania vyžaduje texty 1:1 a stránka `/cookies` by inak o tom istom tlačidle
hovorila inak. Ak má byť inak, zmení sa jedna konštanta v `storefront-prototype/src/cookie-consent.mjs`.

---

## 2. Online odstoupení od smlouvy

**Stav: hotovo a overené (administrácia overená typovo, nie kliknutím v živém adminu).**

- **Formulár** je na stránce `/odstupenie`, hneď za poučením a vzorovým formulárom z časti C.
  Polia: **číslo objednávky, dátum objednávky, položky, e-mail**, voliteľne meno a dôvod,
  povinný súhlas s informací o ochraně osobních údajů. Názvy polí jsou z vzorového formuláře
  klientky („Číslo objednávky“, „Dátum objednávky“, „E-mail na potvrdení prijatia“).
- **Názov funkcie a tlačidla jsou z VOP klientky** (čl. 9.2): „Odstúpiť od zmluvy tu“ a
  „Potvrdiť odstúpenie od zmluvy“.
- **Odeslání vytvoří záznam pro admin** (`legal_contract_withdrawal`) a **potvrzovací e-mail
  zákazníkovi** – podle VOP čl. 9.2 obsahuje obsah oznámení, datum i čas doručení. Zároveň jde
  hlášení správkyni (když je nastaven `CONTACT_NOTIFY_EMAIL`).
- **Přihlášenému zákazníkovi se e-mail a jméno předvyplní z účtu.**
- **Opakované odeslání téhož oznámení nevytvoří druhý záznam ani druhý e-mail.**
- Správce má v administraci novou stránku **„Odstúpenia od zmluvy“** (`/app/odstupenie`):
  zoznam, detail a změna stavu `received → processed → closed` (každá změna je v auditu).
- Odeslání je veřejné (bez přihlášení), chráněné limitem 5 pokusů / 10 min na IP a pastí na roboty.
- **Testovací e-maily jen na `@l-code-dynamics.com`:** mechanizmus už v repu existuje
  (`EMAIL_RECIPIENT_ALLOWLIST`), stačí ho v testovacím prostředí nastavit. `.env` se nemenil.

---

## 3. Texty 1:1 a doplnění

**Texty právních stránek se neměnily** – zůstávají 1:1 s dokumentem klientky. Doplnění je popsáno
v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md`:

| Bod | Změna |
|---|---|
| 2 a 3 (VOP čl. 9.2 a poučení na `/odstupenie`) | online funkcia **už existuje** na `/odstupenie` – treba len rozhodnúť, či do textu napísať konkrétnu adresu |
| 4 a 5 (zoznam cookies a účely voliteľných cookies) | stále chýbajú; **placeholder je teraz viditeľný v živej lište** – doplniť pred spuštěním webu |
| 15 (nový) | názvy voliteľných kategórií v paneli: teraz „Analytické“ a „Marketingové“, dokument hovorí o „analytických a reklamných“ – potvrdiť |
| 16 (nový) | platobná brána Stripe je nevyhnutná technológia – **text časti E sa nemení**, treba iba potvrdiť zaradenie |

---

## 4. Testy a stav

```
cd backend && npx tsc --noEmit                                     # PASS
cd backend && npm run test:unit                                    # PASS 139 sád / 1424 testov
cd backend && python3 scripts/check-admin-function-map.py           # PASS
cd storefront-prototype && ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs   # 69 stránok OK
cd storefront-prototype && node --test test/cookie-consent.test.mjs \
  test/contract-withdrawal.test.mjs test/navigation.test.mjs       # PASS 17/17
```

Nové testy: `storefront-prototype/test/cookie-consent.test.mjs` (7), `storefront-prototype/test/contract-withdrawal.test.mjs` (8),
`backend/src/modules/legal/__tests__/contract-withdrawal.unit.spec.ts` (9) + 2 testy šablón e-mailu.

Ručně ověřeno v prehliadači (Playwright): zobrazení lišty, uloženie voľby, pretrvanie voľby,
otvorenie panelu z pätičky, uloženie kategórií, výška lišty na 360 × 640 (38,9 %), žiadny externý
request pred súhlasom.

**Čo zostalo overiť pri nasazení:** kliknutie v živém adminu (stránka „Odstúpenia od zmluvy“),
spustenie migrácie `Migration20261021100000` (tabuľka `legal_contract_withdrawal`).

**Čo potrebuje od klientky:** doplnenie bodov 1–5 a 15 a 16 v `PRAVNE-TEXTY-DOPLNIT.md`.
