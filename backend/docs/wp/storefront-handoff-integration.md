# Propojený storefront a zákaznické centrum

Zdroj: uživatelem dodaný `Figma document request (1).zip`, návrh `ANASTASIA Môj účet v2.dc.html` a přiložený README (kopie v `storefront-prototype/design/HANDOFF-v2.md`). Větev `codex/storefront-chat`.

Homepage a O Lucii v balíku odpovídají původním návrhům; změna odkazů na účet je zapracována v převodníku rout. Zachované jsou schválené fotografie Zdravého světa, přebarvování lišty, zvukové ovladače a logo v hero.

Zákaznické centrum využívá celou dostupnou šířku vedle navigace bez limitu 1320 px. Používá nativní HTML/CSS/ES moduly prototypu: burgundy paletu, pravé nadpisy, navigaci vlevo a mobilní posuvné navigační pilulky. Sedm propojených sekcí: Prehľad, Moje programy, Konzultácie, Chat s Luciou, Objednávky, Materiály a Môj profil. Hash v URL zachovává zvolenou sekci po reloadu a podporuje historii prohlížeče.

Přehled, termíny, materiály a profil mají syntetický snapshot v mock API; další výběr produktů používá skutečný mock košík, stejný jako obchod. Profil se pouze validuje v náhledu, osobní údaje se neukládají. Materiály se filtrují, skutečné placené soubory ani faktury se nevydávají. Programy zůstávají zamknuté, dokud není výslovně zvolen náhled oprávnění. Chat zachovává stávající kontrakt, čistý text, 2000 znaků a slovenské chyby 403/429/409.

Přihlašovací obrazovka dostala paletu centra, ale zachovává přihlášení přes e-mailový odkaz. Návrhové zadání hesla, automatické odemčení programu a automatické odpovědi Lucie nepřepisují zavedené backendové kontrakty. Hlavní logo v hero je větší, posunuté vlevo mimo horní menu a krátce se zavlní jednou za 12 sekund (bez posouvání nahoru/dolů). Horní hlavička přebírá všechny tři značky patičky. Boční rozbalovací menu má podle posledního požadavku logo odstraněné. Horní menu zachovává kruhovou část prvního původního loga ANASTASIA OZ (56 px) a text vedle. Jde o CSS výřez z `lucia-logo.png` bez horního/spodního nápisu; symbol AI ANASTASIA se v těchto menu nepoužívá. Texty hero mají vlastní obrys a stín pro čitelnost. Při systémovém `prefers-reduced-motion` animace neběží. Hero video nemá filtr, barevný blend ani tmavý celoplošný překryv; barvy zůstávají původní. Z návrhu se nepoužívá runtime `support.js` ani externí CDN; CSP zůstává `'self'`.

Spoj zákaznického centra s patičkou má přechod pouze mezi původní vínovou a modrozelenou barvou; světlá plocha obsahu se nepřebarvuje.

Homepage: návaznost RESET 40+ → Konzultácie je řešená kompozicí. Samotný obraz oblohy přesahuje nad okraj sekce o 64 px (32 px na menších šířkách), text má vlastní odsazení 96/32 px ve světlé ploše. Výřez, přirozené barvy a 100% krytí videa se zachovávají. Nepoužívá se společná maska prolnutí. Na mobilu se obraz a text skládají pod sebe. Původní zaoblený roh tvoří propojení obrazu s lesem; odstraněný je celoplošný prázdný pás, zůstává prostor pro čtení v textovém sloupci. Zeleno-modrý přechod O Lucii do patičky zůstává.

Pro výběr postupu byl porovnaný celý místní katalog (131 souborů SKILL.md) i nové zdroje přes skills.sh: `better-layout` (jakubkrehel/skills), Impeccable (pbakaus/impeccable), `gpt-taste` (leonxlnx/taste-skill) a Microsoft `frontend-design-review`. Použité nové postupy: better-layout (společné hrany, mediální přesah, odsazení textu, kontrola reflow) a Microsoft review (kompozice, zřetelné akce, respekt k designu). Náhodný redesign a přidávání GSAP z gpt-taste nejsou vhodné pro schválený statický prototyp.

Zdroje nových skillů:
- https://github.com/jakubkrehel/skills/blob/main/skills/better-layout/SKILL.md
- https://github.com/microsoft/skills/blob/main/.github/skills/frontend-design-review/SKILL.md
- https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/SKILL.md

