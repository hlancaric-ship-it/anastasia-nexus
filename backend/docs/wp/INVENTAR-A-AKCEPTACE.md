# Inventář ANASTASIA a akceptační návaznost

**Balík:** C4 `site-inventory`  
**Datum inventury:** 9. 10. 2026  
**Účel:** výchozí obsahový a funkční inventář pro migraci; podklad pro ověření rozsahu Fáze 1 a Fáze 2. Dokument neznamená převzetí ani schválení systému.

## Jak číst stavy a důkazy

Každý záznam používá jeden z následujících štítků:

- **ověřeno** — doloženo zdrojovým kódem, strukturou dumpu, auditem nebo smlouvou; údaj popisuje jen tento konkrétní zdroj a okamžik.
- **předpoklad** — rozumný závěr, který je nutné potvrdit aktuálním exportem, s majitelkou nebo testovacím scénářem.
- **požadavek čekající na implementaci** — cílové chování ze smlouvy nebo zadání, které nelze doložit jako dokončenou funkci.

Zdroje: `~/Downloads/anozeu/DB.sql` a zdroj `~/Downloads/anozeu/dufeksoft.ecommerce.web/` (pouze čtení); `~/Desktop/ANASTASIA-audit/segment-*.md`; smlouva `SMLOUVA-ANASTASIA-FINAL.html`, čl. 2 a příloha č. 1; aktuální zdrojový strom tohoto backendu a `backend/NEXUS-INTEGRATION.md`; předání `backend/docs/wp/CODEX-HANDOFF.md`. V dumpu byly kontrolovány pouze agregované počty/model, nikoli řádky se zákazníkmi údaji. V tomto dokumentu nejsou jména, e-maily, adresy, identifikátory, texty zpráv ani jednotlivé objednávky.

`docs/REQUIREMENTS_MATRIX.md` v aktuálním worktree nebyla nalezena. Níže jsou proto uvedena pouze ID A-01 až A-18 z handoffu. Jejich přesný název a stav je nutné před finální akceptací sladit s autoritativní maticí K5; tuto matici C4 nevytváří ani neupravuje.

## Současný inventář

### Weby a obsahové části

| Položka | Zjištěný stav |
|---|---|
| `anastasiaoz.eu` | **ověřeno** — Umbraco 8.17.1 / .NET Framework 4.7.2 / IIS a MS SQL; současně obsahový web i e-shop. Jde o hlavní zdroj starých URL a obchodních záznamů. |
| Hlavní stránka a informace o Lucii | **ověřeno** — veřejný web má domovskou stránku a osobní/odborný obsah; přesný úplný strom publikovaných stránek nebyl z dostupného souhrnného auditu rekonstruován. |
| Konzultace | **ověřeno** — existuje `/konzultacie`; dále audit uvádí `/konzultacie/astrologicky-profil-zdravia-a-vitality/` a `/online-zdravotna-konzultacia/`. Obsah je odborná služba, nemá být automaticky přepsán na obecnou produktovou landing page. |
| Astrologie a supervize | **ověřeno** — audit uvádí `/astrologia/`, `/eshop/produkt/astrologia` a `/eshop/produkt/supervizia`; stránky a produktové URL se překrývají, proto je nutné zachovat návaznost obsahu i nákupu. |
| Zdravý svet | **ověřeno** — obsahová část webu, včetně URL `/zdravy-svet/`; handoff výslovně stanoví, že jde o stránku uvnitř webu, nikoli samostatný projekt. |
| E-shop a kategorie | **ověřeno** — veřejná cesta `/eshop`; model obsahuje produkty, kategorie, výrobce/značky, dostupnost, ceny, vztahy produkt–kategorie a související produkty. Dump audit vykazuje 30 produktů, 11 kategorií a 3 výrobce. Jde o malý snapshot, ne jistý aktuální katalog. |
| Články a recenze | **ověřeno** — obsahové typy `BlogArticlePage` a `BlogArticles` jsou ve zdrojovém Umbraco projektu; audit veřejného webu zachytil také `/ai-anastasia/recenzie-farmaceutickych-produktov/`. Úplný seznam článků, jejich počty a publikační metadata nebyly bezpečně potvrzeny z dodaných souhrnných výstupů. |
| Academy | **ověřeno** — `anastasia.academy` je samostatný obsahový web (React/Vite + FastAPI) s programy, tématy programů, články, kategoriemi článků, médií, stránkovým obsahem, newsletterem a kontaktními zprávami. Jeho přenos náleží dle smlouvy do Fáze 2. |
| AI Anastasia | **ověřeno** — `aianastasia.com` je samostatný React/Vite + FastAPI web; audit eviduje články, recenze, leady, konzultace a AI rozhraní. Jeho převod/nahrazení asistenta patří do Fáze 2 a je omezen čl. 9 smlouvy. |
| RESET 40+ | **ověřeno** — smlouva požaduje zachovat jako jednorázově kupovaný program se stávající strukturou, obsahem a podmínkami přístupu; handoff uvádí 168 € a 16 tematických týdnů. Přesná skladba jednotek a obsahový export v této inventuře nebyly nezávisle potvrzeny. |
| Služby L005, supervize, astrologický profil | **předpoklad** — zadání uvádí L005 a tyto služby jako povinné položky inventáře. Ve starých auditních URL je doložena astrologie a supervize, ale vazba konkrétního kódu L005 na konkrétní službu, cena a produktová metadata nebyly v předaných výstupech potvrzeny. |

