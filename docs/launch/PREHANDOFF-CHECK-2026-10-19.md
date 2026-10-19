# Opakovaná kontrola nákupního toku – 19. 10. 2026

## Výsledek předání: BLOCKED

Lokální web, backend a zákaznický obsah jsou ověřitelné. Předání Lucii na dálku zatím není připravené: plánované adresy `anastasia-test.l-code-dynamics.com`, `anastasia-test-admin.l-code-dynamics.com` a `anastasia-test-nexus.l-code-dynamics.com` při této kontrole nemají DNS odpověď (`curl` exit 6). Backend má v dosavadním runbooku stále zástupnou cloudovou adresu. Nelze potvrdit vzdálené přihlášení Lucie a úplný nákup na jejím zařízení proti nasazenému prostředí. Lokalhost není adresa dostupná Lucii.

Nic se v rámci kontroly nenasazuje, nemění se DNS, neodesílají e-maily a neprovádějí skutečné platby. Pro nasazení a zprovoznění vzdáleného testu je potřeba samostatný pokyn a cílový projekt backendu/přístupy. Před předáním musí být ověřena i záloha/obnova tohoto prostředí a bezpečné předání přihlášení Lucii bez rozesílání zpráv zákaznicím.

## Nalezené a opravené chyby

1. Aktivní dist obsahoval konfiguraci cizího staršího prostředí: backend odmítal veřejný klíč (400), region také neodpovídal skutečné místní DB. Obnoven připojený build. Běžný build nově vyžaduje všechny čtyři veřejné konfigurační hodnoty před zápisem do dist. Chybějící konfigurace původní dist nepřepíše. Offline fixture build vyžaduje explicitní `ANASTASIA_OFFLINE_FIXTURES=1`; není určen pro předání.
2. Proměnná `ANASTASIA_STRIPE_PUBLISHABLE_KEY` se dříve do výstupu vůbec nepromítala a template měla natvrdo starý testovací klíč. Build nyní tuto veřejnou hodnotu skutečně dosadí; šablona nemá klíče a region jiného prostředí. Tajné klíče odmítá.
3. Dva submit handlery stejného produktového formuláře způsobily dvě skutečná přidání po jednom kliknutí. Reprodukce před opravou: 2 POST a množství 2. Po opravě: 1 POST a množství 1. Jeden handler, blokace během odesílání a upozornění na kontrolu košíku při nejednoznačné síťové chybě.
4. Souhrn zobrazoval dopravu dvakrát; duplicitní řádek odstraněn. Serverové ceny/daně a doprava se nemění.
5. Aktivní backend worktree neměl původní veřejné fotografie ve `static/legacy-catalog`. Obnoveno 30 původních veřejných souborů ze stejného původního backendu, bez změny katalogu nebo soukromého R2. Gitignorované soubory nejsou v PR; postup je v README.

## VERIFIED – skutečný lokální provoz

- Backend :9100, web :4174 a admin :4178 odpovídají HTTP 200. Web po opravě běží z `codex/handoff-check`, backend zůstává v `codex/protected-library-r2`. Žádná zákaznická síťová odpověď se nenahrazuje fixture.
- 174/174 Chrome kontrol: všech 14 skutečných produktů, skutečné ceny/fotografie/kompletní popisy, responzivita a CSP.
- 17/17 Chrome kontrol nákupu: reálné přidání fyzického a digitálního produktu do nového anonymního košíku, každé jednou; změna množství, povinné údaje a adresa, přechod do platby, správné odmítnutí nepřihlášeného nákupu, žádná platební ani zprávová API volání; pokladna bez přetékání 320/390/800/1440 px. Položky pouze těchto kontrolních košíků odstraněny jejich vlastním Store UI. Nevzniká účet ani umělá objednávka v reálném náhledu.
- 35/35 skutečných kontrol původního R2 a historických nároků: obě zakoupené knihovny, podepsané čtení, Range/HEAD a odmítnutí špatného tokenu/klíče, skutečný posun video/audio přehrávače. Jde o smoke se dvěma soubory, nikoli nové úplné čtení všech 24 objektů; úplný předchozí důkaz je 189/189 v protected-library-r2.md.
- 81/81 frontend unit/contract testů: včetně explicitní build konfigurace, zachování existujícího dist, jediného submitu a zámku během požadavku. Připojený build PASS. Offline fixture build pouze v odděleném pracovním stromu/CI.
- Počet skutečných objednávek, zákaznic a grantů se nezměnil; notifikace před/po = 0. Nové anonymní kontrolní košíky jsou prázdné. Soukromé mediální soubory se neměnily.

## Dokončení platby a návaznost – izolovaná CI

Pozitivní dokončení nákupu se neprovádí pod cizí historickou zákaznicí ani vnášením umělých objednávek do reálného náhledu. Nativní HTTP/PG běhy pouze GitHub Actions ověřují fyzický/digitální/smíšený nákup, serverové částky a DPH/dopravu, capture, nezaplacený stav, historii a správný digitální grant, replay a izolaci. Členská integrace ověřuje také 3DS, obnovu, refundy a zastavení.

Předchozí přesný runtime na masteru7b65723: backend/NEXUS39233409906 SUCCESS (1034 unit +153 nativních scénářů), členská integrace39232416173 SUCCESS. Aktuální opakované běhy a konečný výsledek jsou zaznamenány v PR tohoto balíku a v koordinačním souboru. Netvrdit, že nativní CI představuje nový úplný browser nákup na vzdáleném prostředí Lucie.

## Další hranice

Soukromý upload z vlastního adminu je samostatný nedokončený balík; přejmenování/pořadí existujících souborů je PR53, dosud nesloučené. Platby, dopravci, štítky a osobní odběr mohou být nabídnuté jen podle skutečně nastavených poskytovatelů; tato kontrola nepředstírá provozní napojení nevyplněných API. Apple Pay/Google Pay na zařízeních Lucie nebyly ověřeny. Živé e-maily/platby a ostré spuštění vyžadují vlastní přejímku.
