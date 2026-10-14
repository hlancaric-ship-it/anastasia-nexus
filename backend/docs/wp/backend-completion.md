# Dokončení backendu před administrací

Větev Codex: `codex/backend-admin-readiness`. Integrátor: Claude, `claude/backend-integration`.
Admin UI se nezačíná před dokončením a ověřením backendových kontraktů.

## Ochrana uplatnění poukazů

`POST /store/gift-vouchers/apply` má sdílený limit **20 pokusů za 60 sekund na síťového klienta**.
Počítají se i nesprávně formátované kódy. PostgreSQL UPSERT atomicky rozhoduje i při více procesech;
nejde o paměťový limit jedné instance. `req.ip` určuje Express podle skutečného nastavení důvěry proxy,
middleware nepřebírá přímo klientské `X-Forwarded-For`. Proxy musí předávat skutečnou adresu a backend
smí důvěřovat pouze své infrastruktuře; při společné adrese klienti sdílejí limit.

Migrace `Migration20261014230000` vytváří `gift_voucher_rate_limit`. Ukládá SHA-256 identifikátor klienta,
čítač a expiraci; žádný kód poukazu ani původní adresu. Hash je pseudonymní údaj, nikoli anonymizace.
Job každých 10 minut odstraňuje záznamy expirované déle než hodinu. Čítač se zastaví na 21.
Odmítnutí vrací `429 GIFT_VOUCHER_RATE_LIMITED`, slovenskou hlášku a `Retry-After`.
Nedostupná databáze vrací 503 a uplatnění nepustí. Chybový log neobsahuje databázový payload.
Nasazení musí nejprve aplikovat migraci; bez ní uplatnění bezpečně vrací 503.

## Trvalá historie pohybů poukazu

`GET /admin/vouchers/:id/transactions?limit=50&offset=0` vyžaduje přihlášeného správce a vrací
`voucher_id`, `currency_code`, `transactions`, `count`, `limit`, `offset`. Maximum stránky je 100.
Pohyby jsou řazeny podle času a ID sestupně. Hodnoty `amount` a `balance_after` převádí server
z centů na EUR; frontend je pouze formátuje. Odpověď obsahuje typ pohybu, interní ID,
vazbu na košík/objednávku/původní pohyb, správce a čas/čas kompenzace.
Neobsahuje kód, kontakty, poznámky, idempotency klíče ani libovolná metadata.
Neexistující poukaz vrací 404, odpovědi nejsou cachovatelné.

Historie zpřístupňuje existující `gift_voucher_transaction`, nevytváří druhý účetní deník.
Společnou korelaci a logování ostatních domén vlastní Claude. Toto ještě není přehled všech logů.

## Ověření

- TypeScript PASS.
- Pět unit testů limitu PASS; čtyři unit testy auditu PASS.
- Plná unit sada s limitem: 310/310 PASS; audit přidán následně, úplná sada se zopakuje na integrovaném základu.
- HTTP runner: probíhá; zahrnuje 25 souběžných požadavků (20×400 pro neplatný kód, 5×429),
  sdílený čítač, obnovení po expiraci a ověření ochrany/měny/pohybů auditu.

Žádný push, deploy, produkční databáze ani skutečný e-mail.

## Retence uzavřeného chatu

Job `chat-retention` každých deset minut odstraní text zpráv a předmět konverzací uzavřených
déle než `CHAT_RETENTION_DAYS` dní (výchozí 365, povolené celé číslo 30–3650). Neplatná
konfigurace nic nemaže. Zpracovává maximálně 100 konverzací za transakci, se stejným zámkem
řádku jako zavření/znovuotevření; souběžný job zamčené konverzace přeskočí.
Opakovaný běh už odstraněný obsah znovu nepřepisuje. Otevřený ani nedávno uzavřený chat se nemění.

Text se nahradí slovenským oznámením o odstranění. ID, autor/role, časové značky a vazby na
objednávku zůstávají zachované: jejich odstranění by změnilo limity zpráv napříč konverzacemi.
Jde o retenci obsahu, **nikoli úplnou anonymizaci zákaznického účtu ani vyřešení celého GDPR**.
Znovuotevření obnoví možnost odpovědi, nikdy odstraněný text. Log obsahuje pouze souhrnné počty.
Deset unit testů PASS; nový HTTP scénář kontroluje skutečný obsah, idempotenci a zachované limity.

## Export 301 mapy z katalogu

`npx medusa exec ./src/scripts/export-edge-redirects.ts` čte publikované produkty a aktivní
veřejné kategorie z DB v dávkách po 100. Z `metadata.legacy_path` a uloženého handle vytváří
`ci-evidence/edge-redirects.json` v pracovním adresáři backendu (volitelně `file=ci-evidence/name.json`).
Používá stávající routy `/eshop/produkt/…` a `/eshop/kategoria/…` z importéru; rodičovskou
cestu kategorie zachovává. Nevymýšlí cíle chybějících stránek ani export skrytých produktů.
Manifest je určen k lokální kontrole a následnému napojení Claudem, nic se nenasazuje.

Každý záznam má `from`, `to`, `status:301`, `preserve_query:true`; pouze GET/HEAD.
Worker musí zachovat původní query, včetně QR parametrů, a fragment klienta ponechat prohlížeči.
Výstup obsahuje pouze relativní cesty, nemůže přesměrovat na cizí host. Export odmítá konflikty,
řetězce/smyčky, nekorektní cesty a self-redirecty vynechává. CSV GSC a pravidla kanonizace hostu
zůstávají samostatným vstupem, nejsou nahrazené katalogovými přesměrováními.
Jedenáct unit testů PASS (nebezpečné cesty, konflikty, cykly, shodné cíle, stránkování).