### Katalog, objednávky a databázové počty

| Oblast | Zjištěný stav |
|---|---|
| Dump | **ověřeno** — audit dat uvádí 78 tabulek, 64 tabulek s daty a 19 176 INSERT řádků celkem. Snapshot může být vývojový/předávací; nelze z něj odvozovat produkční úplnost. |
| Základní obchodní počty | **ověřeno** — agregace auditu: `ecProduct` 30, `ecProductPrice` 30, `ecQuote` 58, `ecCustomer` 12, `cmsMember` 13, `ecCoupon` 3, `ecProducer` 3, `ecCategory` 11, platební typy 3, dopravy 2, Umbraco uživatelé 4. Čísla nejsou výpisem z produkce ani důkazem dnešních počtů. |
| Produkty | **ověřeno** — starý model odděluje produkt od ceny; eviduje kód, název, popis, obrázek/URL, výrobce, dostupnost, příznaky viditelnosti/akce/prodeje, sklad, elektronický web a oddělené ceny. Konkrétní úplný seznam názvů a cen se z tohoto dokumentu záměrně nevypisuje; vyžaduje řízený katalogový export bez osobních údajů. |
| RESET/digitální produkty | **ověřeno** — starý model obsahuje příznak elektronického produktu a cesty k chráněnému obsahu. Automatické doručení nového systému musí navázat na potvrzenou platbu a oprávnění; smlouva požaduje automatické zpřístupnění RESET po platbě. |
| QR/kupony | **ověřeno** — `QuoteLinkController` definuje `GET /eshop/kosik?produkt={kód}&kupon={kód}&ks={množství}`. Přidá produkt do košíku aktuální session, serverově zkusí kupón a přesměruje na košík; pro neplatný/nepoužitelný kupón zobrazí upozornění. Po změně košíku může kupón zkusit znovu. To je kritická kompatibilní URL pro tištěné odkazy. |
| Platba a potvrzení | **ověřeno** — starý zdroj obsahuje integraci Tatra banka CardPay, stavy objednávky a šablony transakčních e-mailů (stav objednávky, karta/bankovní platba). Audit upozorňuje, že část gateway je v binární knihovně a nelze z ní plně ověřit podpis a částkovou validaci. Smluvní cíl Fáze 1 je Stripe karty, Apple Pay a Google Pay. |

### Stránky a důležité URL pro zachování

Audit SEO uvádí 39 URL s provozem jako zdroj redirect mapy. Níže jsou konkrétní cesty doložené z výpisu top stránek a kontextu; nejde o kompletní 39řádkovou mapu. Zachovat starý host i varianty http/https a www/non-www při sestavení redirectů.

