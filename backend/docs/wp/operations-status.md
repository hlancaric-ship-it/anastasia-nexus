# Chráněný přehled zpracování pro administraci

Stav: IMPLEMENTED_UNVERIFIED pro úplné HTTP/D1 ověření do dokončení CI. Vlastní větev codex/operations-status, navazuje na NEXUS_AUTONOMY_SPEC.md §3.9–10. Žádný deploy a žádný zásah do obchodních dat.

## Plán a změny

Po bezpečné obnově operací, trvalém ověření výsledku a inboxu událostí chybělo jejich čtení pro obsluhu. Doplněn pouze chráněný přehled, nikoliv ruční tlačítko „označit jako zaplaceno“ nebo slepé opakování.

- `GET /api/nexus/operations?kind=executions|events&limit=25&offset=0`: pouze serverová identita Medusy, tenant svázaný s credentialem. Cizí tenant, browser Origin nebo nepovolený filtr se odmítne před DB čtením.
- Počet a stránka se čtou stejnou D1 dávkou. Limit 1–100, offset 0–10000, stabilní časové pořadí a ID. SQL tabulka/sloupce pocházejí ze serverového allowlistu.
- Odpověď verze 1 vrací ID, typ, stav, pokus, čas změny, lidský slovenský popis a potřebu zásahu. Payload, očekávaný obsah, odkaz na zákaznici, raw failure text ani klíče se nevracejí. Nejistý/odvozený výsledek má „Treba overiť výsledok“, nikoliv falešné dokončení.
- `GET /admin/ops/nexus`: stávající Medusa admin middleware + vlastní kontrola aktéra. Zákaznice ani anonymní návštěvník přístup nedostane. Frontend nevolá Worker přímo a nedostává service credential.
- Backend odvozuje URL `/operations` z existujícího NEXUS_PRICING_URL nebo přijímá serverové NEXUS_OPERATIONS_URL. HTTPS, případně izolovaný loopback HTTP; URL s přihlašovacími údaji je odmítnutá. Redirect se nenásleduje, timeout je 5 s.
- Odpověď zdroje musí odpovídat tenantovi, verzi, požadované stránce a schématu. Neočekávaná pole se odstraňují ještě před předáním do adminu. Klient nemůže zvolit cizího tenanta ani libovolné URL.
- Všechny odpovědi admin cesty a úspěšný Worker přehled mají Cache-Control: no-store. Výpadek/nesoulad vrací srozumitelnou slovenskou hlášku a zapisuje redigovanou chybu do stávajícího provozního auditu; nevrací nuly předstírající zdravý systém.

## Testy

Lokálně 23/23 cílených backend unit testů a backend/NEXUS/Workers TypeScript PASS. Workerd proti skutečné D1 kontroluje identitu služby, cizího tenanta, soukromá pole, lidské stavy, inbox a nepovolené dotazy.

HTTP/PG runner má nový scénář s pravou Medusa autentizací administrátora/zákaznice a skutečným lokálním HTTP zdrojem: 200 pro admina, 401 pro zákaznici/anonymní požadavek, 400 pro klientský tenant, 503 při cizím tenantovi zdroje a redirectu. Ověřuje se, že se credential nepřepošle na redirect a soukromá pole neprojdou. Tento scénář dokazuje HTTP kontrakt proxy; skutečná zdrojová D1 je ověřena zvlášť workerd sadou, nejde o tvrzení o živém produkčním spojení.

Plný backend, NEXUS, skutečný workerd a HTTP/PG pouze GitHub Actions. Výsledek se zapíše po CI.

## Meze

Jde o backendové API pro budoucí vlastní admin, ne hotovou obrazovku. Přehled nedovoluje měnit platbu, přeskočit ověření nebo opakovat nejistou operaci. Historické receipts bez prokázaného tenanta se tímto API nezpřístupňují. Produkční propojení a zapnutí zůstává součástí schváleného nasazení; konkrétní obchodní spotřebitelé fronty stále vyžadují navazující práci.
