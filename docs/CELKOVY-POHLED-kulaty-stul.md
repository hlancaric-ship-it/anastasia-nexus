# anastasiaoz.eu — CELKOVÝ POHLED (kulatý stůl)

**Datum:** 7. 10. 2026 · **Zdroj:** oficiální repozitář `~/Downloads/anozeu/dufeksoft.ecommerce.web/` (není git repo). Statická analýza, read-only, nic nespuštěno proti živému webu.
**Tým:** Černá Mamba (backend/sklad/doprava), Kapitán Flemazánka (cenotvorba), Jarvis (zabezpečení), Red-team (útočné řetězy). Koordinace: Jarvis.

---

## 1. Verdikt jednou větou

E-shop funguje, ale je **systémově prolomitelný** — útočník bez přihlášení dokáže převzít server, objednat zdarma, padělat platbu, převzít cizí účty i admina a vytáhnout data zákazníků. Nejde o pár chyb, ale o **tři architektonické vady**, ze kterých teče skoro všechno.

## 2. Tři kořenové příčiny (opravit tyto = spadne většina)

1. **API vrstva je celá veřejná.** Všechny `*ApiController` dědí z `UmbracoApiController`/`_BaseApiController` bez `[Authorize]`, žádný globální filtr. Desítky zápisových akcí jdou volat anonymně a často přes GET (→ nejdou chránit ani CSRF tokenem).
2. **Důvěra klientovi.** Košík/objednávka/sleva se řídí identifikátory z requestu (`quoteId`, `SessionId`, `memberId`, `pk`, `cnt`, `AMT`), ne serverovou session ani autoritativním stavem. Cena/sleva/množství/identita členů se dají podstrčit.
3. **Tajemství a konfigurace v plaintextu + žádná revalidace.** `machineKey`, CardPay klíč, SMTP heslo přímo v `Web.config`; platba se nekontroluje podpisem ani částkou; finalizace objednávky nic nepřepočítá.

## 3. Potvrzené útočné řetězy (seřazeno podle škody)

| # | Co útočník získá | Klíčové místo | Jedna oprava, co řetěz přetrhne |
|---|------------------|---------------|----------------------------------|
| 1 | **RCE / převzetí serveru** — nahraje webshell `.aspx` bez přihlášení | `FileUploadApiController` + `FileUploadRepository` (bez auth, bez whitelistu, path traversal) | Autorizace na upload + whitelist přípon |
| 2 | **Objednávka zdarma + „zaplaceno" + digitální zboží** — padělá CardPay callback | `TatraCardPayController.PaymentResult:82-105` čte jen `IsPaymentOk`, **ignoruje `IsSignatureValid` (existuje v DLL!) i částku**; VS je sekvenční | Přijmout platbu jen při platném HMAC podpisu **A** `AMT==cena objednávky` |
| 3 | **Převzetí účtu + eskalace na admin** | reset hesla = `DateTime.Ticks` (`CustomerRegisterController:157`), login bez lockoutu, statický `machineKey` → padělání admin ticketu | Reset přes náhodný jednorázový token + přegenerovat machineKey |
| 4 | **Exfiltrace dat zákazníků + přepis katalogu** | IDOR na objednávky/PDF (`QuoteController:381-410`), veřejné zápisové API, admin SQLi po eskalaci | Globální autorizace + ověření vlastnictví (člen == vlastník quote) |
| 5 | **Položení eshopu + smazání logů** (anti-forensics) | `ClearSessionData` (maže data i logy, bez auth), `ManageFiles` path traversal (smaže web.config/DLL) | Autorizace na údržbové/souborové endpointy |
| 6 | **Phishing/spam z domény eshopu** | `ContactController` — příjemce i obsah z klienta, šablona neescapuje, „captcha" veřejně rozdává platné klíče (`ContactFormApiKey`) | Posílat jen na pevnou adresu provozovatele + escapovat + reálná captcha |

## 4. Nálezy podle oblastí (sjednoceno)