| Stará URL / vzor | Význam / cíl při migraci | Stav |
|---|---|---|
| `/` | Domovská stránka; zachovat tematiku a kanonickou URL. | **ověřeno** |
| `/eshop` | Vstup do katalogu. | **ověřeno** |
| `/eshop/produkt/{slug}` | Detail produktu; zejména `astrologia`, `supervizia`, `bio-sprchovy-gel`, `kava-zdrava`, `telove-maslo`, `lanova-sukna`, `ritualne-sviecky`, `pletova-voda`, `saty-lanove`. Cíl mapovat na stejný produkt nebo ekvivalentní detail. | **ověřeno** |
| `/eshop/kosik?produkt={productCode}&kupon={couponCode}&ks={quantity}` | QR/ambasadorská URL: musí vložit určený produkt a uplatnit kupón v košíku; pouhý redirect na homepage nevyhovuje. | **ověřeno** |
| `/kosik` | Stránka košíku, cílové přesměrování QuoteLink. | **ověřeno** |
| `/konzultacie` | Obsah a nabídka odborné konzultace. | **ověřeno** |
| `/konzultacie/astrologicky-profil-zdravia-a-vitality/` | Astrologický profil / služba. | **ověřeno** |
| `/online-zdravotna-konzultacia/` | Konzultační služba; nesmí slibovat diagnózu mimo dohodnutý odborný rozsah. | **ověřeno** |
| `/astrologia/` | Obsahová stránka astrologie. | **ověřeno** |
| `/zdravy-svet/` | Obsahová část Zdravý svet. | **ověřeno** |
| `/vyuka/` | Výuka / vzdělávací obsah. | **ověřeno** |
| `/kontakt/` | Kontakt a formulářové cíle. | **ověřeno** |
| `/gdpr` | Informace o soukromí. | **ověřeno** |
| `/ai-anastasia/` a `/ai-anastasia/recenzie-farmaceutickych-produktov/` | Starý AI/článkový obsah; při Fázi 2 rozhodnout cílový obsah a vhodnost zachování indexace. | **ověřeno** |
| `/umbraco` | Starý administrační backoffice; veřejná dosažitelnost byla auditována. Není veřejnou obsahovou URL k migraci. | **ověřeno** |
| Další URL s provozem + pět 404 z GSC | Doplnit do redirect mapy podle úplného `Stránky.csv`/Search Console exportu; přesných všech 39 URL tento dokument nemá. | **předpoklad** |

SEO audit dále doložil chybějící canonical/OG/robots/sitemap v okamžiku auditu, duplicitní varianty URL a 5 adres vracejících 404. Akceptace proto musí kontrolovat kanonickou cílovou URL a 301 pro každou schválenou starou cestu, ne pouze úspěšnou odpověď homepage.

### Média a formuláře

| Položka | Zjištěný stav |
|---|---|
| Produktové obrázky | **ověřeno** — produktový model a administrační šablony pracují s hlavním obrázkem i dalšími obrázky. Počty a úplnost fyzických souborů nebyly agregovaně potvrzeny. |
| CMS média | **ověřeno** — Umbraco má typy obrázek, video, audio, vektorová grafika a soubory; šablony zobrazují audio/video a YouTube embed. |
| Chráněné programové audio/video | **požadavek čekající na implementaci** — Fáze 2 vyžaduje chráněné přehrávání pouze pro zákazník s platným oprávněním. Odkaz na veřejné embed video sám o sobě akceptaci nesplňuje. |
| Kontakt | **ověřeno** — existuje Contact form a `ContactController`; odesílání e-mailu je přes SMTP dle architektury. Přesný obsah a povinná pole doložit formulářovým exportem. |
| Dotazník / questionnaire | **ověřeno** — starý zdroj má Questionnaire, QuestionnaireItem, QuestionnaireForm a správu odpovědí/formulářů. Zda konkrétní formulář sbírá zdravotní údaje, je **předpoklad**; před migrací je nutná klasifikace a minimalizace dat dle čl. 10 smlouvy. |
| Registrace, přihlášení a obnova hesla | **ověřeno** — starý web má registraci, login, ztracené heslo a členský účet; přihlášení je Umbraco Members, formulářové POST akce používají anti-forgery token. Současná migrace hesel není vhodná; nové ověření zákazník je předmětem A-01/K6. |
| Academy kontakt a newsletter | **ověřeno** — databázové entity existují; audit nalezl jejich čtení a CRUD bez autentizace na API. Pouze veřejné podání formuláře a autorizovaná správa mají být zachovány v cíli. |
| Pharmacy lead/consultation/review | **ověřeno** — entity lead, consultation a review jsou ve starém AI webu. Audit zjistil veřejné čtení/zápis vybraných entit; nové řešení musí omezit čtení na oprávněné role, nastavit serverové schválení recenzí a chránit formulář proti spamu. |
| Chat AI kontakt | **požadavek čekající na implementaci** — smlouva čl. 9 a příloha č. 1 vyžadují souhlas před uložením kontaktu, omezený odborný rozsah a nabídku konzultace po 2–3 cílených interakcích. |

### Role a přístup

