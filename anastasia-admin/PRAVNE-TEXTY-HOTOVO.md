# Právne texty z dokumentu klientky – čo je hotové

**Dátum:** 21. 10. 2026
**Zdroj:** `ANASTASIA_VOP_GDPR_na_schvalenie (2).docx` (odoslané 21. 10. 2026)
**Stav:** hotovo pre časti A–E (5 stránok webu). Doplnenia od klientky sú v `PRAVNE-TEXTY-DOPLNIT.md`.

---

## 1. Čo je na webe teraz

Každá časť dokumentu je vlastná stránka webu, text je **1:1** (overené porovnaním po znak):

| Časť dokumentu | Stránka webu | Adresa | Stav |
|---|---|---|---|
| A Všeobecné obchodné podmienky | VOP | `/vop` | znenie z 21. 10. 2026 (12 článkov) |
| B Reklamačné pravidlá | Reklamačné pravidlá | `/reklamacie` | vlastné znenie (4 časti) – predtým len nadpis |
| C Poučenie a formulár na odstúpenie | Odstúpenie od zmluvy | `/odstupenie` | **nová stránka** (poučenie + vzorový formulár) |
| D Ochrana osobných údajov | Ochrana osobných údajov | `/gdpr` | znenie z 21. 10. 2026 (8 častí) |
| E Cookies a podobné technológie | Cookies | `/cookies` | **nová stránka** (informácia + text prvej vrstvy lišty) |

**Nie je na webe:** časť F (pokyny prevádzkovateľovi) a úvodný súhrn „Potvrdené údaje a zostávajúce
doplnenia“ – ani jedno nie je zákaznícky text.

Staré znenie (s „Pilulka.sk“, „Bonus klubom Pilulka“ a starou legislatívou) je nahradené **všade**:
v obsahu webu, v zadnaniach stránok pre backend, v administrácii aj v prehľade kódu – grep na `pilulka`
v právnych textoch je prázdny.

---

## 2. Čo kam vloženo (súbory)

| Súbor | Zmena |
|---|---|
| `storefront-prototype/src/legacy-content.json` | prepísané bloky stránok `/vop`, `/reklamacie`, `/gdpr`; pridané stránky `/odstupenie` a `/cookies` (nadpisy, odstavce, odkazy na e-mail a web) |
| `storefront-prototype/src/legacy.mjs` | právne stránky v `LEGAL`; nadpisy článkov „1 Predávajúci a kontakty“ (bez bodky) sa vykreslia správne; odstránené predošlé preberanie reklamačných pravidiel z VOP |
| `storefront-prototype/src/dc.mjs` | cesty pre nové odkazy v pätičke (`/odstupenie`, `/cookies`) |
| `storefront-prototype/design/homepage-v2.dc.html`, `design/o-lucii.dc.html` | pätička: odkazy „Odstúpenie od zmluvy“ a „Cookies“ |
| `backend/src/lib/content/seed.json` | vygenerované zo storefrontu (`scripts/generate-content-seed.mjs`) – 2 nové stránky, 3 prepísané; stránka `global` (menu, pätička, kategórie) **nedotknutá** |
| `backend/src/lib/pages/defaults.ts` | predvolené znenie stránok `vop`, `reklamacie`, `gdpr` prepísané, pridané `odstupenie` a `cookies`; pätička má odkazy na všetkých 5 právnych stránok |
| `backend/src/lib/pages/policy.ts` | popisky nových stránok; limit dĺžky textu stránky 20 000 → 25 000 znakov (nové VOP má ~21 100 znakov) |
| `docs/launch/DEPLOY-RUNBOOK-2026-10-23.md` | ku bodu „verzie právnych textov“ doplnené konkrétne hodnoty `LEGAL_TERMS_VERSION=2026-10-21`, `LEGAL_PRIVACY_VERSION=2026-10-21` |
| `backend/docs/wp/pravne-texty.md` | balík dokumentácie (rozhodnutia, overenie, riziká) |
| `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` | 5 doplnení na webe + 5 potvrdení mimo webu + 4 preklepy v zaslanom znení |

