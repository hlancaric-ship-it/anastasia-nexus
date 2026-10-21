# Nový admin: samostatná obsluha bez programátora

Zadání Luckyho, 15. 10. 2026: celý admin vzniká od nuly. Uživatelka není programátor.
Běžné vedení obchodu, obsahu, konzultací a komunikace zvládne sama v rozhraní.
Tento dokument je závazný návrhový a akceptační podklad, nikoli tvrzení o již hotových funkcích.
Navazuje na [soupis a API](ADMIN-SOUPIS.md).

## Jazyk a každodenní použití

Rozhraní mluví běžnou slovenštinou. Názvy vycházejí z úkolů uživatelky, nikoli z modulů backendu.
Zákazník a produkt se vybírají podle jména/názvu, nikoli opisováním interního ID.
Žádná běžná činnost nevyžaduje terminál, JSON, SQL, úpravu souboru nebo nové nasazení.

| Technický pojem v podkladech | Text pro uživatelku |
|---|---|
| Entitlement / grant / revoke | Prístup k programu / Pridať prístup / Odobrať prístup |
| Voucher ledger / void | História použitia poukazu / Zneplatniť poukaz |
| Refund / capture | Vrátiť peniaze / Platba prijatá |
| Booking availability | Voľné termíny |
| Tier / pricing policy | Vernostné úrovne / Pravidlá zliav |
| Template override | Upraviť text e-mailu |
| Retention | Ako dlho uchovávať údaje |
| Retry / request ID | Skúsiť znova / Kód pre podporu |
| Webhook/provider/tenant | V běžných obrazovkách se nezobrazují |

Tlačítka popisují konkrétní výsledek: „Uložiť voľné termíny“, nikoli „Odoslať“ u nastavení.
Chyba obsahuje příčinu a další krok, například „Tento čas už je rezervovaný. Vyberte iný čas.“
Při nejistém výsledku nehlásit „neuloženo“ bez důkazu; sdělit, že se nejdřív ověří stav.
Žádné HTTP kódy, interní enumy ani syrové chyby serveru jako hlavní sdělení.
Technický detail je volitelně v oddělené části pro podporu, s bezpečným kódem, nikoli tajnými údaji.

## Návrh chování

- Domovská stránka ukazuje, čemu je potřeba věnovat pozornost: objednávky, zprávy, dnešní termíny.
  Zobrazují se skutečné údaje; při chybě načtení žádné falešné nuly ani „vše v pořádku“.
- Navigace podle práce: Prehľad, Objednávky, Produkty, Zákazníkov, Konzultácie, Správy,
  Poukazy a zľavy, Obsah a e-maily, Nastavenia. Ochrana údajov a technický provoz podle práv.
- Každá stránka má zřetelný nadpis, jednu hlavní akci, návrat a nápovědu u složitých polí.
  Pokročilé volby se rozbalují až podle potřeby; důležité podmínky a dopady zůstávají viditelné.
- Úvodní průvodce se dá přeskočit a znovu otevřít. Přehled přípravy nabídne další konkrétní krok.
- Před zveřejněním či změnou pravidel zobrazit náhled a dopad: pro koho, od kdy, na co změna platí.
  U poukazů vysvětlit, že nové nastavení nemění již vydané poukazy.
- Uložení má viditelný průběh a skutečné potvrzení serveru. Nedokončené zadání se při validační chybě neztratí.
  Rozpracované citlivé texty se bez rozhodnutí neukládají do localStorage; koncept vyžaduje bezpečný serverový podklad.
- Před odchodem z neuloženého formuláře varovat. Vrácení změny nabídnout jen tam, kde je skutečně podporuje backend.
- Pole pro cenu ukazuje €, pro délku minuty, pro termín místní datum/čas. Desetinná čárka a slovenský formát.
- Chyby přímo u polí a souhrn s odkazy na ně; po odeslání přesunout fokus na souhrn/první chybu.
- Stav se nesděluje jen barvou. Viditelný fokus, ovládání klávesnicí, popisky ikon, kontrast textu min. 4,5:1.
  Cíl ovládacích prvků 44 × 44 CSS px; responzivní formuláře, 200% zoom a omezení pohybu.
- Vzhled souvisí s ANASTASIA: klidná světlá pracovní plocha, zelená navigace, střídmé vínové/zlaté akcenty.
  Tabulky a formuláře mají přednost před efekty. Žádné přebírání starého admin-demo.

## Claudeovy poznámky: nic neztratit

