# Návrh: odhlásenie zákazníka zo všetkých zariadení cez `session_epoch`

**Stav:** návrh, bez implementácie. Súčasné odhlásenie zneplatňuje iba konkrétny Bearer JWT cez `auth_token_revocation`.

## Cieľ a navrhované správanie

Pridať zákaznícky epochový čítač relácie. JWT nesie podpísaný `session_epoch` vydaný pri prihlásení; autorizačný middleware porovná claim s aktuálnou epochou zákazníka v úložisku. Ak sa hodnoty nezhodujú, request sa odmietne ako `401 SESSION_REVOKED`. Zvýšenie epochy zneplatní všetky predtým vydané zákaznícke tokeny naprieč zariadeniami.

Odporúčané hranice:

- Bežné odhlásenie zostane odhlásením konkrétneho tokenu; samostatná akcia „Odhlásiť všetky zariadenia“ zvýši epochu.
- Úspešná zmena alebo reset hesla a bezpečnostne vynútené odhlásenie zvýšia epochu. Pri zmene hesla sa treba rozhodnúť, či používateľ dostane nový token s novou epochou alebo sa musí znovu prihlásiť; predvolený návrh je vyžadovať nové prihlásenie.
- Nové JWT dostanú aktuálnu epochu. Tokeny bez epoch claimu sa počas prechodu posudzujú podľa výslovne schválenej kompatibilitnej politiky; bezpečný cieľový stav je ich odmietnuť po ukončení prechodného obdobia.

## Úložisko a transakcie

Pridať aditívne pole `session_epoch` s predvolenou hodnotou `0` k stabilnému zákazníckemu záznamu, prípadne samostatnú tabuľku s unikátnym `customer_id`. Pred výberom treba overiť podporovaný spôsob rozšírenia zákazníckeho modelu v používanej verzii Medusa. Epochu nikdy neukladať iba do cache, ktorá sa môže medzi inštanciami líšiť.

Zvýšenie epochy musí byť atomický SQL update (`session_epoch = session_epoch + 1`) a musí prebehnúť v tej istej transakcii ako úspešná zmena hesla, ak ju vykonáva aplikácia. Retry nesmie epochu znížiť ani obnoviť starý token. Nepoužívať e-mail ako kľúč: identita zákazníka je nemenné customer ID.

## Overovanie JWT

Po kryptografickom overení JWT načítať jeho `actor_id` a epoch claim; porovnanie musí prebehnúť pred obsluhou chráneného store requestu. Chýbajúci zákazník, neplatný claim alebo nesúlad znamená odmietnutie. Pri nedostupnom úložisku je pre chránené zákaznícke endpointy bezpečný návrh fail closed s `503 AUTH_UNAVAILABLE`; verejný katalóg bez Bearer tokenu nemá vyvolávať DB lookup. Nezapisovať JWT ani epochu do logov.

Je potrebné overiť, že kontrola pokrýva všetky cesty, ktoré prijímajú customer Bearer token vrátane obnovy tokenu a vlastných auth endpointov, a že admin tokeny nepoužívajú zákaznícku epochu. Existujúca revokácia konkrétneho tokenu môže zostať ako doplnková ochrana alebo sa jej odstránenie riešiť samostatne po overení pokrytia.

## Migrácia a nasadenie

1. Aditívna migrácia vytvorí epochu pre existujúcich zákazníkov s hodnotou `0`; bez mazania ani resetovania existujúcich revokácií.
2. Nasadiť vydávanie claimu a čítanie epochy v režime kompatibilnom s existujúcimi tokenmi, ak to bezpečnostné rozhodnutie dovolí.
3. Po potvrdení pokrytia začať vydávať iba epochové tokeny a zvoliť konečný dátum odmietania legacy tokenov. Klienti sa po jeho dosiahnutí znovu prihlásia.
4. Overiť rollback: odstránenie kódu nesmie vyžadovať zmazanie epochových dát; databázový rollback sa nemá použiť ako bežný spôsob návratu.

## Testy a akceptácia

- Dve zariadenia: oba tokeny fungujú, zvýšenie epochy ich oba odmietne; nový token s aktuálnou epochou funguje.
- Súbeh dvoch resetov/zvýšení nestratí inkrement; opakovaný request nemení epochu späť.
- Token iného zákazníka ani admin token sa nedá overiť proti cudzej/nesprávnej epoche.
- Legacy tokeny majú pokryté obe fázy kompatibility; chýbajúci zákazník a poškodený claim fail closed.
- DB chyba v chránenom requeste vráti `503`; request bez Bearer tokenu na verejnom katalógu zostáva bez epoch lookupu.
- Reset hesla a zvýšenie epochy sa otestujú aj pri rollbacku transakcie; pri zlyhaní resetu sa nesmie heslo zmeniť bez zodpovedajúcej epochy ani naopak.
- E2E overí logout-all na dvoch nezávislých klientoch a opätovné prihlásenie.

**Rozhodnutia pred implementáciou:** UX a názov akcie „všetky zariadenia“, správanie po zmene/resetovaní hesla, kompatibilita existujúcich JWT a potvrdený Medusa hook/model pre bezpečné uloženie epochy.