| Role / identita | Současný stav | Cílová akceptace |
|---|---|---|
| Anonymní návštěvnice | **ověřeno** — může procházet veřejný obsah, katalog a zahájit košík; web vydává session cookie. | Veřejný obsah zůstane veřejný; žádná cena, sleva ani citlivé oprávnění se neodvozuje z klientem dodaných hodnot. |
| Zákazník / členka | **ověřeno** — starý web má registraci, přihlášení, historii objednávek a vazby zákazníka na objednávky a produkty. Auditní snapshot má 12 zákazníků a 13 CMS member účtů. | Jednotná identita, objednávky a zakoupené přístupy; pouze vlastní účet a vlastní nákupy. Oprávnění samo o sobě je nutné kontrolovat odděleně od přihlášení (A-01/A-02). |
| Objednatelka / správce obsahu | **ověřeno** — živý audit z 7. 10. 2026 uvádí majitelku jako Umbraco Administrator po změně rolí; zdroj má administrační správu produktů, objednávek, zákazníků, kupónů a obsahu. | Samostatná nejméně privilegovaná administrátorská role spravuje katalog, obsah, zákazníky, objednávky a přístupy; akce jsou auditovatelné. |
| Dodavatelské/osiřelé admin účty | **ověřeno** — audit zaznamenává deaktivaci dvou starých účtů a aktivní majitelku + auditní účet. Nejde o potvrzení jejich současného stavu po datu auditu. | Před migrací ověřit aktivní správce, odebrat nepoužívané účty a předat správu Objednatelce; testovat přístupové role. |
| Academy/AI role | **ověřeno** — exporty mají `user/admin`; audit však našel mnoho API bez autentizace. | Role v cíli vynucuje server pro každé chráněné čtení/zápis; nespoléhat na skrytí administrační obrazovky ve SPA. |
| Ambasadora | **požadavek čekající na implementaci** — Fáze 2 požaduje odkaz/QR, přiřazení objednávky a přehled provizí. | Samostatně přiřazený kampanijní odkaz a správně atribuovaná objednávka/provize; QR musí zachovat starý kupónový efekt. |

### Cookies a webové úložiště

| Název / oblast | Zjištěný stav |
|---|---|
| `ASP.NET_SessionId` | **ověřeno** — veřejná stopa uvádí ASP.NET session; audit zjistil `HttpOnly` a `SameSite=Lax`, ale bez `Secure` při HTTP. Session se používá pro košík. |
| `__RequestVerificationToken` | **ověřeno** — antiforgery token je součástí ASP.NET/Umbraco formulářového zabezpečení; přesné veřejné atributy cookie se z dodaných podkladů nedají doložit. |
| `yourAuthCookie` | **ověřeno** — handoff uvádí autentizační cookie starého webu. Přesnou vazbu a atributy je nutné ověřit v živé konfiguraci; obsah tokenu se neukládá do dokumentace. |
| `dufeksoft.Ecommerce.QuoteLinkMessage` | **ověřeno** — zdrojový kód nastavuje krátkodobou HttpOnly, SameSite=Lax cookie pro hlášku a případné opakované uplatnění kupónu; životnost hlášky 120 s, po prvním zobrazení dalších 20 s, čekající kupón až 900 s (+ rezerva). |
| Souhlas s cookies | **ověřeno** — starý web má nastavení funkčních, analytických a marketingových cookies a možnost povolit všechny; `wsCookies` má v snapshotu 5 118 řádků. Počet řádků nedokládá aktuální návštěvnost ani soulad souhlasu. |
| Academy/AI | **ověřeno** — audit veřejných stop uvádí `mgx_vid`; některé varianty mají `Secure`, některé nikoli. Interní cookie inventář managed platformy není úplně dostupný. |
| Cílové cookies a souhlasy | **požadavek čekající na implementaci** — nové cookies, účel, retenční doba, atributy a vazba na souhlas musí být inventarizovány před ostrým spuštěním a doloženy privacy/cookie nastavením. |

## Objednávka → termín → doručení služby