Zdroje: [PROGRESS_LOG, zejména části 7–9](../../../docs/PROGRESS_LOG.md),
[audit samoobsluhy](../../../docs/ADMIN-SELFSERVICE-AUDIT.md),
[rozdělení backendu](ROZDELENI-BACKEND-ZBYTEK.md), společné předání `~/CODEX-CLAUDE-BACKEND-ADMIN.md`.
Historické poznámky níže nejsou automaticky aktuální funkčnost; backendový stav rozlišuje soupis.

| Požadavek z poznámek | Co musí umět uživatelka / co nesmí zapadnout | Podklad dnes a práce navíc |
|---|---|---|
| Věrnostní úrovně | Sama přejmenovat úrovně a nastavit slevu | Čtení skupin funguje; editor a bezpečné settings API chybí. Procenta nevymýšlet, původní požadavek 0 % do rozhodnutí |
| Akce a výprodej | Naplánovat, spustit i ukončit akci; určit produkty/kategorie a omezení | Bezpečný kontrakt podporovaných pravidel nutno doplnit; NEXUS domain code sám není hotový editor |
| Produktové štítky | Novinka, bestseller, odporúčame bez vývojáře | Potřeba skutečný kontrakt uložení a vlivu na storefront, nestačí kosmetický přepínač |
| Doprava a osobní odběr | Nastavit způsoby, ceny a hranice dopravy zdarma | Nativní Medusa API; nový lidský formulář, serverová validace, potvrdit obchodní hodnoty |
| Sklad | Upravit zásobu, vidět vyprodání; neobejít rezervace posledního kusu | Medusa stav/reservace; ověřit nové UI proti skutečnému skladu |
| Objednávky/storno/refund | Obsloužit objednávku a vrátit správný způsob platby | Rozlišit zákazníkové storno, admin storno, kartovou a poukazovou vratku; neztotožnit status s penězi |
| Konzultace | Sama vytvořit typ včetně délky, pauzy, ceny a formy | API existuje; nový editor, název/popis bez technických metadat |
| Týdenní dostupnost | Ručně zadat týden, kopírovat minulý, vidět obsazení | Jeden společný kalendář pro všechny typy; nevyplněný den zavřený; obsazené časy nelze smazat |
| Komunikace se zákazníkov | Číst a odpovídat v kontextu zákazník/objednávky/rezervace | Chat API existuje; nový inbox, nárok/limity serverově, zavření/ztlumení/blokace vratně |
| Poukazy | Sama upravit hodnoty, platnost, použití a doručení; dohledat pohyb/vratku | API existuje; nové úplné UI včetně historie a chyb částečného uložení |
| QR | Vygenerovat a stáhnout QR přímo v adminu | První fáze; ověřit i aplikaci slevy, ne pouze obrázek; ambasadoři a provize druhá fáze |
| Texty e-mailů | Upravit text a náhled, spravovat povolené zapnutí | API existuje; nový editor, povinné e-maily nelze vypnout, ověřit skutečnou nabídku šablon |
| Newsletter | Souhlasy, odhlášení, správa a samostatné odesílání | Dnes jen evidence/export; rozesílání vyžaduje backend/provider, nesmí se potichu vypustit |
| Odstoupení a reklamace | Podání, stav vyřízení a návazná komunikace/vrácení peněz | Odstoupení API existuje; reklamace mají otevřený rozsah a chybějící workflow |
| Faktury | Získat a spravovat správné doklady, ne order confirmation vydávaný za fakturu | Integraci a číslování určit s účetní; není doložená hotová fakturace |
| Souhlasy a údaje | Evidence VOP/GDPR, historie, poznámky, žádosti a výmaz | Legal/privacy API; nepřepisovat historii souhlasů, účetní povinnosti respektovat |
| Programy a obsah | Změnit platnost přístupu a přiřadit obsah bez JSON; spravovat jazykové texty | Nároky existují; editor obsahu, privátních médií a překladů potřebuje vlastní bezpečné API |
| Logy a provoz | Poznat problém a další krok, dohledat změnu | Ops/audit API existují částečně; historie jobů/doručení/záloh a kompletní logy vyžadují doplnění |
| Klub/předplatné | Nezaměnit zákazníkom skupinu za placené členství | Rozsah dosud nerozhodnutý; nevydávat NEXUS SaaS billing za zákazníkov klub |

## Samoobsluha je i práce na backendu

