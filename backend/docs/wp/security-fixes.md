# Opravy po red-team kontrole (15. 10. 2026)

Větev `codex/security-fixes`, základ `master@232c149`. Zadání Luckyho: opravit potvrzené chyby
z kontroly přihlášení, médií a kupónů. Redovy auditní větve a cizí rozpracovaný ownership guard
v hlavním worktree se nemění. Nic se nenasazuje.

Stav: **VERIFIED** na revizi `6433343c630a4aa79365a24cce76f2431ff53d72`; opravy a jejich zapojení prošly plnou syntetickou regresí na GitHub Actions. Větev není sloučená ani nasazená.

## Přihlášení

Původní nativní `getState` nejprve přečetl a smazal čekající stav a teprve provider porovnal token.
Chybný token tak zrušil platný odkaz. Samostatné cache get/delete také neměly garantovat atomické spotřebování.

Nový modul `auth-security` vlastní tabulky `auth_link_state` a `auth_link_rate` (migrace `Migration20261015080000`).
Provider ukládá do PostgreSQL SHA-256 normalizovaného e-mailu, hash náhodného tokenu a expiraci.
Ověření používá jediný `DELETE ... WHERE id = ? AND token_hash = ? AND expires_at > now() RETURNING id`.
Chybný pokus nic nemaže; dva souběžné správné pokusy nemohou oba spotřebovat tentýž záznam.
Zůstává platný pouze nejnovější odkaz pro danou adresu. TTL zůstává 15 minut.
Cache tokeny vydané před přechodem se nepřenášejí: zákaznice si musí vyžádat nový odkaz.

Middleware pro nativní GET/POST `/auth/:actor_type/:auth_provider` vyhodnocuje dekódovaný provider,
ostatní providery ponechává beze změny a u magic-link povoluje pouze customer aktéra
(jiný aktér vrací 404, takže nemůže obejít limiter) a omezuje:

- klienta na 60 auth pokusů za 15 minut;
- adresáta na 3 žádosti o nový odkaz za 15 minut (potvrzení tuto kvótu nečerpá).

Čítače jsou atomické PostgreSQL UPSERTy, sdílené mezi procesy. Při limitu vrátí 429,
`Retry-After` a slovenskou hlášku; při nedostupném úložišti 503, bez volání auth handleru.
Limiter pokrývá také procentně zakódované názvy provideru (např. `%6dagic-link`);
nejde jen o shodu s doslovnou URL. IP bere z `req.ip`, nikoli přímo z nedůvěryhodné forwarded hlavičky. Správce proxy musí správně nastavit důvěryhodné proxy.
Hash adresy/IP je pseudonymní údaj. Cleanup každých 10 minut maže expirované stavy a limity,
nejvýše 10 000 řádků z každé tabulky na běh.

GDPR execute odstraní také nové PG tokeny pro skutečně ověřené e-mailové identity;
stávající tombstone ochrana a zrušení starých cache stavů zůstávají zachované.

## Média a HLS

Token playlistu už neznamená oprávnění ke všem souborům stejné složky. Přímé soubory musí
odpovídat tokenu přesně; HLS potomci musí být výslovně odkazovaní v důvěryhodném playlistovém stromu v R2.
Čtení variantních playlistů je omezené na 32 playlistů, hloubku 6, 10 000 URI a 1 MiB textu playlistu.
Cykly se zpracují pouze jednou. Neznámý soubor se vůbec nečte z R2, odpověď je 403.
Odkazy mimo kořenovou složku playlistu nejsou povolené.

Playlist se přepisuje na cesty `/api/media/v1/<objekt>?t=...`; funguje proto i původní issuer URL,
která zakódovala celou cestu včetně lomítek. Zachovává query/fragment a nahrazuje starý parametr `t`.
Token se nepřidává k absolutním ani protocol-relative externím URL. Podporované jsou také
`URI="..."` odkazy na HLS klíče a variantní playlisty.

