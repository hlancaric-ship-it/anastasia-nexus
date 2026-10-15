# Trvalé zpracování fronty nejistých výsledků

Stav: IMPLEMENTED_UNVERIFIED pro skutečnou D1 do dokončení CI. Navazuje na intent-recovery a NEXUS_AUTONOMY_SPEC.md §2–3. Vlastní větev codex/intent-reconciliation; žádný deploy, externí platba nebo dokument.

## Problém a nejmenší kompatibilní změna

Existující reconcileIntent dokázal porovnat záměr a skutečný stav, ale sám výsledek neukládal. Zastaralý read-back mohl při zpracování fronty patřit jinému pokusu a LOG_INFERRED úspěch nešlo přes běžný recordOutcome povýšit na skutečně ověřený bez nepovoleného přechodu EXECUTED → EXECUTED.

Plán: použít existující porovnání; doplnit atomické uložení přesného ověřovaného snapshotu; omezit čtení i celou dávku; nepovolit žádný obchodní zápis; nejednoznačné případy ponechat k řešení.

## Chování

- `recordReconciliation` přijímá stav, číslo pokusu a čas snapshotu. Změna je přípustná jen pro aktuální UNKNOWN nebo EXECUTED/LOG_INFERRED. D1 ověřuje totéž v podmíněném SQL UPDATE. Jiný tenant, novější pokus nebo mezitím ověřený výsledek se nepřepíše.
- CONFIRMED uloží EXECUTED/SYSTEM_CONFIRMED a vyřadí operaci z fronty. U dřívějšího odvozeného úspěchu pouze posílí potvrzení; terminální operace se neotevírá.
- NOT_EXECUTED se může uložit jako FAILED jen z UNKNOWN. V dávkovém zpracování navíc vyžaduje výslovný důkaz registrované doménové policy, že je bezpečné prohlásit zápis za neprovedený. Pouhá shoda současné hodnoty s původní nestačí: starý timeoutovaný požadavek mohl být stále zpracováván.
- Chybějící cíl, odlišná hodnota nebo neznámá operace se nemění a vracejí potřebu řešení. Nedostupné čtení zůstává pro další ověření. Žádná cesta sama neopakuje obchodní zápis.
- `reconcileStoredIntents` přijímá pouze serverem registrované handlery pro přesné domain/connectorType/operation. Duplicita je chyba, ne tiché přepsání policy. Nemá HTTP vstup ani klientem volitelné URL.
- Čtení má timeout a AbortSignal; součin limit × timeout je nejvýše 30 sekund. Dávka má nejvýše 100 operací. Při jedné chybě se pokračuje další položkou. Návrat obsahuje ID a kódy výsledků, nikdy payload nebo obsah chyby konektoru.
- Fronta má stabilní pořadí podle času a ID v obou úložištích.

## Ověření

Sdílený kontrakt nad in-memory store a skutečnou D1: potvrzení a replay, odvozený úspěch, zamítnutí slepého retry, prokázané neprovedení, odlišný/chybějící cíl, neznámá operace, timeout, chyba porovnání, zastaralý read-back po novém pokusu, tenant izolace, omezení dávky, duplicitní policy a zákaz otevření terminální operace.

Lokálně 58/58 cílených testů PASS, oba TypeScript projekty PASS. Úplná regrese, skutečná D1/workerd a HTTP/PostgreSQL pouze GitHub Actions. Výsledek se zaznamená po dokončení.

## Meze a další krok

Jde o trvalé propojení existujícího porovnání a úložiště, nikoliv nový workflow framework nebo další obchodní databázi. Handlery konkrétních obchodních operací nejsou domyšlené ani předstírané: následuje napojení na konkrétní autoritativní API a jeho testovací prostředí. Do té doby není obecná fronta zapnuta s vymyšlenými konektory a nelze tvrdit úplnou obchodní autonomii.
