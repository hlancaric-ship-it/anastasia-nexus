# X2 — Právne texty (časti A–E z dokumentu klientky)

**Dátum:** 21. 10. 2026 · **Výchozí text:** `ANASTASIA_VOP_GDPR_na_schvalenie (2).docx` (odoslané 21. 10. 2026)

## Zadanie

Klientka poslala jeden dokument s piatimi zverejneniteľnými časťami (A VOP, B reklamačné pravidlá,
C poučenie a formulár na odstúpenie, D ochrana osobných údajov, E cookies) a so šiestou časťou F
(pokyny pre prevádzkovateľa) plus úvodným súhrnom. Texty mali ísť na web 1:1, slovensky, každá časť
na vlastnej stránke; miesta označené `DOPLNIŤ` sa nesmeli zverejniť ako inštrukcia — mali sa
zapísať do `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` a na webe zostať ako placeholder.

## Kde právne texty žijú (mapa pred zmenou)

| Miesto | Čo to je | Zmena |
|---|---|---|
| `storefront-prototype/src/legacy-content.json` | **zdroj pre produkčný web** (Cloudflare Pages, `node storefront-prototype/build.mjs`) — `/vop`, `/reklamacie`, `/gdpr` | 3 stránky prepísané, 2 nové (`/odstupenie`, `/cookies`) |
| `backend/src/lib/content/seed.json` | fallback pre administráciu (backend drží iba zmeny Lucy) | vygenerované zo storefrontu; stránka `global` (menu, pätička, kategórie) **nedotknutá** |
| `backend/src/lib/pages/defaults.ts` | `PAGE_DEFAULTS` – predvolené znenie pre `GET /store/pages/:slug` a „Obnoviť pôvodné“ v admine | 3 znení prepísané, 2 nové; `paticka` dostala odkazy na nové stránky |
| `backend/src/lib/pages/policy.ts` | `PAGE_SLUGS`, popisky stránok, limity dĺžky | 2 nové slugy + popisky, `PAGE_MAX_TEXT` 20 000 → 25 000 |

`legal-middlewares.ts`, modul `legal` (tabuľky `legal_consent`, `newsletter_consent`) ani consent
guard v pokladni **sa nemenili** – verzionovanie zostalo fungovať.

## Rozhodnutia (najnižšie riziko, najmenšia složitosť)

1. **Zdroj pravdy = storefront, nie seed.** Produkčný web sa buildí zo `legacy-content.json`;
   seed je len fallback. Texty som teda vložil do storefrontu a seed z neho vygeneroval
   (`backend/scripts/generate-content-seed.mjs`), aby boli rovnaké.
2. **Globálna stránka seeda sa neprepisala.** Generátor berie kategórie z katalógu vo worktree
   storefrontu, ktorý sa líši od toho, z ktorého bol pôvodný seed. Prepísal by som menu a pätičku,
   čo patrí inému balíku – preto je stránka `global` v seede ponechaná byte-identická.
3. **Písmeno časti (A–E) nie je v nadpise stránky.** Písmená sú značky dokumentu, nie text zákazníka;
   nadpis stránky je názov časti („Všeobecné obchodné podmienky“). Formulácie článkov sú 1:1.
4. **Číslovanie článkov bez bodky.** Dokument má nadpisy typu „1 Predávajúci a kontakty“; layout
   právnych stránok poznal iba „I. …“. Regex v `storefront-prototype/src/legacy.mjs` bol doplnený
   o číslo bez bodky – zmenený je len výkres nadpisu, text je 1:1.
