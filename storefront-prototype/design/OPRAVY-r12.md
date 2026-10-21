# Opravy r12 – z testu Luckyho na telefonu (21. 10. 14:35)

Priorita shora dolů. Vše ověř headless na 360, 390, 430 a 1440 (screenshoty do tmp, žádné přetékání do strany).

1. **Navigace v hero na mobilu chybí** – po načtení úvodní stránky (SVG maska ANASTASIA) není vidět hlavička ani menu.
   Chceme jako leilsaunas.com: tenká fixní hlavička vždy viditelná i nad hero intrem
   (vlevo logo ANASTASIA, vpravo košík + pilulka „Menu“), na tmavém videu světlá, na krémovém pozadí tmavá.
   Menu otevřené = celoobrazovkový panel přes celý displej, vše na jeden displej bez scrollu.
2. **Úvod na mobilu – NOVÉ ZADÁNÍ od Luckyho (nahrazuje původní bod 2)**
   a) **Na mobilu (≤ 768 px nebo pointer:coarse) žádné scrollem řízené intro.** Dokud intro běží, stránka se nescrolluje
      (zamknout html/body + Lenis stop). Jediná jasná akce = velké tlačítko **„Vstúpte“** (+ malá ikona zvuku).
      Text „alebo posuňte“ a kolečko myši na mobilu skrýt.
      Po tapnutí na Vstúpte se timeline přehraje sama (cca 3–4 s): slovo ANASTASIA se celé projede/přiblíží do videa,
      pak „Vitajte“, pak „Zdravý svet“ + CTA. Potom odemknout scroll, hero zůstane ve finálním stavu a pod ním normální stránka.
      Desktop zůstává se scroll-scrubem jako teď.
   b) **Slovo ANASTASIA na skutečném telefonu není vůbec vidět** (headless na 390 je vidět, na Androidu ne).
      Podezření: obří maska (rect 13440×12900 v jednotkách viewBoxu) × DPR 3 přesáhne GPU limit a maska se nevykreslí.
      Na mobilu zmenši oblast masky na rozumnou velikost (zoom řeš transformem skupiny, ne obří plochou), testuj
      s deviceScaleFactor 3 a Android UA. Navíc písmena musí být kontrastní i na světlých záběrech: tmavší tint pod maskou
      na mobilu (~.6) a tenký obrys písmen (stroke #313C2B ~1.5px přes #lh-word-m). Pokud by maska nešla, fallback = plný
      tmavý nápis ANASTASIA (Fraunces italic), ne prázdno.
   c) **Tlačítko zvuku (sluchátka) je zdvojené** – vidět jsou dva překrývající se kruhy. Má být jen jedno tlačítko.
      Po kliknutí se musí viditelně změnit stav: aria-pressed, jiná ikona (sluchátka s vlnkami vs. přeškrtnutá),
      zlatá výplň když hraje, popisek „Zvuk zapnutý/vypnutý“. Stav synchronizovat se všemi tlačítky zvuku na stránce.
      Hudba se spustí tapnutím na Vstúpte i na sluchátka (gesture), ověř že audio soubor existuje a hraje.
   d) **Potvrzeno screenshotem z Luckyho Androidu:** na místě nápisu ANASTASIA je jen prázdná krémová plocha
      (video prosvítá jen nepatrně) → maska se na telefonu nevykresluje. Bod b) je priorita č. 1.
   e) **Loga v intru na mobilu jsou rozházená** (hlavní logo nahoře, pod ním Academy a AI ve dvou sloupcích, různé velikosti).
      Udělat jednu čistou řadu tří log vedle sebe: Academy | OZ (Light for the Future) | AI, stejná vizuální výška,
      zarovnané na společnou osu a stejné mezery, decentní velikost (jako logo řada u Leilu), nic nepřetéká.
      Stejně tak na desktopu – jedna symetrická řada.
3. **Obchod na mobilu je rozbitý** (stránka /obchod a karty produktů):
   - karty nemají obrázky (prázdný krémový gradient) – doplň obrázek produktu (thumbnail z Medusy), fallback ne prázdný;
   - nadpis produktu se překrývá s obrázkem a štítkem, „Do košíka“ leží přes text;
   - v kartě se vypisuje celý dlouhý popis produktu (stovky slov) – v kartě max 2 řádky perexu, zbytek jen na detailu;
   - na mobilu 1 sloupec (nebo 2 jen s krátkým obsahem), nic se nepřekrývá.
4. **Všude se opakují stejné obrázky** (strom, les se slunečními paprsky, foto Lucie, noční obloha).
   Každá sekce jiný záběr. Zdroj: Luciiny fotky/videa z public/media + Pexels (licence Pexels, zapiš do design/HERO-ZDROJE.md).
   Žádné Leil obrázky.
5. „Zdravý svet“ hero: nadpis přetéká vpravo („dopracovať.“ uříznuté) – zalamovat.
6. Astrologie (Pod hviezdami): přes nadpis a text vedou vodorovné linky – pryč. Tlačítko „Objaviť profil“ má za textem
   zvýrazněný obdélník – pryč.
7. Karta Kozmetika: „01 · 0,00 11 €“ – špatná cena/formát, oprav (od X €).
8. Patička mobil: „Denný stacionár Vyšná Slaná“ v 2 sloupcích se mačká – 1 sloupec nebo zalomit.

Pravidla: texty klienta 1:1, nic nevymýšlet. Commit jen vlastní soubory, NEPUSHOVAT, NIKDY git checkout/reset/stash/clean.
Výkon na mobilu: žádné těžké filtry, animace jen transform/opacity.
