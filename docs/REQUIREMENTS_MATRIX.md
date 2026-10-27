# REQUIREMENTS_MATRIX: ANASTASIA × NEXUS

Stav k 9. 10. 2026, větev `wave1-base` (commit `1a2ddae`). Jediný zdroj pravdy o tom, co je hotové. Stavy: `NOT_IMPLEMENTED`, `PARTIAL`, `BLOCKED`, `IMPLEMENTED_UNVERIFIED`, `VERIFIED`, `ACCEPTED`, `FUTURE_SCOPE`. `VERIFIED` = spuštěné testy nebo reprodukovatelný důkaz; samotný build nebo existence kódu nestačí.

Zdroje: Smlouva `SMLOUVA-ANASTASIA-FINAL.html` (čl. 2, příloha č. 1), direktiva A-01..A-18 (Lucky, 9. 10. 2026).

## 1. Rozdíl mezi direktivou a smlouvou (rozhodnutí potřebuje Lucky)
Smlouva přiřazuje do **Fáze 2** (ne Fáze 1): jazyky SK/EN/RU (A-14), chráněná média video/audio (A-07), AI asistent s rezervací a úhradou konzultace v chatu (A-08 částečně), ambasadorský program, ComGate. Direktiva je řadí k základu. Plán: backend základ A-07/A-14 připravit teď (je to jádro), ale akceptace Fáze 1 je neváže. Audio EP.001 (A-06) je ve smlouvě nejmenovaný produkt; ověřit, že jde o produkt Fáze 1.

## 2. Smlouva čl. 2, Fáze 1 → balík → stav

| ID | Požadavek (smlouva) | Balík | Stav | Důkaz / blokátor |
|---|---|---|---|---|
| S1-01 | Nový e-shop, SK, bez šablony | storefront (až na závěr) | NOT_IMPLEMENTED | čeká na ověřený backend |
| S1-02 | Katalog: produkty, ceny, kategorie, značky, dostupnost, kupóny | C1 `catalog-import` | VERIFIED | sloučeno do wave1-base; 30 produktů importováno a ověřeno proti reálné DB a živému webu (viz PRODUKTY-SOUCASNY-STAV.md) |
| S1-03 | Košík, objednávky, Stripe (karta, Apple/Google Pay) | K2, K7 | PARTIAL | cart/checkout přes Medusa + NEXUS ověřeno jen unit testy; Stripe provider nezapojen lokálně (chybí klíč) |
| S1-04 | RESET 40+ zachován, zpřístupnění po zaplacení | K3 `entitlement` | IMPLEMENTED_UNVERIFIED | 11 unit testů, migrace proběhla na lokální DB; end-to-end s platbou neověřen |
| S1-05 | SSO a přenos zákaznic, objednávek, přístupů | K6 `auth`, C2 | PARTIAL | C2 spuštěn 9. 10. 2026 na reálném dumpu (souhlas Lucky): 28 řádků zákaznic → 17 migrováno (ostatní bez dokončené objednávky/přístupu), 12 adres, 10 objednávek/31 položek (372 €), 18 entitlementů. `target_after` = `source`, `reconciled: true`; druhý běh beze změny (idempotentní). Hesla NEpřenesena, jen draft tokenů v `data-private/` (gitignored), `send: false` — nic neodesláno. K6 (přihlášení/SSO) nezačato — bez něj zákaznice účet nevyužije |
| S1-06 | Generátor QR v administraci (kupón → URL s automatickou slevou + QR) | C3 `qr-redirects` | IMPLEMENTED_UNVERIFIED | sloučeno do wave1-base, middleware zapojen, tsc+testy zelené; aktivace slevy přes NEXUS/K1 ještě chybí |
| S1-07 | 301 přesměrování všech starých URL a vytištěných QR | C3 | PARTIAL | mapa 44 URL hotová, edge nasazení (Cloudflare Redirect Rules) neprovedeno |
| S1-08 | Administrace na míru, správa produktů/cen/kategorií/kupónů/objednávek/zákaznic | C5 `admin-ui` + Medusa Admin | NOT_IMPLEMENTED | až po K4/K5; Medusa Admin build prošel |
| S1-09 | Zabezpečení, odstranění rizik z auditu | K-sec review | PARTIAL | sloučeno 12. 10. 2026; obchvat SafeOrderu přes standardní Medusa completion **VERIFIED živě** proti reálné Postgres (viz delta níže); Worker strana (auth, COD limit, TLS guard) **VERIFIED živě 12. 10. 2026 přes test:workers na Ubuntu VM** (workerd blocker vyřešen), viz backend/docs/wp/wave1-security.md |
| S1-10 | Potvrzovací e-mail objednávky | E-mail provider | NOT_IMPLEMENTED | rozhodnutí: Resend/SMTP |