| Krok | Dnešní zjištění | Stav a dopad |
|---|---|---|
| Výběr a založení objednávky | `QuoteLinkController` a `QuoteController` pracují s košíkem navázaným na session; kód kupónu a produktový kód jsou vstupem QR odkazu. `ecQuote` nese datum, stav a částky; vazby na položky a zákazníka jsou v samostatných tabulkách. | **ověřeno** — starý e-shop má obecný checkout a objednávky. |
| Platba | Starý kód obsahuje Tatra CardPay a payment state; úplnou validaci brány nelze ověřit, protože její část je binární. Aktuální backend má `POST /store/nexus-cart` a `POST /store/nexus-checkout`, bere pouze `cart_id`, znovu ověřuje ceny a při nezachycené platbě vrací stav `PENDING`. | **ověřeno** — serverové přecenění a kontrola checkout snapshotu existují. **Požadavek čekající na implementaci** — smluvní Stripe karty/Apple Pay/Google Pay, podpis webhooku a idempotentní potvrzení skutečně zachycené platby nejsou v integrační dokumentaci ověřeny. |
| Automatický přístup k digitálnímu produktu | Aktuální kód obsahuje entitlement modul, autorizované store/admin API, event handlery pro order placed/payment captured/canceled/refunded; grant policy vyžaduje zaplacenou objednávku, digitální produkt a zákazníka. Bootstrap/import uvádí u digitálního doručení „pending entitlement design“ a NEXUS integrační dokument stále popisuje post-payment delivery jako neimplementovanou. | **ověřeno** — existuje entitlement implementace a její unit testy v aktuálním stromu; **předpoklad** — úplná funkčnost v integrovaném běžícím systému, migrace starých oprávnění, konkrétní RESET obsah a chráněná média nejsou tímto čtením end-to-end ověřeny. Aktualizovat integrační dokumentaci/ověřit na K4. |
| Rezervace termínu u konzultace | Starý zdroj obsahuje produktové stránky/služby a obecné checkout formuláře. Ve vyhledaných controllerech/modelu nebyl nalezen kalendář, slot, rezervace, blokování souběžného termínu ani vazba objednávky na událost. | **předpoklad** — objednávka konzultace mohla být řešena ruční domluvou mimo kód nebo v externím kalendáři; z dostupných zdrojů nelze určit skutečný postup. Smlouva čl. 9 a příloha č. 1 však výslovně požaduje kalendář, rezervaci i úhradu z chatu ve Fázi 2. |
| Doručení služby L005 / supervize / astrologický profil | Kód starého checkoutu doručuje potvrzení objednávky/e-mail a ukládá její stav; nebyla nalezena automatizace termínu, předání podkladů, zpracování výstupu ani doručení služby po platbě. | **předpoklad** — následné plnění zřejmě probíhá mimo tento e-shop (ruční domluva, e-mail nebo externí nástroj), ale nelze to tvrdit jako fakt. V novém systému je třeba pro každý typ služby určit vlastní následný stav a odpovědnou osobu. |
| Potvrzení a zákazníková historie | Starý kód má e-mailové šablony objednávky/stavu a členskou sekci. Aktuální backend checkout objednávku ukládá v Meduse, ale automatické e-mailové potvrzení ani kalendářovou notifikaci zde inventura nespouštěla. | **ověřeno** — starý e-shop má šablony a zákazníkom historii. **Požadavek čekající na implementaci** — smluvní test potvrzovacích e-mailů, rezervace a doručení se musí provést v cílovém stagingu. |

Pro každou prodávanou službu je akceptační řetězec: **vytvoření objednávky → potvrzená platba → rezervace/stanovení termínu → potvrzení zákazníci → poskytnutí služby → evidence dokončení a případného navazujícího výstupu**. Pokud služba rezervaci nevyžaduje, musí být její způsob doručení výslovně popsán a schválen. L005 zatím nemá potvrzené přiřazení k této logice.

## Současný stav / požadovaný stav / implementace / test / akceptační kritérium

Každý řádek má štítek; detailnější kontext je v inventáři výše. ID A odkazují na handoff, dokud nebude dostupná `docs/REQUIREMENTS_MATRIX.md` z K5.

