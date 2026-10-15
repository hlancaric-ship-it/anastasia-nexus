# Trvalý příjem Medusa událostí

Stav: IMPLEMENTED_UNVERIFIED pro skutečnou D1 do dokončení CI. Lokálně 15/15 cílených testů a oba TypeScript projekty PASS. Navazuje na NEXUS_AUTONOMY_SPEC.md: příjem → uložení → následné řízené zpracování. Vlastní větev codex/medusa-inbox. Žádné nasazení.

## Problém a plán

Dřívější handler již zapisoval ID doručení před HTTP 200, ale nezachoval tenanta ani odkaz na obchodní záznam. Po restartu šlo jen poznat duplicitu; nešlo událost dohledat ke zpracování. Přitom asynchronní úloha pouze logovala „processed“, bez obchodní operace.

Nejmenší bezpečná změna: zachovat existující podepisování, ukládat jen bezpečný odkaz a stav do trvalé fronty, deduplikovat podle zdrojem ověřeného tenanta, odstranit předstírané dokončení. Nekopírovat zákaznický profil ani objednávku do druhého obchodního jádra.

## Kontrakt a data

- Podpis a MEDUSA_PRICING_TENANT_ID jsou povinné ve všech prostředích. Tenant se nebere z těla. HMAC stále ověřuje timestamp a původní tělo s pětiminutovým oknem. Nepodepsaný vývojový fallback skončil.
- Validuje se objekt, jednoznačný název události a ID doručení/cílového záznamu. Zpracované tělo je omezené na 1 MiB při čtení streamu. Osobní údaje v těle se neukládají ani nelogují.
- Nová aditivní migrace 0006_medusa_webhook_inbox.sql ukládá `(tenant_id,event_id)`, event_type, target_id, hash minimální obálky, processing_state a čas příjmu. Staré účtenky zůstávají nedotčené. Nová tabulka je fronta doručení, nikoliv druhá evidence objednávek/plateb.
- Hash obálky zahrnuje verzi, serverového tenanta, typ a ID cíle. Formátování JSON nebo nepoužívaná pole nemění identitu události. Spotřebitel musí načíst aktuální autoritativní stav Medusy; tělo neurčuje cenu, platbu ani nárok.
- HTTP 200 znamená pouze trvalé převzetí. Odpověď zachovává received/event/eventId/duplicate. Žádné „processed“ ani závislost na waitUntil.
- Stejné ID a obálka vrátí duplicate. Jiné cílové ID nebo typ pod stejným doručením vrací 409 WEBHOOK_CONFLICT, původní řádek se nepřepíše. Shodná ID různých serverově ověřených tenantů jsou oddělená.
- Staré receipts bez tenanta/cíle se automaticky nepřevedou na čerstvou práci: replay vrací 409 k ručnímu dohledání. Tím nevzniká falešný příslib bezpečného opakování historických efektů.
- Z dosud rozpoznaných typů order.placed/customer.created se uloží RECEIVED. Jiný typ je trvale NEEDS_REVIEW a má varování pro stávající ops ingest. Neztrácí se tichým potvrzením.
- Chyba DB vrací 503, nikoliv potvrzení příjmu. Cena, platba, sklad ani kód poukazu se tímto handlerem nemění.

## Ověření a meze

Unit testy ověřují podpis, expiraci, potvrzení po zápisu, duplicitu, konfliktní cíl, chybějící identitu, vadné obálky, výpadek úložiště a limit těla. Workerd testy proti skutečné D1 ověřují trvalý minimální záznam, souběh osmi doručení, izolaci tenantů, nepřepsání konfliktu, neznámý typ a zachování starých receipts. Plný běh včetně backend/PG pouze GitHub Actions.

Tento balík nepředstírá spotřebitele fronty ani konkrétní obchodní efekt. Další krok je zmapovat skutečné události Medusy a propojit jejich bezpečné doručování s konkrétními operacemi a již ověřeným ExecutionIntent/reconciliation. Při zapojení spotřebitele musí být nárokování práce, deadline, aktuální autoritativní read-back a audit; pouhé přejmenování logu není implementace toku.