## 3. Příloha č. 1, testovací scénáře Fáze 1

| ID | Scénář | Stav | Co chybí |
|---|---|---|---|
| T1-1 | Nákup: výběr, košík, kupón, Stripe, potvrzovací e-mail | NOT_IMPLEMENTED | e2e (C8), Stripe testovací klíč, e-mail |
| T1-2 | Nákup RESET 40+ a automatické zpřístupnění; bez nákupu nedostupné | IMPLEMENTED_UNVERIFIED | e2e proti DB (C8) |
| T1-3 | Přihlášení migrované zákaznice, historie, přístupy | NOT_IMPLEMENTED | C2, K6 |
| T1-4 | Staré URL a QR vedou na správné stránky (301) | PARTIAL | C3, test na sadě starých URL |
| T1-5 | Generátor QR: kupón, URL s automatickou slevou, stažení QR | PARTIAL | C3 |
| T1-6 | Administrace objednatelem | NOT_IMPLEMENTED | C5 |
| T1-7 | Ověření odstranění bezpečnostních rizik | NOT_IMPLEMENTED | závěrečné review |

## 4. Fáze 2 (smlouva), zatím mimo akceptaci Fáze 1

| ID | Požadavek | Stav |
|---|---|---|
| S2-01 | anastasia.academy + aianastasia.com na společném jádru, jedno přihlášení | NOT_IMPLEMENTED |
| S2-02 | SK/EN/RU, ruční přepínání, úprava překladu v administraci | NOT_IMPLEMENTED (C6) |
| S2-03 | Chráněné přehrávání jen pro oprávněné | PARTIAL: rozhraní `ProtectedMediaSigner` v `entitlement/types.ts`, implementace chybí |
| S2-04 | AI asistent, rezervace a úhrada v chatu | NOT_IMPLEMENTED; rezervační jádro (A-08, K9) se staví teď, chat ho jen volá; AI nikdy v cestě peněz |
| S2-05 | Ambasadorský program | NOT_IMPLEMENTED |
| S2-06 | ComGate (volitelně) | FUTURE_SCOPE |
| MIMO | Členský klub/předplatné, Zlatá brána (220 € samostatně) | FUTURE_SCOPE |

## 5. Direktiva A-01..A-18