Současné nastavení přes env/konstanty je popis dneška, **nikoli povolený finální způsob běžné obsluhy**.
Pro každé běžné nastavení musí vzniknout čtení/uložení v API, serverová validace, oprávnění,
uložená verze, audit, vysvětlení dopadu a ověření, že změnu skutečně používá obchod.
Cenová/riziková pravidla musí používat správný tenant a kontrolované publikování, bez klientských výpočtů.
Žádné „Uložit“ měnící pouze stav v prohlížeči. Chybějící API je implementační úkol před akceptací dané funkce.

Infrastrukturní bezpečnost (DB, podpisové klíče, nasazení) není každodenní obchodní nastavení.
Uživatelka nesmí pro běžný úkol potřebovat správce serveru. Pokud má sama připojovat e-mailovou či platební
službu, potřebuje bezpečný průvodce připojením, kontrolu spojení a skryté údaje; tento tok dnes není hotový.
Bezpečnostní limity mohou mít nepřekročitelný serverový rozsah; neumožnit vypnutí ochrany jako zkratku.

## Akceptace s uživatelkou, ne podle dojmu vývojáře

Cílová uživatelka dostane syntetické zadání bez technického školení a bez navigování programátorem.
Ověříme vytvoření produktu a štítku, změnu ceny/skladu, nové konzultace a volného týdne,
vyřízení objednávky, odpověď zákazníci, nastavení poukazu, QR, textu e-mailu, věrnostní úrovně,
plánované akce a dopravy. U doplňovaných funkcí také obsah/překlad, newsletter a vyřízení požadavku na údaje.

Každý úkol má splněný výsledek na serveru, správný dopad na storefront, srozumitelné potvrzení
bez nápovědy vývojáře. Měříme dokončení, místa zaváhání a chyby. Neúspěšný úkol znamená úpravu
návrhu a opakování testu. Navíc zkouška chybného vstupu, odchodu bez uložení, dvojkliku,
konfliktu a výpadku sítě; nevratné akce nesmějí projít omylem.
Bez této zkoušky netvrdíme, že je admin uživatelsky ověřený nebo nezávislý na programátorovi.

## Načtené návrhové podklady

- Lokální `ui-ux-pro-max`: formuláře, validace, navigace, přístupnost a postupné odhalování voleb.
- Lokální `frontend-design`: konkrétní vizuální identita a jazyk pojmenovaný podle uživatelských úkolů.
- `find-skills`: průzkum katalogu; načten [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md)
  a [vlastní pravidla kontroly](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md).
- Generický výstup design-system hledání nabízel marketingový hero/CTA; ten pro pracovní admin není vhodný
  a nepřebíráme jej. Cílené výsledky pro chyby formulářů odpovídají tomuto použití.

Žádný skill sám nezaručuje snadné ovládání; výše uvedené scénáře jsou podmínkou skutečného ověření.
Vizuální návrh ke schválení: [interaktivní náhled](admin-design-preview.html).

## Ověření vizuálního návrhu

Náhled je samostatné HTML s místním vloženým písmem a logem, dvě obrazovky a výslovně ukázková data.
Chrome/Playwright: 4/4 šířky (1440, 1024, 768, 390 px), oba pohledy bez vodorovného přetečení,
přepnutí navigace, rozbalení polí a ukázkové uložení PASS, bez chyb JavaScriptu.
Snímky [přehledu](admin-design-overview.png) a [nastavení](admin-design-settings.png) vizuálně zkontrolovány.
Nejde o plnou funkční ani uživatelskou akceptaci adminu; žádné napojení na backend zatím neproběhlo.

### Doplnění proklikávání návrhu

Všechny položky bočního menu otevírají vlastní obrazovku: přehled, objednávky, produkty,
zákazník, konzultace, zprávy, poukazy, obsah, nastavení a nápověda. Nastavení vedou také na dopravu,
věrnostní úrovně a e-maily; obsah na stránky, newsletter a QR. Celkem 17 ukázkových obrazovek.
Seznamy podporují hledání, ukázkové detaily mají zavíratelný dialog, funguje návrat prohlížeče.
Roztažené přepínače a souběžné zvýraznění dvou položek menu jsou opravené.

Kontrola: 28/28 přechodů menu/přímých odkazů (menu při 1440 i 390 px), hledání a prázdný výsledek,
detail/Escape, návrat se zachovaným filtrem PASS. Původní kontrola obou obrazovek na čtyřech šířkách
znovu PASS, bez chyb JavaScriptu. Nadále jde výhradně o vizuální návrh s ukázkovými daty.
