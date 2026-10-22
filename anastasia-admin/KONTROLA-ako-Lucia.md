# Kontrola administrácie „ako Lucia“

Prechod celou administráciou `anastasia-admin/` z pohľadu bežnej obsluhy, ktorá
denne vybavuje objednávky. Zámer: v administrácii nesmie zostať nič, čo vyzerá ako
nedokončené — prázdne obrazovky bez vysvetlenia, anglické texty, technické chyby
ukázané používateľovi ani tlačidlá, na ktoré sa nedá kliknúť.

**Stav: VERIFIED** (k 21. 10. 2026) — prechod aj opravy overené v lokálnej stavbe
proti testovaciemu API (`https://anastasia-test-api.l-code-dynamics.com`).
Administrácia nasadená nie je (nasadenie je blokované v tomto prostredí).

---

## 1. Ako sme kontrolovali

| Krok | Postup | Výsledok |
|---|---|---|
| Prechod | 45 obrazoviek (menu, záložky, detaily, prázdne stavy) cez prehliadač | 45/45 obrazoviek prečítaných, 0 neprečítaných |
| Tlačidlá | kliknutie na exporty, kopírovanie, hľadanie, prehliadku, stiahnutie QR | 8/8 tlačidiel funguje |
| Texty | automatický sken celej administrácie na angličinu a na ženský rod | 0 anglických textov v UI, 0 ženských tvarov |
| Konzola | zachytávanie chýb v konzole pri každej obrazovke | 0 chýb v konzole (okrem 404 odpovedí API, ktoré sú ošetrené) |
| Testy | 9 existujúcich skriptov + 2 nové Luciine kontroly + 1 nový regresný test | 157 kontrol PASS / 0 FAIL |

Rozsah kontroly: iba `anastasia-admin/*`. Backend, checkout, platby a
`protected-media` sa nemenili.

---

## 2. Čo sme opravili

### 2.1 SVG v knižnici médií (backend `image/svg+xml` odmieta)

| Miesto | Predtým | Teraz |
|---|---|---|
| Výber súborov v knižnici médií | `accept="…image/avif,image/svg+xml"` | `accept="…image/avif"` |
| Klientská kontrola typu | prepustila `svg+xml` | SVG sa odmietne |
| Chybová hláška | „povolené sú obrázky (JPG, PNG, WebP, GIF, AVIF, SVG) do 12 MB“ | „povolené sú obrázky (JPG, PNG, WebP, GIF, AVIF) do 12 MB“ |

Nahrávanie obrázka k produktu (JPG, PNG, WebP) bolo bez SVG už správne.
Stiahnutie QR kódu vo formáte SVG zostalo — to nie je nahrávanie súboru, ale QR kód,
ktorý si server vygeneruje.

Regresný test: `anastasia-admin/test/media-upload-accept.mjs` (8 kontrol).

### 2.2 Technické chyby ukázané používateľovi

Dotaz `GET /admin/… → 404` sa doteraz zobrazil na obrazovke doslova. Teraz používateľ
uvidí vecný text a technický detail ide len do konzoly (aby sa dal poslať podpore).

| Kde | Predtým | Teraz |
|---|---|---|
| Stránky a texty, Médiá, Šablóny odpovedí, Vernostné úrovne | „GET /admin/content → 404“ | „Táto časť administrácie zatiaľ nie je dostupná. Skúte to neskôr alebo to oznámte podpore.“ |
| Chyba 403 | surový kód | „Na túto časť nemáte prístup.“ |
| Chyba 5xx | surový kód | „Server momentálne neodpovedá. Skúte to o chvíľu.“ |

### 2.3 Zoznam produktov bol úplne rozbité

`/admin/product-catalogue` (filter digitálnych produktov) na testovacom API nie je
nasadený — obrazovka Produkty končila chybou a zákazník ani správca si produkty
nemohli otvoriť. Doplnili sme záložný zdroj: keď katalóg neodpovie, zoznam sa načíta
z natívneho `/admin/products`. Obrazovka funguje v oboch prípadoch, v záložnom režime
hlási, že filter typu zatiaľ nefunguje, a stĺpec „Typ“ ukazuje pomlčku.

### 2.4 Záložky v časti Konzultácie nepreklikávali obsah

Kliknutie na „Typy konzultácií“ alebo „Dostupnosť“ nič nemenilo — obsah zostal
na zozname rezervácií. Príčina: obsluha stavových záložiek bola naviazaná na všetky
tlačidlá v hornej lište a prepísala aj záložky časti. Po oprave sa prepína medzi
Rezerváciami, Typmi konzultácií a Dostupnosťou.

### 2.5 Prázdne stavy bez vysvetlenia

| Obrazovka | Teraz |
|---|---|
| Konzultácie | „Zatiaľ tu nie sú žiadne konzultácie. Ako pridáte typy konzultácií a voľné termíny, rezervácie sa zobrazia tu.“ |
| Správy | „Zatiaľ tu nie sú žiadne konverzácie. Keď zákazník napíše z účtu na webe, správa sa zobrazí tu.“ |
| Darčekové poukazy | „Zatiaľ neboli vydané žiadne darčekové poukazy. Po kúpe poukazu sa tu objaví.“ |
| Newsletter | „Zatiaľ sa nikto neprihlásil na newsletter. Prihlásenia pribudnú, keď niekto vyplní formulár na webe.“ |
| Zákazníci | „Zatiaľ žiadni zákazníci“ (namiesto „Žiadne zákazničky“) |