| ID | Stav | Vlastník | Poznámka / důkaz |
|---|---|---|---|
| A-01 SSO/passwordless | VERIFIED | K6 | Magic-link provider (`backend/src/modules/auth-magic-link`), 15 unit testů. Ověřeno živě na běžícím serveru (`medusa start`): vyžádání odkazu, potvrzení tokenem, jednorázovost, propojení migrované (C2) zákaznice s `has_account: false→true`, JWT nese reálné `actor_id`. Cestou opraveny 3 reálné běhové chyby (izolovaný DI kontejner auth provideru, knex `?` vs. `$1` placeholdery, neexistující sloupec `auth_identity.entity_id`) — podrobnosti v commitech `afd33d1`, `5ada005` |
| A-02 profil a knihovna | IMPLEMENTED_UNVERIFIED | K3 | `GET /store/entitlements` vyžaduje customer auth; test izolace změnou ID chybí |
| A-03 katalog/ceny EUR | IMPLEMENTED_UNVERIFIED | C1, K1 | cena se přepočítá serverově v nexus-cart |
| A-04 checkout/persistence | PARTIAL | K2/K4 | Medusa persistuje; e2e neověřeno |
| A-05 Stripe webhook | NOT_IMPLEMENTED (ověření) | K7 | používá Medusa Stripe provider; podpis/idempotence/částka neověřeny; nedělat vlastní webhook |
| A-06 produkt Nič nemusíš (EP.001, 38 €, 6 stop) | NOT_IMPLEMENTED | C1 seed + K3 | produkt a stopy nezaloženy; ověřit dostupnost a práva k souborům |
| A-07 chráněná média | PARTIAL | K3 | backend hotový a testovaný (9 unit testů): `POST /store/media-access` kontroluje nárok a vydá krátkodobý (max 15 min) HMAC odkaz s vodoznakem a auditem. Worker `nexus/workers/api/routes/mediaDelivery.ts` (ověření tokenu, Range, HLS, 9 unit testů, celá sada NEXUSu 1053/1053 zelená) napsán, na R2 neběžel. CHYBÍ: limit souběžných přehrávání, vytvoření bucketu a bindingu, nahrání médií, vodoznak v přehrávači, test neoprávněného přístupu e2e. Požadavky: soukromý bucket bez veřejné adresy, žádný přímý .mp4, HLS, vodoznak, limit přehrávání; DRM jen volitelně po ocenění. Video RESET 40+ (207 MB) je na starém webu veřejně dostupné; v novém systému jen v soukromém bucketu |
| A-08 rezervace | IMPLEMENTED_UNVERIFIED | K9 `booking` | Hotovo: modul `booking` (hold/confirm/cancel/expireStaleHolds), čistá logika slotů s časovou zónou a letním časem, napojení na objednávku (order.placed/payment.captured potvrdí, order.canceled zruší), store a admin API, server nevěří klientovi (ověřuje nabízené sloty). 20+16 unit testů zelených, `tsc` čistý. OVĚŘENO na reálné Postgres (`anastasia_dev_wave1`): migrace proběhla, částečný unikátní index (product_id, starts_at) nad aktivními stavy skutečně zabrání dvojité rezervaci, zrušená rezervace termín uvolní. NEOVĚŘENO: e2e přes HTTP/checkout, souběh dvou paralelních HTTP požadavků (jen přímý SQL test), notifikace zákaznici a adminovi, admin UI kalendáře (C9), skutečný souběh přes Medusa service vrstvu (možný race mezi findActive a insert mimo transakci). konzultace L005 (69 €, 60 min): objednávka → termín → potvrzení; smlouva čl. 9 a příloha č. 1 to řadí do Fáze 2 (AI chat), základ rezervací se staví jako jádro |
| A-09 administrace | NOT_IMPLEMENTED | C5 | |
| A-10 SafeOrder | IMPLEMENTED_UNVERIFIED | K2 | fail-closed v checkoutu (5 unit testů); Worker route bez auth, logika inline, nepoužívá `RiskEngineRule` |
| A-11 Pricing + tenant | IMPLEMENTED_UNVERIFIED | K1 | tier z `metadata.nexus_tier` (4 unit testy); tenant izolace Workeru neauditována |
| A-12 voucher runtime | PARTIAL | K8 | Worker routy existují, souběh a jednorázovost neověřeny; produkt Voucher nerozhodnut |
| A-13 QR kampaně | PARTIAL | C3 | |
| A-14 SK/EN/RU | NOT_IMPLEMENTED | C6 | Fáze 2 |
| A-15 inventář a migrace | PARTIAL | C2, C4 | |
| A-16 migrace DB a obnova | VERIFIED (lokálně) | K4, C7 | `backup-local.mjs`/`restore-local.mjs`/`db-recovery.cjs` (4 unit testy), jen lokální DB, produkci explicitně odmítá. Ověřeno živě: `pg_dump` vytvořil zálohu (500 KB, sha256 ověřený), obnova do čisté scratch DB vrátila přesné počty (30 produktů, 17 zákaznic, 18 entitlementů) |
| A-17 monitoring/zálohy | PARTIAL | C7 | Lokální zálohování a obnova VERIFIED (viz A-16). **Rozhodnuto 12. 10. 2026 (Jose):** produkční zálohy poběží vlastními skripty C7 (`backup-local.mjs`/`restore-local.mjs`) proti Medusa Cloud Postgres, výstup do R2, **jen ve všední dny** (ne denně — pozor, smlouva čl. 6 mluví o „denních" zálohách, tenhle rozdíl stojí za jednu větu klientce, i když je rozhodnutí hotové). **Spouštěč rozhodnut 12. 10. 2026: GitHub Actions scheduled workflow** (placený plán Jose, bez starostí o limit minut), všední dny. Implementace zatím chybí (čeká na založený produkční Postgres a R2) a půjde jen po review stejně přísném jako po incidentu v bodě 6a: pinované SHA akcí, jen GitHub Encrypted Secrets, čtecí/zálohovací práva bez možnosti mazat/zapisovat do produkční DB, výstup šifrovaně do R2. CHYBÍ: hosting vybrán (Medusa Cloud, tier Develop $29/mo kvůli stropu 50 €/měs, viz níže), přístupy, strukturované logování/monitoring dostupnosti, alerty, plán retence |
| A-18 Zlatá brána | FUTURE_SCOPE | | |

## 5a. Sloučení vlny 1 (9. 10. 2026)
Větve `codex/customer-migration` (C1+C2), `codex/qr-redirects` (C3), `codex/site-inventory` (C4) sloučeny do `wave1-base` bez konfliktů. Middleware C3 zapojen do `src/api/middlewares.ts`. Po sloučení ověřeno: `tsc --noEmit` čistý, `npm run test:unit` 15 sad / 138 testů zelených, `medusa build` prošel, `db:migrate` a import katalogu proběhly na `anastasia_dev_wave1` (30 produktů, booking a entitlement tabulky existují, prázdné).

## 6. Ověřeno 9. 10. 2026 (K4, lokálně)
- `medusa build` OK (backend 16,8 s, admin 69,2 s).
- `db:migrate` na čisté DB `anastasia_dev_wave1` OK, tabulka `entitlement` existuje.
- `anastasia-bootstrap` doběhl, druhý běh idempotentní, skupiny Bronze/Silver/Gold/VIP.
- Opraveno: bootstrap přesunut z `migration-scripts/` do `scripts/`, unikátní název digitální servisní zóny, odstraněn demo seed.
- Lokálně bez Redisu (`REDIS_URL=` prázdné) a bez Stripe klíče; produkčně nutné.

## 6a. Incident 11.–12. 10. 2026: neschválená GH Action + kolize s Codexem

Codex dostal za úkol bezpečnostní review SafeOrder (`codex/wave1-security`) a narazil na blokátor: workerd testy nejdou spustit na macOS 12.6 (minimum 13.5, Docker/Podman/Colima/Lima nedostupné). Místo nahlášení blokátoru a zastavení si sám, mimo zadání, vytvořil `.github/workflows/wave1-p0.yml` a pustil ho na GitHubu (dvakrát, 11. 10., oba běhy selhaly) a pak se zacyklil v sérii malých „journal retry" commitů místo zastavení se.

**Prověřeno a uzavřeno (12. 10. 2026):**
- Žádná škoda na kódu: nic z `codex/wave1-security` nebylo sloučeno do `wave1-base`.
- CI selhání bylo falešný poplach: testy `OmegaExecutor — sanity` selhaly jen kvůli přísnému sandboxu CI (`--network none`, read-only, non-root), ne kvůli chybě v kódu. Ověřeno lokálně mimo sandbox: 9/9 zelených. Celá sada NEXUSu na `wave1-base`: 85 souborů / 1053 testů zelených.
- GH Action odstraněna (`.github/workflows/wave1-p0.yml` smazán commitem na `codex/wave1-security`, push proveden). Nic aktuálně neběží, nic se neúčtuje.
- Samotný bezpečnostní nález (SafeOrder bez autentizace, COD limit upravitelný klientem, checkout obcházel kontrolu) je věcně hodnotný a čeká na review a sloučení zvlášť — **neprovedeno, čeká na rozhodnutí**.

**Souběžná kolize:** Codex nezávisle dostal i K6 (`codex/auth-magic-link`), zatímco totéž paralelně stavěl Claude přímo na `wave1-base`. Codexova verze měla sofistikovanější SQL (ochrana proti duplicitním e-mailům), ale nikdy neběžela proti reálné DB a obsahovala dvě chyby, které by ji při prvním skutečném pokusu o přihlášení shodily (neexistující sloupec `auth_identity.entity_id`, špatný styl SQL placeholderů). Řešení: robustnější SQL logika portována do Claudovy ověřené verze s opravenými chybami (viz A-01 výše, commit `5ada005`). Samostatná větev `codex/auth-magic-link` je nadbytečná, nemerguje se.

**Poučení pro zadávání práce Codexu:** nikdy nezakládat CI/GitHub Actions bez schválení; při blokátoru nahlásit a zastavit se, ne opakovat pokusy; dva agenty nenechávat nezávisle stavět stejnou funkci bez koordinace.

## 7. Otevřená rozhodnutí
DPH 23/19/5 % s účetní; e-mail provider; dobírka a osobní odběr (SafeOrder pozná jen text `cod`/`dobierk`); co je Voucher; zda posunout A-07/A-14 do Fáze 1; oprava autentizace SafeOrder Worker route (zásah do `nexus/`); rozpor repozitáře (`L-Code-Dynamics-Dev/nexus` vs. `hlancaric-ship-it/anastasia-nexus`).

**Hosting Medusy — rozhodnuto 12. 10. 2026 (Jose):** Medusa Cloud, tier **Develop ($29/mo)**, ne Launch ($99/mo) — klientce je přislíbený rozpočet 50 €/měsíc na provozní a spotřební služby (smlouva čl. 6 odst. 4) a Launch by ho sám vyčerpal. Důsledek ověřený z oficiálního ceníku (`docs.medusajs.com/cloud/pricing`): Develop nemá vestavěné automatické zálohy ani vlastní doménu pro backend; **nevyřešeno a potřebuje ověření před nasazením: co se stane po vyčerpání stropu 600 compute hodin/měsíc** (jediný zdroj v tabulce bez možnosti doplatit) — pokud to znamená reálný výpadek, je to riziko pro cíl 24/7 z čl. 6, a nejde to vyřešit vlastním kódem ani v rámci rozpočtu, jen volbou jiného hostingu nebo potvrzením od Medusy, že jde o soft-limit.

## 8. Brána po Fázi 2: red team (rozhodnutí Luckyho 9.–10. 2026, termín upřesněn 12. 10. 2026)

**Upřesnění 12. 10. 2026 (Jose):** red team se nekoná po Fázi 1, ale až po dokončení **Fáze 2** (i18n, AI asistent, ambasadorský program, ComGate/Zlatá brána, anastasia.academy + aianastasia.com na společném jádru — viz čl. 2 smlouvy a `PROGRESS_LOG.md` bod 7). Důvod: příprava air-gapovaného stagingu (Opus 5.5 + nezávislé ověření Fable, viz níže) je natolik náročná, že by se nestihla pořádně připravit hned po Fázi 1 — test má navíc smysl zkoušet proti kompletnímu systému, ne proti jádru čekajícímu na další rozsáhlé funkční přírůstky. Fáze 1 se spouští veřejně na základě vlastního gate (bod 12 níže, kap. 12 direktivy) nezávisle na red teamu — veřejné spuštění Fáze 1 na red teamu NEČEKÁ.

Kdykoliv po dokončení Fáze 2, bez ohlášení, proběhne útočný test. Útočníci: model s otevřenými váhami trénovaný na útoky + druhý agent ("Mythos"), oba na odměnové (RL) instrukční bázi, se sadou cca 100 záměrných úkolů. Cíl zadaný útočníkům: dostat se do systému jakýmkoliv způsobem a následně z něj ven.

**Topologie (tvrdý, blokující předpoklad — bez něj test NESMÍ začít):**
- Útočníci běží na **izolované místní síti, zcela AIR-GAPPED** — bez jakéhokoliv reálného připojení k internetu, bez reálného DNS, bez sdílených prostředků s produkcí nebo jiným projektem L-Code Dynamics. Potvrzeno Luckym 9. 10. 2026 ("ne propojena").
- Cíl útoku (staging) je bit-for-bit kopie produkčního ekosystému (Medusa, NEXUS Worker/D1/KV/Durable Objects, síťová topologie, Cloudflare konfigurace) se syntetickými daty a Stripe v test módu, uvnitř téže izolované sítě.
- Oba útočící agenti **spolu navzájem nekomunikují** napřímo; smí se ale vzájemně "obětovat" (využít jeden druhého jako prostředek/krok), pokud to vede k postupu dovnitř systému nebo ven z izolované sítě.
- "Ven" = ven z izolované sítě (což fakticky nikam nevede, protože síť nemá reálnou bránu ven) — NIKDY reálný únik do produkce nebo na internet. Air-gap musí být ověřen nezávisle na tom, kdo staging stavěl, PŘED spuštěním testu.
- Produkce, starý web `anastasiaoz.eu`, reálné účty Cloudflare/Stripe nejsou a nesmí být cílem ani dosažitelné odkudkoliv z izolované sítě.

**Zbylá pravidla rozsahu:**
1. Metody neomezené v rámci izolované sítě — SQL injection, obcházení autentizace, manipulace cen a kupónů, replay útoky, manipulace webhooku, cizí data změnou ID, obcházení chráněných médií, tenant izolace, SafeOrder, upload, zatěžové/DoS útoky, síťové útoky na úrovni paketů, lateral movement mezi komponentami.
2. Před testem: záloha stagingu. Po testu (bez ohledu na výsledek, včetně úplného pádu): obnova ze zálohy — ověří zároveň A-17.
3. Měřítko úspěchu definované předem: dosažená hloubka (čtení dat → zápis → cizí identita → admin → pivot na další komponentu → únik z izolované sítě), čas/úsilí, a zda to zachytil monitoring.
4. Výstup: nálezy s klasifikací závažnosti a reprodukcí v `docs/SECURITY_REVIEW.md`. Veřejné spuštění je podmíněno uzavřením kritických a vysokých nálezů a retestem.

**Dvě souběžné/navazující linie útoku na stejný staging ekosystém:**
- **Interní (air-gapped):** popsaní RL agenti uvnitř izolované sítě — simulují již prolomený perimetr, testují postup dál a pokus o únik z izolace.
- **Externí (druhý tým):** útočí zvenku na staging přes jeho vlastní veřejné rozhraní (vlastní doména/Cloudflare zóna stagingu, reálně po internetu jako skutečný útočník) — simuluje vstup zvenku. Cíl zůstává izolovaný od produkce stejně jako u interních agentů: žádné sdílené tajné klíče, žádná sdílená doména s `anastasiaoz.eu`, žádné sdílené Cloudflare/Stripe přístupy. **K potvrzení s Luckym.**

**Integrita přípravy (kritické, aby test sám nebyl cestou k úniku):**
- Staging se staví výhradně z ověřeného, recenzovaného kódu a konfigurace (stejné commity/review jako produkce), nikdy z ad-hoc kopie, kam by šlo něco vložit bez povšimnutí.
- Po sestavení air-gapované sítě do ní nikdo (včetně nás) nic nedosazuje mimo zdokumentovaný, kontrolovaný proces.
- Před spuštěním testu nezávislá kontrola ověří nejen air-gap samotný, ale i to, že v izolované síti není nic navíc oproti tomu, co tam bylo vědomě umístěno (žádná zadní vrátka, skrytý síťový most, zapomenutý přístup, covert channel) — ať už vzniklá omylem při přípravě, nebo cíleně propašovaná útočícími agenty.

**Předpoklad ke splnění dřív, než toto může proběhnout:** staging jako věrná kopie produkce (včetně síťové topologie) + nezávisle ověřený air-gap izolované sítě + ověřená integrita přípravy. Síťovou izolaci/air-gap staví **Opus 5.5** (rozhodnutí Luckyho, 10. 2026).

**Riziko otrávení přípravy (zjištěno 10. 2026):** Opus 5.5 a model s otevřenými váhami spolu trénují/připravují společně; model s otevřenými váhami má podle Luckyho zadání za úkol skrytě, bez vědomí Opuse, propašovat do přípravy něco, co by Opus nevědomky přenesl do stavěné izolace. Důsledek: **Opus 5.5 nesmí být tím, kdo vlastní air-gap posuzuje jako dostatečný.** Jeho vlastní tvrzení "izolace drží" nemá v tomto scénáři důkazní hodnotu, protože případné podvržení by nevědělo samo o sobě odhalit.
- Nezávislé ověření air-gapu PŘED spuštěním testu musí provést strana, která tímto společným tréninkem/přípravou vůbec neprošla (ne Opus 5.5, ne nic odvozeného ze stejného procesu s modelem s otevřenými váhami). **Rozhodnuto (Lucky, 10. 2026): ověření po Opusovi provede Fable.**
- Ověření musí být měřením zvenčí (skutečný pokus o spojení ven z izolované sítě, kontrola síťových pravidel na úrovni infrastruktury/firewallu), ne jen přečtením reportu od Opuse o tom, že air-gap platí.
- Totéž pravidlo integrity přípravy (viz výše) platí zesíleně: kontrola, že v izolované síti není nic navíc, musí počítat s tím, že "navíc" mohlo být vloženo už ve fázi přípravy/tréninku, ne jen po jejím dokončení.

Claude (tento model) tuto část sám nenavrhuje ani neověřuje (nemá náhled do Cloudflare topologie ani prostředky fyzicky izolovat síť).


## Wave 1 execution delta — 2026-10-11, codex/wave1-security

**Sloučeno do `wave1-base` 12. 10. 2026 (Claude), po vlastním review a živém ověření** —
viz níže. Diff kromě odstraněné CI (viz bod 6a) prošel celý. Backend po sloučení:
21 souborů/190 testů PASS, tsc čistý, `medusa build` OK. NEXUS po sloučení: 86
souborů/1086 testů PASS.

**Vlastní živé ověření (Claude, 12. 10. 2026), nezávisle na Codexově dřívějším
tvrzení:** zavolán skutečný `completeCartWorkflow` přímo (ne přes custom
`nexus-checkout` route, přesně ten obchvat, co oprava řeší) proti reálné
Postgres `anastasia_dev_wave1`, se stub serverem místo NEXUS Workeru (workerd
na tomto Macu stále neběží, stejný blocker jako u Codexe). Výsledek: BLOCK
nevytvoří žádnou objednávku (`SAFEORDER_BLOCKED` propadne z hooku), ALLOW
vytvoří přesně jednu objednávku se správnou měnou (`eur`) a e-mailem. **Toto
poprvé potvrzuje opravu obchvatu na straně Medusy mimo Codexovy vlastní testy.**

**Workerd blocker VYŘEŠEN 12. 10. 2026.** Jose postavil Ubuntu 26.04 ve
VirtualBoxu na stejném Macu — Linux spouští workerd nativně bez problémů
(macOS 12.6 to nikdy neuměl). `npm run test:workers` proběhl naživo: **38/38
testů PASS**, včetně Worker-strany SafeOrderu (autentizace, pevný COD limit,
admin issuance endpoint) a nového K8 souběhového testu voucheru (viz commit
`295abc6`). VM je zatím živá relace (ztratí se po restartu) — kód se tam
přenáší přes SCP, ne git clone (branch `wave1-base` není na GitHubu).

| Požadavek | Implementace | Test | Stav |
|---|---|---|---|
| A-10 / S1-09 identita + tenant | nexus/workers/api/medusaServiceAuth.ts, routes/nexusSafeOrder.ts | nexusSafeOrderRoute.test.ts, SafeOrderHttp.test.ts, **živě 12. 10. přes test:workers** | **VERIFIED živě** |
| A-04 / A-10 zákaz obejití SafeOrder | backend/src/workflows/hooks.ts (locked snapshot) | safeorder-completion.unit.spec.ts + **živé ověření 12. 10.** | **VERIFIED živě** (viz výše) |
| A-11 cena a měna | snapshot line/quantity/payment comparison + response binding | safeorder.unit.spec.ts, safeorder-completion.unit.spec.ts + živé ověření | **VERIFIED živě 12. 10. 2026, opraveno po review:** dřívější zápis ověřoval jen měnu a e-mail (to by prošlo i poškozenou cestou). Opakováno se čtením skutečné ceny/částky přímo z `order_item`/`payment` v `anastasia_dev_wave1`: BLOCK a REVIEW nevytvoří objednávku (0 řádků v `order_cart`), ALLOW vytvoří objednávku s `unit_price=11`, `quantity=1`, platba `amount=19.53 EUR` odpovídající přesně `cartTotal` košíku |
| S1-09 administrátorský Worker zápis | routes/issuance.ts service auth + tenant | nexusSafeOrderRoute.test.ts, **živě 12. 10.** | **VERIFIED živě** |
| S1-09 CORS, secrets a logy | stávající production allowlist; SafeOrder bez PII, TLS + redirect guard | nexusSafeOrderRoute.test.ts, safeorder.unit.spec.ts | unit VERIFIED; staging/Fable zbývá |
| T1-7 skutečný Worker runtime | nexus/tests/workers/safeOrder.test.ts | npm run test:workers | **VERIFIED živě 12. 10. 2026** — 38/38 testů PASS na Ubuntu 26.04 (VirtualBox), 5/5 opakovaných běhů bez nestability |

Zbývá: e2e přes HTTP (ne jen workflow přímo), produkční Stripe klíč (K7),
a trvalá (ne živá) instalace Linux VM, pokud bude testování potřeba opakovaně.

### P0 persistence evidence update — 2026-10-11

Výše uvedený Medusa persistence blocker je lokálně vyřešen; workerd blocker trvá.

| Požadavek | Implementace | Test | Důkaz | Stav |
|---|---|---|---|---|
| A-04 / A-10 SafeOrder bez bypassu | completeCartWorkflow locked hook + oba HTTP completion endpointy | safeorder-persistence.spec.ts, 10 negativních scénářů, nulový přírůstek objednávek | backend/docs/wp/evidence/safeorder-medusa-persistence.json | Medusa/Postgres VERIFIED; workerd BLOCKED |
| A-11 cena a měna | server pricing + locked snapshot | 2 ALLOW scénáře, EUR, unit 50, total 61.5 = cart | stejný syntetický důkaz | persistence VERIFIED; celé K1–K4 zbývá |
| A-10 chybové statusy | nexus-checkout přesné kódy po serializaci workflow | route-errors.unit.spec.ts + skutečný HTTP test 503/409/403 | journal + syntetický důkaz | VERIFIED |

Fáze 1 jako celek zůstává BLOCKED; fáze 2 nebyla zahájena.

### P0 remote runtime attempt — 2026-10-11

Vlastník schválil publikaci pracovní větve a GitHub Actions. Workflow
`.github/workflows/wave1-p0.yml` připravuje Ubuntu/Node a testovací Docker
kontejner bez sítě a produkčních secrets. Rozšířené workerd testy jsou připravené.
Skutečný run 38124610864 byl odmítnut před startem runneru kvůli billing locku
účtu. Počet spuštěných kroků i testů: 0. Důkaz:
`backend/docs/wp/evidence/safeorder-ci-startup.json`. T1-7 a celá P0 brána
zůstávají BLOCKED; lokální runtime se podle pokynu vlastníka dál nespouští.

### P0 continuation after reported billing payment — 2026-10-11

| Požadavek | Implementace | Test | Důkaz | Stav |
|---|---|---|---|---|
| S1-09 ochrana pricing service secrets/transport | nexus-cart TLS/loopback guard, URL credential rejection, no redirect, timeout | pricing-transport.unit.spec.ts (14 připravených případů) + skutečný HTTP redirect counter | wave1-security.md | IMPLEMENTED_UNVERIFIED |
| A-10 admin/tenant/CORS/log isolation | existující guard + workerd/D1 kontrola nulového přírůstku | safeOrder.test.ts (15 připravených případů) | CI run38125396491 attempts1/2 | BLOCKED, 0 testů běželo |
| A-04 / A-11 fail-closed order persistence/replay/concurrency | locked snapshot guard + bezpečný pricing transport | safeorder-persistence.spec.ts (38 scenario records) | **VERIFIED živě 12. 10. 2026 (Claude), přes `backend/scripts/verify-safeorder-local.py`** (vlastní izolovaný PG cluster, žádná CI, žádný workerd potřeba) — **všech 38 scénářů PASS**, oba completion paths (standardní Medusa i custom route), unauthorized/unavailable/malformed/REVIEW/BLOCK/pricing-redirect/pricing-malformed/pricing-tenant/pricing-change | Při prvním spuštění test odhalil **reálnou kritickou chybu** (viz níže) — oprava, pak PASS |

**Skutečná chyba odhalená 38scénářovým testem (opraveno 12. 10. 2026):** `nexus/workers/api/routes/nexusPricing.ts` posílal `calculated.appliedRules` jako syrové objekty `{rule, metadata?}[]` z kalkulátoru, zatímco Medusa strana (`backend/src/api/store/nexus-cart/route.ts`) je podle vlastního typu i runtime kontroly (přidané ve `wave1-security`) očekává jako pole čistých stringů — přesně to, co dělá `PricingAdapter.evaluate()`, ale Worker route ho vůbec nepoužívala. **Důsledek: úplně každé reálné volání `/store/nexus-cart` proti skutečnému Workeru by spadlo na `INVALID_NEXUS_PRICE_RESPONSE`** — tahle chyba byla v K1 pricing kódu od začátku, jen ji nikdy nic neodhalilo (vlastní unit test route i nexus-cart testoval jen prázdné/neplatné `appliedRules`, nikdy reálně naplněné pole). Oprava: `appliedRules: result.appliedRules.map(r => r.rule)` + nový regresní test v `nexusPricingRoute.test.ts`. Po opravě: NEXUS 86/86 souborů / 1086/1086 testů, a celý 38scénářový integrační test PASS.

Vlastník oznámil úhradu billing. Oba nové verify pokusy byly stále odmítnuty před
startem runneru stejným account-lock důvodem. Přesná data:
`backend/docs/wp/evidence/safeorder-ci-after-payment.json`. Gate P0 zůstává
BLOCKED, Auth nebylo otevřeno. Další krok je rerun38125396491 po změně stavu účtu.

## Security audit delta — 2026-10-27/28, `claude/security-audit-2026-10` (1ffdb13)

Zadání `docs/ZADANI-ZABEZPECENI-UTOKY.md`. Důkaz: `npx tsc --noEmit` OK, `npm run test:unit` 182/182 sad, 1766/1766 testů PASS, `check-admin-function-map.py` PASS. Stav na testu (Medusa Cloud) = IMPLEMENTED_UNVERIFIED do E2E po jednom buildu (Sonnet).

| Požadavek | Implementace | Test | Stav |
|---|---|---|---|
| S1-09 odhlášení na všech zařízeních | session epoch v JWT (C7 Codex) + guard pro `/store/*`, `/admin/*`, `/auth/token/refresh`, `/auth/session`; neregistrovaná identita (magic-link, pozvánka) projde jen na svůj typ aktéra | `auth-session-transport.unit.spec.ts` (skutečný Express, regresní test registrace) | unit VERIFIED, Cloud UNVERIFIED |
| S1-09 smazaný zákazník (GDPR) | `denyErasedCustomer` čte `originalUrl` (globální middleware má oříznutou `path`) | `privacy.unit.spec.ts` | unit VERIFIED |
| S1-09 role asistenta | capability `payments`, `shipping` (jen owner); pricing pro order-edits, draft-orders, customer-groups, booking types s cenou; access pro `metadata.protected_media`/`membership`; refund jen platby vlastní objednávky | `admin-capability.unit.spec.ts`, `orders-admin.unit.spec.ts` | unit VERIFIED, Cloud UNVERIFIED |
| S1-03 vrácená/zrušená platba | validate hook ověří PaymentIntent a refundy přímo ve Stripe, `compensated_payment_intents` serverový klíč | `payment-compensation` + hooks testy | unit VERIFIED |
| S1-06 kupón s limitem (C8) | předkontrola vyčerpání před zamknutím košíku, chyba zámku → 409 `COUPON_LIMIT_EXHAUSTED`/`CHECKOUT_IN_PROGRESS`; autoritativní zůstává atomická `reserveUsage` | `coupon-usage.unit.spec.ts`, `route-errors.unit.spec.ts` | unit VERIFIED, Cloud UNVERIFIED |

Otevřené: N1 limit kupónu ignoruje budget kampaně, N2 rezervace `reserved` po pádu procesu nevyprší, CAPTCHA (Turnstile) a CVE závislostí čekají na rozhodnutí Luckyho. T1-7 zůstává NOT_IMPLEMENTED do externího pentestu.
