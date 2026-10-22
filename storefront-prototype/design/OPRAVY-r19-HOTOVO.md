# OPRAVY r19 – HOTOVO (právne stránky, cookie lišta, odstúpenia)

Zdroj: `~/anastasia-nexus-release` (vetva `release/predani-faze1`, commity `95c6df3`, `066df73`,
`8966bc2`, `b76f615`, `5731de9`) – čítané cez `git show`, v tomto repo nič zmenené.

## 1. Právne stránky (bod 1)

Texty sú **1:1 zo zdroja** (`src/legacy-content.json` z release větve – vrátane úprav `/vop`,
`/reklamacie`, `/gdpr` a nových `/cookies`, `/odstupenie`). Vlastné texty ani formulácie neboli
vymyslené; placeholdery klientky (`[doplní prevádzkovateľ]`) zostali v znení.

Vzhled je náš autorský (`.legal-*` štýly z r12–r17: Fraunces/Figtree, textová mierka 62 ch,
pastelová paleta `#fbf8ef`/`#3c4532`/`#C9A355`, žiadne bordó). `/vop`, `/gdpr`, `/reklamacie`,
`/odstupenie` a `/cookies` sú v `LEGAL` (`src/legacy.mjs`) → kreslia sa ako právne stránky
s obsahom, prehľadom článkov a návratovou tlačidlom.

## 2. Cookie lišta (bod 2)

- Lišta prvej vrstvy + panel „Nastavenia cookies“ sú v každej stránke (build injectuje
  `cookieConsent()`), texty sú doslovne z oddielu „Text prvej vrstvy lišty“ stránky `/cookies`.
- Tri tlačidlá rovnakej váhy: **Odmietnuť voliteľné | Nastaviť | Prijať všetky** (názvy z dokumentu).
- Nevyhnutné kategórie sú vždy zapnuté a vypnuté voliteľné (analytické, marketingové) ostávajú
  vypnuté, kým zákazník nevyberie; voľba je v `localStorage` (`anastasia.consent`).
- Odkaz „Nastavenia cookies“ je v pätičke každej stránky (`cookieSettingsLink()`).
- **Stripe.js je nevyhnutná technológia**: načíta sa až v pokladni pri výbere platby kartou,
  súhlas s cookies sa pri platbe **nevyžaduje** (v `app.mjs` nie je žiadne `requireDecision()`
  ani hlásenie „dokončite nastavenia cookies“). Pred rozhodnutím sa nenačíta žiadny skript tretej strany.

## 3. Online odstúpenie od zmluvy (bod 3)

- Formulár na `/odstupenie` (pod právnym textom): číslo objednávky, dátum, položky, e-mail, meno,
  dôvod, súhlas s informáciami o GDPR, tlačidlo **„Potvrdiť odstúpenie od zmluvy“** + pasca proti botom.
- Odoslanie: `POST /store/contract-withdrawal` (adaptér `sendContractWithdrawal` v `src/lib/api/http.mjs`,
  zapísané v množine mutácií, v mocku vracia potvrdzovaciu hlášku).
- Chybové stavy: hlásenie v `.form-status` (`data-state="ERROR"`), validácia prekrytia polí,
  tlačidlo sa počas odosielania vypne; prihlásenému zákazníkovi sa predvyplní e-mail a meno.
- Texty prvého vrstvy lišty aj formulára sú slovenské (bloky `data-sk-only`), EN/RU ich nemenia.

## 4. Lišta vs. úvod a bočná lišta (bod 4)

- Na úvode webu sa lišta cookies **neobjaví** – počká na koniec úvodu (`lh-chrome-in`) alebo na
  prvý scroll. Vtedy sa objaví plynule (`animation: cookie-banner-in .4s`).
- Keď je vidieť bočná lišta, lišta cookies sa posunie za ňu (`body.lh-chrome-in .cookie-banner{left:var(--rail-pad)}`),
  neprekrývajú sa. Obsah sa neposkakuje – `padding-bottom` sa nastaví podľa výšky lišty.
- Mobil 360–430 px: lišta max. **40 % displeja** (`max-height:40vh/40svh`, prebytok sa listuje vnútri),
  tlačidlá **44 px**, bez vodorovného pretekania.

| Viewport | lišta | % displeja | tlačidlá | pretekanie |
|---|---|---|---|---|
| 1440×900 | viditeľná, 162 px | 18 % | 44 px | nie |
| 1920×1080 | viditeľná, 162 px | 15 % | 44 px | nie |
| 390×844 | viditeľná, 230 px | 27 % | 44 px | nie |

## 5. Odkazy v pätičke (bod 5)

Pätička má teraz všetkých päť stránok: **Obchodné podmienky** (/vop), **Súkromie a GDPR** (/gdpr),
**Reklamácie** (/reklamacie), **Odstúpenie od zmluvy** (/odstupenie), **Cookies** (/cookies)
+ **Nastavenia cookies** (otvorí panel).

## 6. Overenie

- Testy: `ANASTASIA_OFFLINE_FIXTURES=1 node --test --test-timeout=90000 test/*.test.mjs` → **98/98 pass**
  (pribudli testy `cookie-consent.test.mjs`, `contract-withdrawal.test.mjs`,
  `browser-checkout-stripe.mjs` z release větve; `cookie.test.mjs` prepracovaný na nové správanie).
- QA crawler všetkých 71 rout + 404 na 360/390/430 px, DPR 3 → **„OK: žádné chyby“**.
- Build: 71 statických strán (pribudli `/cookies` a `/odstupenie`).
- Screenshoty: `~/.claude/jobs/8ebf6c40/tmp/r19-*.png`
  (`r19-1440/1920/390-uvod-home`, `r19-*-lista-home`, `r19-1440/1920/390-vop|reklamacie|odstupenie|gdpr|cookies`).

## 7. Pri okolí

- Mobilná hlavička po úvode: logo v hlavičke už nezachádza do druhého riadka (grid
  `auto minmax(0,1fr) auto`) – inak „KOŠÍK“ skončil pod logom.
- Seed pre testy (`test/fixtures/content-seed.json`) je zlúčený: domovská stránka z nášho dizajnu
  + právne stránky z release větve.
