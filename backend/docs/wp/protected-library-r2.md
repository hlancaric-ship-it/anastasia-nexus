# R2, zakoupený obsah a skutečný storefront

## Implementace

Používá se původní soukromý bucket `anastasia-media`, který už naplnil Claude. Nezakládá se náhradní úložiště a nic se nenasazuje. Ověřen skutečný inventář: RESET 40+ má 17 MP4 (lekcia-00 je podle výslovného upřesnění majitele lekce 1, dále 02–17); Nič nemusíš má 7 MP3 včetně označené ukázky Audio 0. Samotných 16 tematických týdnů není seznam 16 vymyšlených souborů.

- `GET /store/entitlements` vrací skutečné aktivní nároky přihlášené zákazník s názvem produktu a omezeným seznamem přiřazených souborů. Neposílá ostatní produktová metadata. Stránkování, zákazníková autentizace a izolace nároků zůstávají zachovány.
- `POST /store/media-access` dál používá existující entitlement guard a podpis z jádra; finanční ani přístupové jádro se nemění. Vydání odkazu vyžaduje aktivní nárok a přesný klíč z registru daného produktu. Doručení kontroluje podpis, objekt a expiraci; podporuje Range a HEAD.
- Samostatný `protected-media/worker.ts` skládá existující doručovací handler s omezeným CORS. `protected-media/wrangler.jsonc` používá původní bucket. Lokální `dev-server.mjs` připojuje stejný handler přes existující AWS SDK ke skutečnému R2; poslouchá výhradně na 127.0.0.1. Žádné veřejné listování, upload API ani veřejné URL bucketu.
- Knihovna i karta Moje programy v účtu zobrazují skutečné názvy a soubory, video/audio přehrávač, obnovu krátkodobého odkazu a vodoznak. Nezakoupený či nedostupný obsah se nevymýšlí. HLS používá lokálně přibalené hls.js 1.7.3 s licencí; současné původní soubory jsou MP4 a MP3.
- `link-protected-library.ts` obsahuje idempotentní přiřazení skutečných objektů ke dvěma existujícím produktům. Výchozí režim dry-run, apply pouze při `PROTECTED_LIBRARY_APPLY=1`. Odlišný již existující neprázdný registr odmítá přepsat. Nemění ceny, objednávky, nároky ani oznámení.

## Důležitá integrace nákupního toku

Vizuální preview vycházelo z větve, jejíž adaptér neměl novější připravené nákupní funkce. Při začlenění designu proto explicitně zachovány všechny implementované metody rezervací, Klubu, právních souhlasů, dárkových poukazů, profilu, chatu a dopravy. Vlastní pokladna opět připravuje skutečný košík, adresu a nativní shipping options podle přepravních profilů. Server zůstává jediným zdrojem ceny, dopravného, daní a slev.

Runtime neobsahuje `...mock` fallback a ani `?mock=1` či useMock nemohou zákazníkov web přepnout na smyšlená data. Testovací fixture adaptér je dostupný jen explicitním předáním v testech. Statické schválené autorské texty nejsou zákazníková transakční data.

Pokladna nově odlišuje PAID od PENDING; bez potvrzené platby neslibuje zaplacení či aktivní obsah. Objednávka, jejíž serverový součet je přesně 0, nevyžaduje platební kartu. Ostatní částky projdou skutečným poskytovatelem. Dvojité odeslání formuláře je blokované; nejednoznačná chyba odkazuje zákazníci na kontrolu stavu v účtu před opakováním. Souhrn ukazuje nativní cenu dopravy.

## Ověřený lokální stav