### Bezpečnost (Jarvis + Red-team)
- Veřejná neautorizovaná API (kořen #1) · FileUpload RCE · IDOR objednávky/PDF · reset hesla z Ticks · login bez rate-limitu · plaintext tajemství (machineKey/CardPay/SMTP) · `ClearSessionData` maže logy · path traversal upload i delete · `debug=true` + `exc.ToString()` v API (leak stack trace/SQL) · HTTPS se nevynucuje + cookie bez Secure/HttpOnly · hardcoded klíče + slabá krypta (3DES/ECB/MD5) v kontaktní „captcha".
- **Admin SQL injection** v hledání zákazníků/výrobců (`EcCustomerRepository:109`, `ProducerRepository:80`, bez GetSaveSql) — řetězí se s resetem hesla admina → dump DB. Veřejné hledání produktů je OK (GetSaveSql zdvojuje apostrofy). Neparametrizovaná `GetProductsForSearch:437` je mrtvý kód.

### Cenotvorba (Flemazánka)
- Finalizace nepřepočítá slevu/ceny (`FinishQuote`) → srazím množství po uplatnění kupónu a dokončím s podhodnocenou/zápornou cenou · záporné množství (`NumberStyles.Any`, bez stropu v API) · kupón: TOCTOU na jednorázovost, globální místo per-zákazník, double-dipping nad akční cenou (procento+částka se sčítají) · **žádná ochrana marže — v kódu neexistuje nákupní cena** · `memberId` z klienta → útočník si zvolí velkoobchodní slevovou hladinu · DPH slevy jednou sazbou u smíšeného košíku · náš **Pricing Engine** tohle řeší deterministicky (nejvyšší sleva vyhrává, žádné stackování na akci, ochrana marže, přepočet z DB).

### Backend / sklad / doprava (Mamba)
- Sklad může do záporu (žádný constraint/kontrola) · ztráta přesnosti skladu (procedura `decimal(18,0)` vs. váhové množství `decimal(18,3)` → 0,5 kg → 1) · race condition kolem dokončení (check a odpis oddělené, bez transakce) · číslování objednávek: `MAX+1` bez `ISNULL` → nový rok dostane NULL a rozbije číslování · doprava zdarma nuluje i dobírku (ztráta tržby) · `FinishQuote` není idempotentní (dvojí odpis / spálené číslo) · mrtvá mina `UpdateProductsVisibility` (neexistující sloupec `weight`) + váhové limity dopravy fakticky nefungují · report nejprodávanějších: `COUNT` místo `SUM` · import je dev-seed nástroj (SQLi stringovou interpolací, neidempotentní) — řešit jen při produkčním nasazení.

### Konfigurace / závislosti
- Umbraco 8.17.1 (EOL, bez záplat od 24. 2. 2025) · Newtonsoft 12.0.1 (CVE-2024-21907), SharpZipLib 0.86 (CVE-2018-1002208), Microsoft.Owin 4.0.1 (CVE-2020-1045), jQuery 1.10.2, iTextSharp 5.x · chybí `Media/web.config` (umožňuje spuštění webshellu) · logy a `App_Data` v repu.

## 5. „Hoří hned" — bez ohledu na směr (opravit / migrovat)

Tyto jsou aktivně zneužitelné na produkci a musí se podepřít okamžitě:
1. Zablokovat veřejný `FileUpload` endpoint + doplnit `Media/web.config` (chain 1).
2. Opravit CardPay: ověřovat podpis **i** částku (chain 2) — nejde jen o částku, podpis se vůbec nečte.
3. Reset hesla přes náhodný token, ne `Ticks` (chain 3).
4. Autorizovat `ClearSessionData` a `ManageFiles` (chain 5).
5. Rotovat kompromitovaná tajemství: CardPay klíč, SMTP heslo, machineKey.
6. Do opravy ručně kontrolovat zaplacené objednávky (hlavně elektronické produkty).

## 6. Rozhodnutí na stůl

- **A) Opravit převzatý kód.** Levnější teď. Ale dědíme Umbraco 8 (EOL), Dufkovu architekturu (3 kořenové vady) a stejně budeme migrovat. Systémová oprava autorizace není triviální.
- **B) Migrovat na nové řešení** + děravou verzi dočasně podepřít (bod 5). Dražší teď, ale pryč z EOL platformy i závislosti na Dufkovi, autorizace a cenotvorba (náš Pricing Engine) postavené správně od začátku.

**Doporučení Jarvise do diskuse:** **B s okamžitým bodem 5.** Investovat do oprav cizího EOL kódu, od kterého odchází autor, je slepá ulička. Ale cena vs. čas je obchodní rozhodnutí — proto k stolu.

## 7. Co ještě dořešit

- Druhé dva weby — **aianastasia.com** a **anastasia.academy** nejsou zrevidované (audit sedí jen na anastasiaoz.eu).
- Potvrdit na produkčním serveru: je `FileUpload`/`umbraco` reálně veřejně dostupné (HYPOTÉZA z kódu → ověřit skriptem `faze-A-scan.sh` u tebe).
- Zdrojáky `dufeksoft.lib` — máme jen DLL; pro úplnou revizi platební logiky by se hodil zdroják (ale podpis se stejně nevolá, to víme z `strings`).

---

### Podklady k stolu (jednotlivé segmenty)
- `segment-JARVIS-zabezpeceni.md`
- `ANASTASIA-technicka-priloha-Dufek.md` (přejmenovat — Dufek je ze hry; obsah = technické detaily file:line k remediaci/migraci)
- reporty Mamba / Flemazánka / Red-team (shrnuto výše)