**Nemenené (zámerna):** `legal-middlewares.ts`, modul `legal` (tabuľky súhlasov), consent guard
v pokladni, `.env`, `data-private`, `nexus/`, `package.json`, `medusa-config.ts`.

---

## 3. Verzovanie a súhlasy v pokladni (bod 3 zadania)

- Mechanizmus zostal **fungovať bez zmeny kódu**: `GET /store/legal/versions` poskytuje aktuálne
  verzie, checkout si ich načíta, `POST /store/carts/:id/consents` ich uloží spolu s dátumom,
  guard v `requireCheckoutConsent` overí, že súhlas zodpovedá aktuálnej verzii.
- **Nová verzia = nový dátum:** `LEGAL_TERMS_VERSION=2026-10-21`, `LEGAL_PRIVACY_VERSION=2026-10-21`
  (hodnoty nastavuje vlastník v prostredí Medusa Cloud – `.env` sa nemenil).
  `NEWSLETTER_CONSENT_VERSION` sa nemení, kým sa nemení text súhlasu v newsletteri.
- Staré súhlasy v databáze **netreba mazať** – košík vytvorený pred zmenou verzie bude blokovaný
  (`422 TERMS_NOT_ACCEPTED`), kým zákazníčka nové znenie znova neodoberie.

---

## 4. Overenie

```
cd backend && npx tsc --noEmit                                                    # PASS
cd backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest \
  src/lib/pages src/lib/content src/modules/legal src/api/admin/pages src/api/admin/content \
  --silent --runInBand --forceExit                                                # PASS 8 sád / 55 testov
cd storefront-prototype && ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs            # 69 stránok OK
cd storefront-prototype && node --test test/navigation.test.mjs                    # PASS 2/2
```

Kontrola 1:1: text stránok bol porovnaný s prepisom dokumentu odstavec po odstavci – zhoda vo
všetkých piatich častiach. Rozdiel je jediný zámerný: písmeno časti (A–E) nie je v nadpise stránky
a značky `DOPLNIŤ` sú nahradené placeholderom `[doplní prevádzkovateľ]`.

---

## 5. Čo ostáva (a koho to potrebuje)

| # | Úloha | Kto |
|---|---|---|
| 1 | Doplniť 5 miest podľa `PRAVNE-TEXTY-DOPLNIT.md` §1 (splatnosť prevodu, umiestnenie online funkcie odstúpenia, zoznam cookies, účely voliteľných cookies) | klientka |
| 2 | Potvrdiť body 2–5 (zmluvné subjekty, prenosy mimo EHP, držiteľ povolenia, sadzobník dopravy, platené poukazy) | klientka |
| 3 | Rozhodnúť, či opraviť preklepy v zaslanom znení (`PRAVNE-TEXTY-DOPLNIT.md` §3) | klientka |
| 4 | Cookies lišta (uloženie voľby, tlačidlá, „Nastavenia cookies“ v pätičke) – **v repu nie je** | L-Code, samostatná úloha |
| 5 | Online funkcia odstúpenia („Odstúpiť od zmluvy tu“) – **v repu nie je** | L-Code, samostatná úloha |
| 6 | Nastaviť verzie právnych textov v prostredí po doplnení | vlastník / L-Code pri deployi |

Body 4 a 5 sú priamo odporúčané v časti F zadania (bod 2 a bod 1) – bez nich zostávajú dva body
textu klientky neúplné.

---

## 6. Commity

- `95c6df3` **feat(legal): právne texty klientky (časti A–E) na piatich samostatných stránkach** –
  hlavná zmena (storefront, backend, administrácia, runbook, zoznam doplnení).
- nasledujúci commit – tento prehľad (`anastasia-admin/PRAVNE-TEXTY-HOTOVO.md`).

Vetva: `release/predani-faze1` (worktree `anastasia-nexus-release`). **Nič nebolo pushnuté.**
Súbory handoffov (`HANDOFF-*.md`) zostali nezahrozené – nie sú moje.