Ověření podepsaného tokenu navíc vyžaduje zákaznici, produkt, nonce, celočíselnou expiraci a nejvýše
900 sekund zbývající platnosti. Nejde o online revokaci: již vydaný token může fungovat do expirace
(výchozí 600 sekund). Okamžité zneplatnění po refundu a DRM tento balík nepředstírá.

## Kupóny

Současný NEXUS adaptér používá jednu procentní sazbu pro všechny položky. Proto nově odmítá
nativní podmínky, které neumí přesně vynutit: zákaznická/cart pravidla, target/buy pravidla,
množstevní omezení, jiný target než položky a jiný promotion typ než standard.
Všechny potřebné relace se načtou před rozhodnutím. Neznámý nebo nepodporovaný kupón vrací
`COUPON_INVALID`; žádná podmínka se nesmí zahodit a změnit v globální slevu.

**Rozsah:** běžné nepodmíněné procentní kupóny zůstávají funkční. Podmíněné kupóny se nyní
bezpečně odmítnou i u oprávněné zákaznice. Plná podpora těchto typů vyžaduje oddělené napojení
nativního vyhodnocení pravidel do NEXUS cen, nikoli další ruční seznam částečně podporovaných operátorů.
Původní audit neprokázal dokončení neoprávněné objednávky; oprava uzavírá prokázané chybné přecenění.

## Zapojení ve větvi a integrační podmínky

1. Do seznamu modulů v `medusa-config.ts` přidat `{ resolve: "./src/modules/auth-security" }` a aplikovat migrace.
2. V `src/api/middlewares.ts` importovat `authMagicLinkMiddlewares` z `./auth-magic-link-middlewares` a rozbalit
   **po** `customerPrivacyMiddlewares`, před endpointovými handler routami.
3. Do běžného syntetického HTTP runneru importovat a sériově zavolat:
   - `verifyAuthSecurity({ api, container, evidence })`;
   - `verifyCouponSecurity({ api, container, options, channel, region, profile, evidence })`.
   Při gift-only/booking-only je vynechat stejně jako ostatní nezávislé skupiny.
4. Spustit plný GitHub Actions běh. Ověřit nejen stav jobu, ale jednotlivé `SECURITY_AUTH_*` a `SECURITY_COUPON_*` scénáře.
   Nové media regresní testy se spouštějí v Node i skutečném workerd.

Config, globální middleware a hlavní runner jsou zapojené pouze v této izolované větvi, protože původní
integrační terminál již nebyl dostupný. Kanonický pracovní strom ani Redova větev se nemění.
Při převzetí musí zůstat celý tento řetězec zachovaný; provider bez migrace není použitelný.
Nové externí závislosti nejsou potřeba.

## Ověření

- Cílená media regrese: 13/13 PASS (původní + nové Node testy).
- První cílený backend fokus: 30/30 PASS (provider, persistent state, rate middleware, kupóny).
- Dodatečný backend fokus včetně privacy: **41/41 PASS** (5 sad); následný rozšířený limiter fokus **6/6 PASS**, TypeScript **PASS**.
- Lokální PG/HTTP ani plná sada nebyly spuštěny; konečné runtime ověření pouze Actions.

### Konečný důkaz

[Actions 38745406536](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38745406536):
oba joby SUCCESS. Artefakty byly stažené a jednotlivé výsledky přečtené:

- backend **533/533 PASS**, včetně TypeScriptu;
- NEXUS **1183/1183 PASS**, striktní TypeScript PASS;
- skutečný workerd **46/46 PASS**;
- celý Medusa/PostgreSQL HTTP běh **131 scénářů PASS**;
- nových pět auth a tři coupon scénáře **8/8 PASS**, včetně zakódované cesty v testu limiteru.

Trvalý souhrn je v [security-fixes-ci.json](evidence/security-fixes-ci.json).
Poukazy, rezervace, souhlasy, GDPR, storna, sklad a doprava zůstaly součástí společného běhu.
Předchozí selhání typové kontroly a neplatná testovací kombinace allocation/max_quantity byly
opravené; zelený výsledek výše platí pro konečný kód, nikoli pro tyto předchozí běhy.
Lokálně nebyl spuštěn PG/HTTP ani plná unit sada. Žádné nasazení ani merge.