5. **Placeholder `[doplní prevádzkovateľ]`** namiesto celej inštrukcie `DOPLNIŤ …`; presné citácie
   sú v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md`.
6. **Limit dĺžky textu stránky zdvihnutý na 25 000 znakov** (`PAGE_MAX_TEXT`). Nové VOP má ~21 100
   znakov textu; pôvodný limit 20 000 by bránil uložiť stránku v administrácii. Jediný dotknutý
   test (30 000 znakov → zamietnutie) ostáva zelený.
7. **Staré špeciálne správanie reklamácií odstránené.** `/reklamacie` si predtým bral článok VIII
   z VOP; reklamačné pravidlá majú teraz vlastné znenie, preto padol aj odkaz „Úplné znenie“.

## Čo na webe nie je (mimo zadania)

- **Časť F** (pokyny prevádzkovateľovi) – nezverejnená, spracuje sa ako zoznam úloh.
- **Úvodný súhrn „Potvrdené údaje a zostávajúce doplnenia“** – nezverejnený; otvorené body sú
  v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` §2.
- **Cookies lišta (prvý vrstiev)** – text prvého vrstvy je zverejnený ako súčasť stránky
  `/cookies`, ale samotná lišta (uloženie voľby, tlačidlá „Odmietnuť / Nastaviť / Prijať všetky“)
  **v repu nie je** – je to samostatná úloha (pozri `anastasia-admin/GAP-eshop.md`, bod 8).
- **Online funkcia odstúpenia** – VOP aj poučenie na ňu odkazujú; funkcia v repu nie je.
  Bez nej je odkaz v čl. 9.2 neúplný (riadok 2 v `PRAVNE-TEXTY-DOPLNIT.md`).

## Overenie

```
cd backend && npx tsc --noEmit                                   # PASS
cd backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest \
  src/lib/pages src/lib/content src/modules/legal src/api/admin/pages src/api/admin/content \
  --silent --runInBand --forceExit                               # PASS 8 sád / 55 testov
cd storefront-prototype && ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs   # 69 stránok OK
cd storefront-prototype && node --test test/navigation.test.mjs         # PASS 2/2
```

Kontrola textu: rekonštrukcia odstavcov z webu bola porovnaná s prepisom dokumentu po znak –
**zhoda 1:1 vo všetkých piatich častiach** (nadpisy aj odstavce).

## Riziká

- **Placeholder na webe.** Do doplnenia sú na webe 5 miest s `[doplní prevádzkovateľ]`. Pred spustením
  musia ísť preč (klientka ich doplní podľa `PRAVNE-TEXTY-DOPLNIT.md`).
- **Verzie právnych textov.** Nové znenie = nová verzia: `LEGAL_TERMS_VERSION=2026-10-21`,
  `LEGAL_PRIVACY_VERSION=2026-10-21` (a `NEWSLETTER_CONSENT_VERSION`, ak sa zmení text súhlasu
  v newsletteri). Bez nastavenia verzí je checkout bezpečne zablokovaný (503) – to je zamýšľané.
  `.env` sa nemenil, hodnoty sa nastavujú v prostredí (Medusa Cloud).
- **Staré súhlasy v pokladni.** Riadky v `legal_consent` so starými verziami ostanú v DB, ale
  košík vytvorený pred zmenou verzie bude blokovaný (`422 TERMS_NOT_ACCEPTED`), kým zákaznica nové
  znenie znova neodoberie – to je zamýšľané. Mazat ich netreba, automaticky sa prepíšu.
- **Znenie v seed e je fallback.** Ak Lucia v administrácii upravila právny text, táto zmena má
  prednosť pred novým znením – po doplnení treba v administrácii kliknúť „Obnoviť pôvodné“
  alebo prepísať konkrétne polia.
- **Súladnosť mimo právnych textov.** Stránka „Doprava a platba“ v `PAGE_DEFAULTS` stále píše
  o dobierke a o starom znení odstúpenia; nie je súčasťou A–E, nemenil som ju.

## Ďalší krok

1. Klientka doplní body 1–5 v `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` a potvrdi body 6–14.
2. My dosadíme doplnenia, nastavíme verzie `2026-10-21` a overíme súhlas v pokladni.
3. Samostatná úloha: cookies lišta (uloženie voľby + „Nastavenia cookies“ v pätičke) a online
   funkcia odstúpenia – bez nich sú dva body textu klientky neúplné.
