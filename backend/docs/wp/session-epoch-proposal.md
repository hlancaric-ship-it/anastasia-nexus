# Návrh: odhlásenie zákazníka zo všetkých zariadení cez `session_epoch`

**Stav:** implementované na vetve `codex/session-epoch`, bez nasadenia. Epochy sú uložené v `auth_session_epoch`; bežné odhlásenie ďalej používa `auth_token_revocation`.

## Cieľ a navrhované správanie

Pridať epochový čítač pre zákaznícke aj admin účty. JWT nesie podpísaný `session_epoch` vydaný pri prihlásení; middleware porovná claim s aktuálnou epochou účtu. Nesúlad alebo legacy token bez claimu vráti `401 SESSION_REVOKED`. Zvýšenie epochy zneplatní všetky predtým vydané tokeny daného účtu.

Odporúčané hranice:

- Bežné odhlásenie zostáva odhlásením konkrétneho tokenu; „Odhlásiť všade“ zvyšuje epochu. Zákaznícke aj admin rozhranie má túto akciu.
- Zmena zákazníckeho hesla a admin reset hesla zneplatní všetky relácie; používateľ sa musí prihlásiť znova.
- Nové actor-bound JWT dostanú aktuálnu epochu. Legacy JWT bez epoch claimu sa odmietajú hneď po nasadení; klienti sa musia znovu prihlásiť.

## Úložisko a transakcie

Samostatná tabuľka `auth_session_epoch` má unikátny kľúč `(actor_type, actor_id)` pre stabilné ID zákazníka alebo admina. Chýbajúci riadok znamená epochu `0`. Epochu nikdy neukladať iba do cache.

Zvýšenie epochy používa atomický PostgreSQL upsert. Nepoužívať e-mail ako kľúč. Zákaznícka zmena hesla aj admin reset zvýšia epochu pred volaním password provideru. Pri chybe zápisu epochy sa heslo nemení; pri následnej chybe provideru sa epoch nevracia. Môže dôjsť k odhláseniu bez zmeny hesla, čo je bezpečné. Kroky nie sú jednou transakciou, ale úspešná zmena nikdy nepredbehne invalidáciu predchádzajúcich relácií.

### C6: hranica natívneho admin resetu

**C6 VERIFIED:** plná backendová regrese 178/178 suites, 1683/1683 testů PASS; následně doplněná sada s instalovaným native validátorem a update route 6/6 PASS (DB a provider jsou syntetické). `npx tsc --noEmit`, mapa API a `git diff --check` PASS.

Medusa 2.19 vykoná `validateToken` (overenie a spotrebovanie jednorazového reset tokenu), potom natívna route zavolá `auth.updateProvider`. Middleware `prepareAdminPasswordEpoch` registruje proxy auth služby len v request scope, ktorý Medusa vytvára cez `container.createScope()`. Proxy na `updateProvider` vyžaduje overený kontext a zhodnú identitu, nájde práve jeden admin účet, atomicky zvýši jeho epochu a až potom zavolá pôvodnú službu. Ostatné metódy sú delegované na pôvodnú službu; zdieľaná služba a ostatné requesty sa nemenia. Žiadne odhlásenie neprebehne len pri príprave middleware bez úspešného overenia tokenu. Neúspešný zápis epochy po spotrebovaní tokenu vyžaduje vyžiadať nový reset odkaz.

Response middleware už admin reset neinvaliduje dodatočne; podpisuje len vydávané JWT. Testy overujú poradie epoch → password, chybu epochy bez zmeny hesla, trvalý inkrement po chybe provideru, izoláciu request scope a odmietnutie starého admin JWT po zmene. Rovnaké poradie a chyby sú pokryté aj pre zákaznícku route.

## Overovanie JWT

Po kryptografickom overení JWT načítať jeho `actor_id` a epoch claim; porovnanie musí prebehnúť pred obsluhou chráneného store requestu. Chýbajúci zákazník, neplatný claim alebo nesúlad znamená odmietnutie. Pri nedostupnom úložisku je pre chránené zákaznícke endpointy bezpečný návrh fail closed s `503 AUTH_UNAVAILABLE`; verejný katalóg bez Bearer tokenu nemá vyvolávať DB lookup. Nezapisovať JWT ani epochu do logov.

Je potrebné overiť, že kontrola pokrýva všetky cesty, ktoré prijímajú customer Bearer token vrátane obnovy tokenu a vlastných auth endpointov, a že admin tokeny nepoužívajú zákaznícku epochu. Existujúca revokácia konkrétneho tokenu môže zostať ako doplnková ochrana alebo sa jej odstránenie riešiť samostatne po overení pokrytia.

## Migrácia a nasadenie

1. Aditívna migrácia vytvorí epochu pre existujúcich zákazníkov s hodnotou `0`; bez mazania ani resetovania existujúcich revokácií.
2. Nasadiť vydávanie claimu a čítanie epochy v režime kompatibilnom s existujúcimi tokenmi, ak to bezpečnostné rozhodnutie dovolí.
3. Pri nasadení začať vydávať iba epochové tokeny a odmietať legacy tokeny; klienti sa znovu prihlásia.
4. Overiť rollback: odstránenie kódu nesmie vyžadovať zmazanie epochových dát; databázový rollback sa nemá použiť ako bežný spôsob návratu.

## Testy a akceptácia

- Dve zariadenia: oba tokeny fungujú, zvýšenie epochy ich oba odmietne; nový token s aktuálnou epochou funguje.
- Súbeh dvoch resetov/zvýšení nestratí inkrement; opakovaný request nemení epochu späť.
- Token iného zákazníka ani admin token sa nedá overiť proti cudzej/nesprávnej epoche.
- Legacy tokeny majú pokryté obe fázy kompatibility; chýbajúci zákazník a poškodený claim fail closed.
- DB chyba v chránenom requeste vráti `503`; request bez Bearer tokenu na verejnom katalógu zostáva bez epoch lookupu.
- Unit testy pokrývajú atomický inkrement, chýbajúci riadok s epochou `0`, chýbajúci claim, starú epochu, nesprávny typ účtu a zlyhanie DB.
- E2E logout-all na dvoch živých klientoch zostáva potrebný po nasadení.

**Implementačné obmedzenia:** Medusa auth response middleware `/auth/*` podpisuje tokeny; admin reset používa request-scoped obal `updateProvider` popísaný vyššie. Pri downgrade migrácia ponechá epochové dáta. Žiadne cloudové prostredie ani deploy neboli použité.