### 2.6 História zmien vyzerala ako surový kód

Stĺpec „Čo“ ukazoval JSON (`theme: {"to":{"accent":"#d5ba81",…}}`) a „Kto“ technické
ID. Teraz sa zobrazí vecný popis („farby: bočný panel #203b32 → #000000, akcent …“,
„farby administrácie“) a meno aktéra („správca“, „systém“).

### 2.7 Ďalšie technické zvyšky v texte

| Predtým | Teraz |
|---|---|
| „Návrh dátového modelu je v `backend/docs/wp/ambasador-faza2.md`“ | „Návrh dátového modelu máme pripravený, režim zapneme v druhej fáze.“ |
| „Jadro nepustí viac, než bolo poukazom zaplatené.“ | „Systém nepustí vrátiť viac, než bolo poukazom zaplatené.“ |
| „Východzí je zelený motív ANASTASIA.“ | „Východzí je motív ANASTASIA v teplých farbách s bordó a zlatou.“ |
| „Platobná karta – Klub“ (v platbách) | „Platobná karta“ |

### 2.8 Jazyk a gramatika

Prešli sme celou administráciou a opravili zvyšky pojednávky na rod zákazníka
(mužský rod sa používa všade — admin, nápoveda, dokumenty):

- „Ak zákazník **zaplatila** objednávku poukazom, vrátite sumu späť na **jej** poukaz.“
  → „Ak zákazník zaplatil objednávku darčekovým poukazom, môžete sumu vrátiť späť na jeho poukaz.“
- „Čo zákazník **objednala**“ → „Čo zákazník objednal“
- „podľa celkovej útraty **zákazníci**“ → „podľa celkovej útraty zákazníka“
- „Hľadať zákazničky“ → „Hľadať zákazníkov“ v hľadacom poli, „Načítavam zákazníkov“,
  „Označení zákazníci: 3“, „Zatiaľ žiadni zákazníci“
- „Ako by ste chceli text čítať zákazník“ → „Ako by ste chceli, aby si text čítal zákazník“
- V českom akceptačnom dokumente `zákaznice` → `zákazníka` / `zákazníků`

Prihlasovacia obrazovka: text „správy od zákazníkov“ má rovnakú dĺžku ako pôvodný
reťazec (iba iné písmeno), rozloženie zostalo pixelovo rovnaké — overené meraním
výšky bloku (47 px, dva riadky).

### 2.9 Klub

Klub sme nenašli nikde v administrácii:

- v hlavnom menu (10 sekcií) ani v bočnom vyhľadávaní,
- v nápovede (22 návodov),
- v časti Doprava a platby (odstránený z názvu platobnej metódy).

Cesta `#/klub` po pokuse vedie na Prehľad, nič sa nerozbije.

---

## 3. Čo zostalo otvorené (mimo administrácie)

| Vec | Prečo | Kto to vyrieši |
|---|---|---|
| Stránky a texty, Médiá, Šablóny odpovedí, Vernostné úrovne hlásia „Táto časť administrácie zatiaľ nie je dostupná“ | ich trasy v jadre (`/admin/pages`, `/admin/media`, `/admin/content`, `/admin/chat/templates`, `/admin/nexus/loyalty-policy`) nie sú na testovacom API nasadené | nasadenie backendu |
| Filter „Digitálne / Fyzické“ v produktoch | v záložnom režime zoznamu typ produktu nepoznáme, stĺpec ukazuje pomlčku | nasadenie `/admin/product-catalogue` |
| ID zákazníka v zozname (`cus_01M5DV…`) | ponechané zámerne — je to jednotné ID zákazníka, ktoré potrebujete pri komunikácii s podporou; je v stĺpci označenom „ID“ | — |
| Prístup pre dvoch alebo viac správcov (2FA, roly) | potrebuje zmeny v `medusa-config.ts`, ktorý patrí inému vlastníkovi | vlastník `medusa-config.ts` |

---

## 4. Ako si to overiť

```bash
# 1) regresný test proti SVG v nahrávaní
node anastasia-admin/test/media-upload-accept.mjs
# → {"checks":8,"status":"PASS"}

# 2) lokálna stavba administrácie proti test API
cd anastasia-admin
ANASTASIA_API_ORIGIN=https://anastasia-test-api.l-code-dynamics.com node build.mjs

# 3) prehliadačové testy (9 skriptov) — 141 kontrol
#    test-print, test-p1, test-p2, test-voucher, test-produkty,
#    test-content, test-akceptace, test-loyalty, test-qr-print

# 4) Luciine kontroly — 16 kontrol
#    test-lucia.mjs (prepínanie záložiek, záložný zoznam produktov,
#                     žiadne technické chyby, história bez JSON)
#    test-lucia-buttons.mjs (exporty, hľadanie, kopírovanie, prehliadka,
#                             rozloženie prihlasovacej obrazovky)
```

Výsledok: **157 kontrol PASS / 0 FAIL** (141 existujúcich + 16 nových) a 8 kontrol
v regresnom teste nahrávania.

---

## 5. Čo sa nemenilo

- Bez nasadenia (`wrangler deploy` je v tomto prostredí blokovaný).
- Bez zmien v `backend/src`, `medusa-config.ts`, checkoute, platbách a `protected-media`.
- Bez zmien v prihlasovacej obrazovke a v bočnom panely (len rod tvaru v texte, rovnaká dĺžka).
- Bez pushu — zložené lokálne do vetvy `release/predani-faze1`.