- Původní R2: 24/24 objektů existuje, velikosti odpovídají předchozímu inventáři. Žádný objekt se nepřepisoval.
- Dvě původní položky místního reálného katalogu mají přiřazeno 17 + 7 souborů. Dry/apply/read-back PASS; další apply mění 0 produktů. Původní metadata zachována. Soukromá záloha pouze v ignorovaném `backend/data-private/protected-library`.
- Přímé ověření přes skutečný lokální backend, skutečné historické nároky a původní R2: 189/189 PASS. Všech 24 souborů ověřeno přes podepsaný odkaz a Range; video i audio se skutečně přehrávaly (ověřen posun času) v Chrome v zákazníkové sekci. Neplatný token, nepřiřazený soubor a anonymní zákazník odmítnuty. Účet bez přetékání na 320/800/1440 px. Pouze čtení; žádní noví zákazníci, objednávky či umělé soubory.
- Backend tsc PASS; nové katalogové API 3/3 unit PASS. Gateway 8/8 unit PASS. Frontend 74/74 PASS (včetně checkoutu, dopravy, Klubu, nezaplaceného stavu a zákazu fallbacku).
- Doprava pokrytá existujícími nativními CI scénáři: digitální, fyzický a smíšený košík, odmítnutí digitální dopravy fyzickému produktu a pravidlo dopravy zdarma. Nové obohacení zákazníkové knihovny přidáno do existujícího nativního izolovaného scénáře v CI.
- Plné backend/PG běhy pouze GitHub Actions. Lokálně se nespouštěl plný HTTP runner. E-mailový provider je vypnutý; žádné e-maily, pozvánky ani notifikace se neposílají.

## Spuštění a konfigurace

Existující R2 přístupové údaje zůstávají soukromé, žádné tajemství není v repozitáři. Lokální gateway se sestaví existujícím esbuild z `protected-media/worker.ts` do ignorovaného souboru `backend/data-private/protected-library/worker.mjs` a spustí přes `protected-media/dev-server.mjs` s procesními S3 proměnnými a `MEDIA_TOKEN_SECRET`. Backend používá tentýž secret a `MEDIA_DELIVERY_BASE_URL=http://127.0.0.1:9191/api/media`. Storefront build/server dostane `ANASTASIA_MEDIA_ORIGIN=http://127.0.0.1:9191`; CSP povolí pouze toto konkrétní origin. Runtime tajemství zůstávají mimo git a logy. Při lokálním přepnutí backend worktree se přes standardní Medusa loadEnv zachovává původní integrační konfigurace včetně Stripe TEST a NEXUS; vlastní worktree nemá nahrazovat toto prostředí prázdnými defaulty. E-mail provider je procesně znovu vypnutý.

## Co tento důkaz neznamená

Neproběhlo nasazení, přesun do účtu Lucie ani skutečná finanční transakce. Stripe, platební webhooky, členství a grant/refund/cancel životní cyklus ověřuje izolovaná nativní CI regrese; nová platba skutečné zákazník se kvůli ověření nevytváří. Již vydaný mediální token platí nejdéle 15 minut, i když je mezitím nárok odebraný; další vydání/obnova se odmítne. Nejde o DRM.

Konkrétní dopravy a jejich ceny se berou z místní konfigurace Medusy. Tento balík nevymýšlí přihlašovací údaje dopravců, svozovou smlouvu, provozní adresu osobního odběru, Comgate ani živé platební klíče. Bez nich netvrdí ověřené štítky/svoz či nové externí platební metody. Chybějící média dalších programů nejsou nahrazována ukázkami.

## Dodatečné review smlouvy API před merge
První CI PR51 zastavila evidenční kontrola SHA-256 změněného GET /store/entitlements (1033 dalších backend unit prošlo). Provedeno review: povinný customer actor, čtení nároků výhradně podle autentizované identity, metadata query pouze pro product_id z těchto nároků, whitelist media key/title/kind bez ostatních metadat, private/no-store, zachované stránkování a null pro chybějící produkt. Důkazy: nové 3 unit, existující nativní izolace rozšířená o obsah knihovny a původní skutečný R2 read-only průchod. Po review aktualizován konkrétní fingerprint a zdroje feature access; kontrola ani její porovnávání nebyly oslabeny. Následuje nové plné CI, ne lokální PG běh.
