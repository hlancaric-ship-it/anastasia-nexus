# Zadání: dárkový poukaz + příprava ambasadorského režimu (Luckyho pokyn 21. 10.)

Architektura (závazné): všechny funnely a ostatní stránky (Reset 40+, Zdravý svet, AI ANASTASIA, konzultace…) mají JEDNU společnou administraci a JEDNO jádro (Medusa + NEXUS). Všechny nákupy vedou na tento web (storefront ANASTASIA). Nic nezakládej jako samostatný systém.

## 1. Dárkový poukaz – design (admin i storefront)
- Najdi existující dárkové poukazy (produkt „Darčekový poukaz“ / gift-voucher moduly, subscribery `gift-voucher-*`) a jejich hodnoty. Hodnoty nevymýšlej, použij ty, co jsou.
- Navrhni elegantní design poukazu v brandu ANASTASIA: logo ANASTASIA OZ (z `storefront-prototype/public/media`), krémový papír, zlatá linka a bordó akcent, hodnota velkým EB Garamond (jen číslice), texty Outfit, kód poukazu, platnost, „Darčekový poukaz“.
- Výstupy:
  a) **Storefront** (worktree `~/anastasia-nexus-codex-storefront-design`, dělá MiniMax storefront): stránka `/darcekovy-poukaz` – náhled poukazu podle zvolené hodnoty, vrátit do menu i obchodu (teď je skrytý), nákup přes standardní košík.
  b) **Admin** (MiniMax admin): v detailu poukazu/objednávky náhled poukazu + tisk/PDF (stejný `print.mjs` přístup) a e-mail s poukazem pro obdarovanou (šablona v E-mailoch).
- Ceny a platnost kódu ověřuje jen backend.

## 2. Ambasadorský režim – Fáze 2, jen připravit v adminu
- Nová sekce v adminu „Ambasádori“ s označením „Fáza 2 – pripravujeme“: přehled ambasadorů (jméno, e-mail, kód/odkaz, provize %, obrat, stav), detail ambasadora a nastavení provizí – zatím jen UI nad prázdnými daty + návrh datového modelu v `docs/ambasador-faza2.md` (affiliate odkaz → kupón/atribuce objednávky → provize → výplata; vše ve stejném jádru).
- Žádné zapnutí na webu, žádná platba provizí.

## 3. AI ANASTASIA na storefrontu
- Zatím nepředělávat (bude předělávka později). Jen ověř, že stránka nemá „fáza 2“ texty a odkazy fungují.

Commit do své větve, NEPUSHOVAT, testy zelené, krátké shrnutí.
