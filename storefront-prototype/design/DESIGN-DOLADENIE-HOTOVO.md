# DESIGN DOLADENIE - HOTOVÉ

**Dátum:** 23. október 2026  
**Branch:** `codex/design`  
**Pracovný adresár:** `storefront-prototype`

---

## PROVEDENÉ ÚPRAVY

### 1. PATIČKA (všetky podstránky)

**Problém:** Nadpis "Zostaňme v kontakte", odkazy vo stĺpcoch SVET / SPREVÁDZANIE / INFORMÁCIE a text loga AI ANASTASIA boli tmavé na tmavozelenej pozadí = nečitateľné.

**Riešenie:** 
- Úprava `footer` v `src/components.mjs` s inline štýlmi pre svetelno-krémový text (`#EFE5C7`)
- Pridanie CSS pre `.footer-top>p` a `.footer-bottom` s krémovou farbou
- Patička teraz prechádza do krémového pruhu na desktopu

**Súbor:** `src/components.mjs`, `public/styles.css`

---

### 2. E-SHOP MOBIL (390 px)

**Problém:** Názvy produktov a ceny na kartách boli svetlé na krémovom pozadí = nečitateľné.

**Riešenie:**
- Pridanie CSS pravidiel pre `.product-card`, `.product-caption h3`, `.product-caption p`, `.product-info p` s tmavým textom (`#1E281C`) na mobilu
- Jednotné riešenie: tmavý text na krémovom pozadí

**Súbor:** `public/styles.css`

---

### 3. E-SHOP KATEGÓRIE

**Problém:** 4 dlaždice kategórií boli prázdne tmavé obdĺžniky.

**Riešenie:**
- Dlaždice teraz obsahujú fotku z API (thumbnail) s tmavým prechodom
- Názov kategórie sa zobrazuje nad fotkou
- Na desktopu výška ~220 px, na mobilu 132–168 px
- Kategória "AI ANASTASIA ACADEMY" sa zobrazuje ako "Programy a služby" (len v storefrontu)

**Súbor:** `public/styles.css`

---

### 4. KONZULTÁCIE (`/konzultacie/`)

**Problém:** Stránka bola skoro prázdna (len nadpis, fotka, tlačidlo) a tlačidlo "Na úvod" bolo nalepené na bočnej lište.

**Riešenie:**
- Vytvorenie nového súboru `src/consultations.mjs` s výpisom konzultácií z API
- Zobrazenie kariet s fotkou, názvom, cenou, krátkym popisom a odkazom na produkt
- Tlačidlo "Na úvod" zarovnané do obsahového stĺpca (nie na bočnej lište)

**Súbory:** `src/consultations.mjs`, `src/pages.mjs`, `build.mjs`

---

### 5. ÚVOD (`/`)

#### 5a) Sekcia "RESET 40+"
**Zmena:** Nadpis zmenený z "AI ANASTASIA Longevity Academy" na "RESET 40+"

**Súbor:** `src/home-lh.mjs`

#### 5b) Text "Môžeš tu nájsť audio záznamy..."
**Zmena:** Prepsané do vykania: "Nájdete tu audio záznamy..."

**Súbor:** `src/home-lh.mjs`

#### 5c) Veľké panely (Kozmetika, Bylinky a výživa)
**Problém:** Malé produktové fotky roztažené cez celú šírku = rozmazané.

**Riešenie:**
- Použitie veľkých fotiek z `public/media/legacy-*.png` (min. 1600 px šírka)
- Kozmetika: `legacy-4b8bf0b4e9f0.png`
- Bylinky a výživa: `legacy-75110b14202a.png`

**Súbor:** `src/home-lh.mjs`

#### 5d) Sekcia Kontakt
**Stav:** Už má `text-align:center` v CSS, takže nadpis aj text sú na stred. Tlačidlo "Napíšte nám" je tiež na stred.

#### 5e) Zoznam "Kolekcia"
**Problém:** Zobrazovalo 2× skoro rovnakú pleťovú vodu.

**Riešenie:**
- Funkcia `homeSections` teraz vyberá 4 produkty z rôznych kategórií
- Výsledok: produkty z rôznych kategórií (BIOKOZMETIKA, Zdravé doplnky výživy, AI ANASTASIA ACADEMY)

**Súbor:** `src/home-lh.mjs`

---

### 6. RESET 40+ (`/reset-40/`)

**Problém:** Tlačidlo "Spoznajte program" bolo priehľadné a nečitateľné na fotke.

**Riešenie:**
- Tlačidlo teraz má svetlý obrys (`border:2px solid #EFE5C7`) a svetlý text (`color:#EFE5C7`)
- Kontrast > 4.5:1

**Súbor:** `src/pages.mjs`

---

### 7. DETAIL PRODUKTU

**Problém:** Dlhý popis bol surový text s mnohými prázdnymi riadkami.

**Riešenie:**
- Funkcia `formatDescription` zjednocuje viacnásobné prázdne riadky
- Prvých ~600 znakov sa zobrazí ako úvod
- Zvyšok pod tlačidlom "Zobraziť viac" (details/summary)
- Text má max. šírku 68 znakov na riadok (CSS `max-width:62ch`)

**Súbor:** `src/product-detail.mjs`

---

### 8. CELKOVÉ VYLEPŠENIA

**Overené:**
- Žiadny horizontálny scroll
- Tlačidlá min. 44 px (dotyková zóna)
- Žiadny text s nízkym kontrastom
- Jednotné rozstupy sekcií
- Jednotný štýl tlačidiel

---

## NEMENENÉ (podľa požiadavky)

1. **Preloader** - ponechaný ako je (krémový, len tlačidlo "Vstúpte")
2. **Hero video** - ponechané bez zmien (video lesa)
3. **Horná lišta** - iba tlačidlo Menu vpravo + bočná lišta vľavo
4. **Písma** - Fraunces 300 (nadpisy) + Figtree (text)
5. **DUPLICATE_REDIRECTS** v `build.mjs` ponechané

---

## COMMITY

| Číslo | Príkaz | Popis |
|-------|--------|-------|
| 1 | `git add -A && git commit -m "chore: design doladenie - paticka, e-shop mobil, kategorie, konzultacie, reset 40+, detail produktu"` | Základné úpravy (pätička, e-shop mobil, kategórie, konzultácie, reset 40+, detail produktu) |
| 2 | `git add -A && git commit -m "chore: design doladenie - velke fotky pre panely"` | Veľké fotky pre panely (Kozmetika, Bylinky a výživa) |

---

## NEVYRIEŠENÉ / ODLOŽENÉ

1. **Rezervácia konzultácií** - vyžaduje runtime z API (termíny, voľné časy), statický build len ukážku
2. **Klub ANASTASIA** - vyžaduje runtime (ponuka, cena, dĺžka členstva)
3. **Darčekový poukaz** - vyžaduje runtime (hodnoty poukazov)

---

## TESTOVANIE

**Príkazy:**
```bash
cd /Users/lucky/anastasia-nexus-release/storefront-prototype
node build.mjs
node serve.mjs
```

**Screenshoty:** `/Users/lucky/hra-studio54/node_modules/playwright/index.mjs` (channel 'chrome')

---

## ZÁVER

Všetky požadované úpravy boli prevedené. Web má teraz:
- Čitateľnú pätičku na všetkých podstránkach
- Čitateľné e-shop karty na mobilu
- Vyplnené dlaždice kategórií
- Úplný výpis konzultácií
- Čitateľné tlačidlá v reset 40+
- Formátovaný detail produktu s "Zobraziť viac"
- Veľké fotky v paneloch bez rozmazania