| Současný stav | Požadovaný stav | Implementace | Test | Akceptační kritérium |
|---|---|---|---|---|
| **ověřeno** — starý katalog má 30 produktů v dump snapshotu, 11 kategorií a 3 výrobce; data nejsou potvrzením aktuální produkce. | **požadavek čekající na implementaci** — kompletní katalog, ceny EUR, kategorie, značky a dostupnost. (A-03, A-15) | **požadavek čekající na implementaci** — C1 import s mapováním ceny/skladu a kontrolním součtem; schválený aktuální export. | Porovnat anonymizované počty, kódy, ceny a dostupnost mezi exportem a stagingem; ověřit serverové přecenění. | Všechny schválené aktivní položky mají správný identifikátor/kategorii/cenu/sklad; odchylky jsou reportované a schválené. |
| **ověřeno** — RESET 40+ je smluvně jednorázový program; handoff uvádí 168 € a 16 týdnů. | **požadavek čekající na implementaci** — současná struktura/obsah zachovány a přístup vzniká až po platbě. (A-06, A-07, A-15) | **ověřeno** — entitlement model a event handlery existují; **předpoklad** — úplná integrace s konkrétním produktem, importem a chráněnými médii. | Staging: zaplacený RESET vytvoří právě jeden přístup; nezaplacený žádný; zrušení/refund odebere podle definované politiky; jiný účet obsah nepřečte. | Zákazník po capture vidí celý zakoupený program, nevidí cizí program; opakované eventy nevytvoří duplicity. |
| **ověřeno** — starý web eviduje služby/produktové stránky astrologie a supervize; aktuální mapování L005 není potvrzeno. | **požadavek čekající na implementaci** — konzultace/služby mají správné ceny, podmínky, objednávkovou a doručovací cestu; nedochází k falešnému předpokladu digitálního kurzu. | **předpoklad** — současný backend má běžný checkout; službový workflow, kalendář a dokončení služby nejsou dohledány. | Pro L005, supervizi a astrologický profil samostatně projít testovací nákup, určení termínu, potvrzení, dokončení a refundaci; zatím chybí schválené konkrétní procesy. | Objednávka je dohledatelná, termín/alternativní způsob doručení je potvrzen, zákazník dostane zprávu a stav dokončení; termín nelze dvojitě rezervovat, pokud je kalendář požadován. |
| **ověřeno** — stará QR URL vkládá produkt, kupón a množství do košíku a provede redirect. | **požadavek čekající na implementaci** — všechny vytištěné odkazy zachovají produkt i automatickou slevu, případně kampaňovou atribuci. (A-13, A-15) | **požadavek čekající na implementaci** — C3 generátor a redirect mapa; současný generátor v tomto worktree není potvrzen. | Vzorky reálných QR URL otestovat v anonymním košíku: správný produkt, serverová validace kupónu, množství a odpovídající cílová stránka; neplatný kupón nesmí dát slevu. | Všechny schválené QR odkazy vrací 301 na funkční cílový ekvivalent a končí se správnou položkou/slevou v košíku; žádný se neztratí na homepage. |
| **ověřeno** — GSC/audit doložil klíčové URL, ale přesný kompletní seznam všech 39 a 5 starých 404 není v tomto dokumentu. | **požadavek čekající na implementaci** — 301 mapa pokryje všechny důležité stránky, produkty, QR a staré 404; zachová obsahový význam. (A-15) | **požadavek čekající na implementaci** — C3 `redirects-map.csv` + edge pravidla; doplnit Search Console export. | Automatický crawl starých URL proti stagingu; ověřit status 301, cílový status 200/ekvivalent, žádné smyčky a žádné hromadné přesměrování na `/`. | Každá schválená stará URL má odpovídající cíl; QR předává query parametry/efekt kupónu; canonical ukazuje pouze cílovou URL. |
| **ověřeno** — obsahové typy Umbraco i Academy zahrnují články, Zdravý svet, programy a recenze. | **požadavek čekající na implementaci** — obsah zůstane obsahovým a odborné sekce nebudou bez schválení převedeny na čistě prodejní stránky. (A-14, A-15) | **předpoklad** — migrace obsahu a jeho redakční workflow nejsou součástí ověřené storefront implementace. | Vlastník porovná seznam URL, textový/mediální obsah, jazyk, SEO metadata a stav publikace na stagingu. | Každý schválený obsahový typ má odpovídající stránku a editovatelná pole; jazyk a publikační stav jsou zachovány; obsahové URL mají redirect/canonical. |
| **ověřeno** — existují produktová média, Umbraco obrázky/audio/video/soubory a Academy media entity. | **požadavek čekající na implementaci** — média jsou migrována s vazbami; placené audio/video jde přehrát jen držitelce oprávnění. (A-07) | **požadavek čekající na implementaci** — chráněné URL/přehrávání musí navázat na entitlement; nynější existence modelu entitlement sama o sobě nepotvrzuje media delivery. | Test přihlášené vlastnice oprávnění, jiné zákazník, anonymního přístupu, expirace/odvolání odkazu a stahování URL. | Jen aktivní držitel oprávnění získá krátkodobý přístup; cizí účet a veřejný odkaz přístup nezískají. |
| **ověřeno** — starý login je Umbraco Members; auditoval role CMS a akademických exportů, nikoli aktuální zákazníkové účty. | **požadavek čekající na implementaci** — SSO a přenos zákazník, objednávek, historií a přístupů; bez přenosu hesel. (A-01, A-02, A-15) | **požadavek čekající na implementaci** — K6 auth + C2 migrace; aktuální store entitlement API vyžaduje přihlášení. | Dry-run počtů a sum, login přes bezpečný recovery/passwordless flow, test izolace změnou customer ID; porovnat historii/přístupy bez PII v logu. | Každá schválená zákazník získá účet a pouze své objednávky/přístupy; opakovaný import je idempotentní; žádné staré heslo není přeneseno. |
| **ověřeno** — starý web nabízí objednávkové košíky a e-mailové šablony; snapshot obsahuje 58 objednávek. | **požadavek čekající na implementaci** — košík, Stripe, potvrzení platby a transakční e-mail splní přílohu č. 1. (A-04, A-05) | **ověřeno** — serverové `nexus-cart`/`nexus-checkout` a persisted Medusa order; **požadavek čekající na implementaci** — reálné Stripe webhooky/capture idempotence v integrační dokumentaci nejsou ověřeny. | Test sandbox Stripe karty, Apple Pay/Google Pay tam, kde sandbox podporuje; zkusit změnu ceny, duplicitní webhook, chybný podpis, neúspěch/čekající platbu a potvrzovací e-mail. | Cena/částka/měna na backendu odpovídá zaplacené objednávce; bez capture žádný placený přístup; úspěšné potvrzení je idempotentní a e-mail obsahuje správný stav. |
| **ověřeno** — starý web obsahuje contact, questionnaire, registraci, newsletter a formuláře Academy/pharmacy; audit nalézá chybějící auth/rate limit na části API. | **požadavek čekající na implementaci** — povolená veřejná podání, zabezpečené čtení, evidence souhlasů, validace a ochrana proti spamu; zvláštní údaje minimalizovány. (A-01, A-09, A-15) | **požadavek čekající na implementaci** — konkrétní cílové formuláře a admin UI se musí určit podle schváleného obsahu a rolí. | Anonymní submit; anonymní GET seznamu musí být odmítnut; test souhlasu, validace délky, rate-limit a role admin/editor. | Veřejnost může odeslat jen určená data; seznamy/PII jsou přístupné pouze oprávněné roli; souhlas je doložitelný a log neobsahuje zbytečná PII. |
| **ověřeno** — staré cookies zahrnují session, auth, antiforgery, QR hlášku a volby souhlasu; audit zjistil session bez Secure při dostupném HTTP. | **požadavek čekající na implementaci** — cílový cookie registr uvádí účel, dobu, Secure/HttpOnly/SameSite a respektuje volbu návštěvnice. | **požadavek čekající na implementaci** — cílový consent mechanizmus a edge HTTPS/cookie konfigurace nejsou v C4 implementovány. | Projít anonymní i přihlášený browser flow, odmítnout analytické/marketingové cookies, refresh a HTTP→HTTPS; ověřit atributy a absenci nepovolených cookies. | Nezbytné cookies fungují; volitelné se nespouštějí před souhlasem; session/auth je Secure+HttpOnly a HTTPS je vynuceno. |
| **ověřeno** — smlouva požaduje slovenský primární e-shop, SK/EN/RU pro Fázi 2; Academy má jazyková pole. | **požadavek čekající na implementaci** — SK/EN/RU, ruční volba a editor opravy automatického překladu; jazykové verze digitálních produktů dodává klientka. (A-14) | **požadavek čekající na implementaci** — C6 i18n; obsahové překlady vyžadují schválení. | Ověřit přepínač jazyka, URL/hreflang/canonical, chybějící versus prázdný překlad a úpravu v administraci. | Návštěvnice může zvolit jazyk; chybějící překlad je rozpoznatelný; každá publikovaná varianta má správná metadata a jazyk. |
| **ověřeno** — aktuální backend má bootstrap a serverové cenové napojení, ale ne zákazníkov storefront. | **požadavek čekající na implementaci** — administrace umožní Objednatelce spravovat produkty/ceny/kategorie/kupóny/objednávky/zákazník a přístupy. (A-09) | **požadavek čekající na implementaci** — C5 admin UI až po zeleném K4; současné Medusa Admin není důkazem přizpůsobení dle smlouvy. | Role-based scénáře pro vytvoření/upravení/publikaci produktu, objednávky a přístupu; auditní záznam; export. | Objednatelka provede sjednané běžné operace bez vývojáře a uživatel bez role nemůže měnit obchodní ani zákazníková data. |
| **ověřeno** — smlouva požaduje denní zálohy/obnovu a spuštění až po písemném schválení; handoff přiděluje obnovu K4/C7. | **požadavek čekající na implementaci** — záloha i obnova jsou doloženy runbookem a úspěšným restore drill; žádné spuštění bez písemného schválení. (A-16, A-17) | **požadavek čekající na implementaci** — C7 `restore-drill`, K4 integrace; C4 žádnou provozní změnu neprovádí. | Obnovit izolovanou lokální/staging DB ze zálohy, ověřit kontrolní součty, dostupnost katalogu/objednávek a postup rollbacku. | Obnova je opakovatelná podle předané dokumentace, kontrolní součty souhlasí a veřejné spuštění zůstane zablokováno do písemného souhlasu. |