Výřez noční oblohy zachovává rozměry a plné krytí. Pokračování za ním používá stejnou velikost videa s 30% krytím a měkkým zakončením do světlého pozadí; původní výřez se nezvětšuje.

Kontakt má široké dvousloupcové rozložení s původními údaji provozovatele a formulářem vedle; na mobilu se skládá pod sebe. Pod formulářem je obrovská kruhová část hlavního loga jako dekorativní podklad přes šířku formuláře: tlumená olivová, 12% krytí, ignoruje kliknutí i čtečky. Náhled formuláře nadále neodesílá ani neukládá údaje. Obě rozbalovací menu mají tmavší skleněné pozadí pro čitelnost i nad světlou stránkou.

Export obsahuje zdrojáky, hotový `dist`, lokální média a potřebnou CSV mapu rout. Spouští se bez npm instalace přes `node storefront-prototype/serve.mjs 4173`; sestavení přes `node storefront-prototype/build.mjs`. Prohlížečové testy potřebují vlastní Playwright instalaci, viz README.

Stav: VERIFIED pro lokální mock storefront.

Ověření:
- `node storefront-prototype/build.mjs`: 59 stránek, všech 34 původních cílových cest pokryto.
- `STOREFRONT_URL=http://127.0.0.1:4183 node storefront-prototype/test/browser.mjs`: 27/27 skupin PASS, včetně všech rout, mobilů, klávesnice, pohybu, chatu, poukazů a původního obsahu.
- `node --test storefront-prototype/test/mock.test.mjs`: 15/15 PASS.
- Backend `tsc --noEmit`: PASS; `npm run test:unit`: 190/190 PASS na větvi `codex/storefront-chat`. Pro tento běh byly dočasně propojeny existující lokální závislosti worktree `feat/gift-voucher`; propojení je odstraněno. Backendový kód ani balíčky se neměnily. Počet testů této výchozí větve se liší od 305 testů samostatné větve poukazů.
- Kontakt a centrum: 320–1920 px bez vodorovného overflow, původní kontaktní údaje zachované, mock formulář neodesílá údaje.
- Export `ANASTASIA-storefront-complete.zip`: CRC všech 222 souborů PASS; nové rozbalení a samostatné sestavení PASS; všech 59 rout, CSP self, chat, API hodnoty poukazů a kontakt PASS.

Poslední kontrola přesunu loga pod kontaktní formulář: 5/5 šířek (320/390/1000/1440/1920 px) PASS, žádný vodorovný overflow, boční menu bez loga, horní logo zachované, dekorace neblokuje kliknutí, mock odeslání a obě menu s Escape PASS. Vizuálně zkontrolovaný snímek celého formuláře.

Nová kompozice ověřena při 320/390/1000/1120/1440/1920 px: obraz přesahuje 32/64 px nad sekci, poměr původního výřezu zůstává 4:5, opacity 1, filter none, společná maska none, žádný vodorovný overflow. Na desktopu obraz navazuje spodní hranou přímo na O Lucii; na užších šířkách následuje konzultační text v přirozeném toku. Zkontrolován i 720px CSS viewport jako ekvivalent 200% zvětšení při šířce 1440 px. RTL a překlady mimo aktuální slovenský náhled se neověřovaly.

Blokery pro lokální náhled: žádné. Další krok: vizuální kontrola náhledu uživatelem; produkční backendové napojení zůstává mimo tento mock export.

Obchod má vycentrovaný nadpis i celý katalog v dostupné šířce vedle lišty. Kategorie z existujícího mock API mají velké navigační dlaždice s lokálními SVG a existujícími obrázky kategorií: šest sloupců na širokém desktopu, tři na menším desktopu, dva na mobilu, čtvercové obrazy, aktivní kategorie a klávesnicový focus. Směr vychází z uživatelem doložených obrazových karet Collaborations na https://store.tomorrowland.com/en-int; zachovává vlastní paletu ANASTASIA a původní filtry.

Pole používají jednotnou světlou plochu, text a kurzor podle kontextu; Chrome autofill je překrytý barvou pole i v přihlášení, profilu a patičce. Kontrola vynuceného autofillu: 12/12 polí napříč dvěma lokálními náhledy PASS. Celý browser běh po přidání navigace a autofillu: 27/27 PASS; poslední úprava velikosti dlaždic a centrování má samostatnou kontrolu pěti šířek na obou náhledech. Mock po poslední změně: 15/15 PASS.