## Smluvní pokrytí a hranice rozsahu

- **Čl. 2, Fáze 1 + příloha č. 1:** katalog/ceny/kategorie/značky/sklad/kupóny; košík/objednávka/Stripe; RESET a automatický přístup; jednotný login a migrace; QR kupónové odkazy; 301; administrační správa; odstranění auditních rizik. Tyto položky jsou pokryty tabulkou výše přes A-01–A-07, A-09, A-10–A-13 a A-15–A-17 podle ID handoffu.
- **Čl. 2, Fáze 2 + příloha č. 1:** Academy a AI web na společném jádru; SK/EN/RU; chráněná audio/video; AI asistent s pravidly čl. 9 a konzultační rezervací/úhradou; ambasadorská atribuce/provize; ComGate pouze při rozhodnutí Objednatelky. V tabulce jsou uvedeny jako požadavky čekající na implementaci nebo pozdější akceptaci; nejde o hotové funkce Fáze 1.
- **Čl. 9 a čl. 10 smlouvy:** serverové mantinely asistenta, souhlas se sběrem kontaktů, minimalizace zvláštních údajů, přístupové role, bezpečnost a zpracovatelská smlouva před migrací PII. Migrace zdravotních údajů či konverzací se nepředpokládá bez právního a účelového potvrzení.
- **Mimo rozsah:** Členský Klub a předplatné jsou mimo smlouvu; Zlatá brána je `FUTURE_SCOPE`/samostatná objednávka (handoff A-18). ComGate je volitelná brána a není podmínkou, dokud ji Objednatelka výslovně nevybere.
- **Smluvní spuštění:** stagingové scénáře se nejprve ověřují na backendu/doménovém jádru, potom na frontendu. Veřejné spuštění jakékoli fáze až po písemném schválení Objednatelky podle čl. 4.

## Otevřené body před akceptací

1. Získat autoritativní `docs/REQUIREMENTS_MATRIX.md` od K5 a doplnit přesné ID/názvy; v aktuálním worktree tento soubor chybí.
2. Získat schválený aktuální katalogový a obsahový export s počty, produktovými kódy, cenami, kategoriemi, články, médií a jazykovými variantami. Dump snapshot se nesmí považovat za potvrzení produkčního stavu.
3. Doplnit všechny 39 URL z GSC/`Stránky.csv`, konkrétní adresy pěti GSC 404 a otestovat každou schválenou redirect/QR cestu.
4. Potvrdit mapování L005, služební ceny, kdo sjednává termín, kalendář/časová pásma, pravidla změny/zrušení, doručovací artefakt a kdo uzavírá službu. U každé služby zaznamenat, zda vyžaduje rezervaci.
5. K4 ověří end-to-end Stripe/webhook, entitlement, e-maily, zákazníkové účty a refundace v izolovaném stagingu. Aktuální kódové čtení není integrační akceptační test.
6. Ověřit seznam aktivních CMS/admin účtů, cookie registry, retention a zpracovatelskou smlouvu před migrací jakýchkoli zákazníkov dat.

## Výsledek C4

**Stav: PARTIAL** — inventář známých oblastí a smluvní akceptační řetězec jsou sepsány; úplný obsahový katalog a všech 39 URL nelze z dostupného souhrnného auditu bezpečně vypsat. `REQUIREMENTS_MATRIX.md` v tomto worktree chybí. Služební rezervace a doručení nelze z dostupného starého kódu potvrdit. Následující krok: K5 doplní autoritativní traceability matrix, C1/C2/C3 a K4 dodají ověřovací důkazy a majitelka potvrdí otevřené procesy služeb.
