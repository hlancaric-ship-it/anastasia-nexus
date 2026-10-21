# Technická příloha auditu anastasiaoz.eu — pro dodavatele (DUFEKSOFT)

**Datum:** 6. 10. 2026
**Zdroj:** statická analýza předaných zdrojových kódů (`dufeksoft.ecommerce.web`, Umbraco 8.17.1 / .NET 4.7.2).
**Metoda:** čtení kódu, nic nespouštěno proti běžícímu webu. Řádky odpovídají předanému snapshotu.
**Autor:** Jan Lančarič, L-CODE DYNAMICS.

> Cesty jsou relativní k `dufeksoft.ecommerce.web/dufeksoft.ecommerce-lib/`, pokud není uvedeno jinak (`web/` = projekt `dufeksoft.ecommerce.web`).

---

## 0. Systémová příčina (přečíst první)

**Všechna veřejná Web API dědí z `Controllers/_BaseApiController.cs` → `UmbracoApiController`, který nemá žádnou autorizaci**, a `_BaseController.cs` → `SurfaceController` také ne. Neexistuje globální autorizační filtr. Každá akce bez vlastního `[Authorize]` je tedy plně anonymní a Umbraco API mapuje metody i na **GET**, takže stavové změny jdou vyvolat prostým odkazem/obrázkem a nelze je chránit MVC `ValidateAntiForgeryToken`.

**Doporučení (řeší většinu nálezů najednou):** zavést autorizovaný base controller (`UmbracoAuthorizedApiController`) pro všechna administrativní API, košíkové operace vázat výhradně na session (ne na `quoteId`/`pk` z klienta), a pro Web API zavést jednotnou anti-CSRF ochranu (vlastní token v hlavičce) + převod stavových operací na POST.

Pozitivní zjištění (ponechat): admin SurfaceControllery (`ProductController`, **`ProductPriceController` — ceny**, `CategoryController`, `CouponController`, `CustomerAdminController`, `QuoteAdminController`, `MemberController` admin akce, `CustomerDataController` zákazníkové akce) mají konzistentně `[Authorize(Roles=...)]` + `[ValidateAntiForgeryToken]`. Jednotkové ceny a DPH se berou z DB. DB dotazy jsou převážně parametrizované.

---

## 1. KRITICKÉ

### KOD-01 — Nahrávání a mazání souborů bez přihlášení (RCE + path traversal)
- **`Controllers/Ecommerce/FileUploadApiController.cs`** ř. 13–45 — dědí z `UmbracoApiController`, **bez `[Authorize]`**; `UploadFile` (HttpPost) i `ManageFiles` (delete/description/get, GET-able) jsou veřejné.
- **`Repositories/FileUploadRepository.cs`**:
  - `DeleteFile` ř. 87–100: `filePath = Server.MapPath(GetRootPath()) + id;  File.Delete(filePath);` — `id` jde přímo z requestu, bez sanitizace → `delete|..\..\web.config` smaže libovolný soubor.
  - `UploadFile` ř. 20–48: `category` (ř. 25) a `fileName` (ř. 26) z requestu určují adresář i jméno; `hpf.SaveAs(savedFileName)` (ř. 38) uloží cokoli včetně `.aspx`/`.asmx` → **webshell/RCE** pod webroot (`Media\EcommerceUpload`). `category` umožňuje traversal. Návrat `url = savedFileName` (ř. 40) prozrazuje absolutní cestu.
- **Oprava:** `[Authorize(Roles="EcommerceAdmin")]` na celý controller; whitelist přípon (jpg/jpeg/png/webp/gif/mp4/pdf); `Path.GetFileName(fileName)`; po `Path.GetFullPath` ověřit, že cesta leží uvnitř `Media\EcommerceUpload` (odmítnout `..`, oddělovače, absolutní cesty); `ManageFiles` → POST + anti-CSRF; nevracet absolutní cestu. **Okamžitě:** zablokovat `/umbraco/Ecommerce/FileUploadApi/` pro veřejnost v IIS a doplnit `Media/web.config` (viz KOD-11/3).

### KOD-02 — Košík nevaliduje množství; el. produkt přístupný bez ohledu na množství
- `Controllers/Ecommerce/QuoteApiController.cs` ř. ~81 `AddProductToQuote`: `cnt = PriceUtil.NumberFromEditorString(items[3])` (NumberStyles.Any — propustí záporné/nula/desetinné), bez horního limitu.
- `Models/Ecommerce/Product2QuoteModel.cs` `InsertProduct2QuoteModel.AddProductToQuote` ř. 326–373, zápis ř. 367 `dataRec.ItemPcs += cnt;`; `SaveProductToQuote` ř. 204 `dataRec.ItemPcs = cnt;` — bez kontroly.
- Limit 999 jen pro QR: `Controllers/Ecommerce/QuoteLinkController.cs` `GetPiecesToAdd` ř. 411–421 (`MaxPiecesToAdd=999`, ř. 46). API endpointy limit nemají.
- `Models/Ecommerce/User2ProductModel.cs` `SetUserAccess` ř. 60–84 udělí přístup k `ElectronicProductWeb` bez kontroly `ItemPcs`/ceny (voláno z `QuoteRepository.SetQuotePaied` ř. 211).
- **Oprava:** centrální server-side validace množství (celé číslo 1–999) ve **všech** cestách do košíku (API i QR). V `SetUserAccess` udělit přístup jen pro `ItemPcs > 0` a odpovídající uhrazenou položku. Do opravy ručně kontrolovat zaplacené objednávky elektronických produktů.

### KOD-09 — Platba kartou nekontroluje zaplacenou částku proti objednávce
- `Controllers/Ecommerce/TatraCardPayController.cs` `PaymentResult` ř. 82–105: při `model.IsPaymentOk` se volá `SetQuotePaied(quoteKey)` (ř. 94) jen podle `model.VS` — **nikde se neporovnává `AMT` ani `CURR` proti `quote.GetTotalPriceWithVat()`**. `AMT` je navíc v `PaymentSubmit` (ř. 39–53, ř. 45) editovatelná klientem. Při částečné/manipulované platbě se objednávka označí jako plně uhrazená a udělí se přístup k el. produktům.
- **Nutno ověřit samostatně:** ověření HMAC/podpisu odpovědi brány je v **externí zkompilované knihovně `dufeksoft.lib`** (není ve zdrojáku) → z kódu nelze potvrdit, že se podpis kontroluje. *(Pozn.: dřívější tvrzení „podpis CardPay je ověřovaný" je zatím HYPOTÉZA — potvrdit u dodavatele nebo dekompilací `dufeksoft.lib`.)*
- **Oprava:** před `SetQuotePaied` porovnat částku z **podepsané odpovědi brány** (ne z klientského `AMT`) s `quote.GetTotalPriceWithVat()` (přesně, se zaokrouhlením) a `CURR=="978"`; při neshodě neoznačit jako zaplacené, zalogovat a upozornit. Doložit, že `dufeksoft.lib` ověřuje podpis.

### KOD-14 (NOVÝ) — IDOR: anonymní čtení cizích objednávek, stažení PDF faktur, rozeslání mailu
- `Controllers/Ecommerce/QuoteController.cs` (třída bez `[Authorize]`):
  - `QuoteDetail(string id)` ř. 381–387 — anonymní čtení libovolné objednávky podle GUID.
  - `GetQuotePdf(string id)` ř. 399–409 — anonymní stažení PDF (faktury, osobní údaje).
  - `QuoteSendStateNotification(string id)` ř. 389–397 — anonym spustí e-mailovou notifikaci k libovolné objednávce (mail/DoS, potvrzení existence).
- `Controllers/Ecommerce/CustomerDataController.cs` `MyQuoteDetail(string id)` ř. 155–163 — **bez `[Authorize]`** (na rozdíl od sousedních akcí), `GetQuoteWithProducts(new Guid(id))` načte libovolnou objednávku.
- **Oprava:** zákazníkov detail/PDF → `[Authorize(Roles="EcommerceCustomer")]` + kontrola vlastnictví (porovnat s `CustomerModel.GetCurrentMemberId()` / `QuoteForListRepository.GetForUser`); admin varianty `[Authorize(Roles="EcommerceAdmin")]`; `QuoteSendStateNotification` jen admin + POST + anti-CSRF.

### BEZ-SECRET (NOVÝ) — plaintext produkční tajemství ve zdrojáku → NUTNÁ ROTACE
Hodnoty zde záměrně neuvádím, jen umístění a typ. Vše v `web/Web.config`:
| ID | Umístění | Typ | Akce |
|----|----------|-----|------|
| BEZ-SECRET-01 | `Web.config:102` `tatrabanka.CardPay.Key` | **Produkční HMAC klíč platební brány** | **Rotovat + vyjmout z repo — KRITICKÉ** |
| BEZ-SECRET-02 | `Web.config:56` `smtpPassword` (web@anastasiaoz.eu) | **Heslo k SMTP** | **Rotovat + vyjmout** |
| BEZ-SECRET-03 | `Web.config:172` `machineKey` | Validation/decryption klíče | **Rotovat + vyjmout** |
| BEZ-SECRET-04 | `Web.config:100` `tatrabanka.CardPay.KeyTest` | Testovací klíč (defaultní) | Nízké |
- **Oprava:** přesunout do chráněné konfigurace mimo zdrojový strom (`configSource` na soubor mimo VCS / env / secret store). Protože jsou v repu, považovat produkční CardPay klíč a SMTP heslo za kompromitované a **rotovat**.

---

## 2. VYSOKÉ

### KOD-03 — Objednávky měnitelné bez přihlášení podle ID z prohlížeče
- **03a** `QuoteApiController.ChangeQuoteState` ř. 590–632 — mění stav libovolné objednávky (vč. stavu spouštějícího export do logistiky, `QuoteRepository.CheckExportToLogisticsBeforeSave` ř. 264–292). Bez auth, GET-able.
- **03b** `QuoteApiController.ChangeQuoteTransportAndPayment` ř. 362–400 — mění dopravu+platbu cizí objednávky dle GUID.
- **03c** `QuoteController.SubmitBasketDeliveryData` ř. 63–283 (klíč 110, 257) — identifikuje objednávku z `model.CurrentQuote.pk` v POST body, ne ze session; bez `[Authorize]` i bez CSRF → přepis doručovacích údajů vč. **e-mailu**, dopravy, platby libovolné objednávky.
- **Oprava:** API odvodit z `UmbracoAuthorizedApiController` / `[Authorize(Roles="EcommerceAdmin")]`, převést na POST + anti-CSRF; `SubmitBasketDeliveryData` vázat na session a ověřit, že `pk` patří aktuální session; `[ValidateAntiForgeryToken]` + `@Html.AntiForgeryToken()`.

### KOD-04 — Katalog měnitelný bez přihlášení
- **04a** `ProductApiController.cs` ř. 19 `MoveUpProduct`, 34 `MoveDownProduct`.
- **04b** `CategoryApiController.cs` ř. 18 `MoveUpCategory`, 37 `MoveDownCategory`.
- **04c** `Product2CategoryApiController.cs` ř. 20 `AddProductToCategory`, 44 `RemoveProductToCategory`, 68/87 MoveUp/Down.
- Vše `_BaseApiController`, bez auth, GET-able. (Ceny OK — `ProductPriceController` chráněn.)
- **Oprava:** `UmbracoAuthorizedApiController` / `[Authorize(Roles="EcommerceAdmin")]` + anti-CSRF + validace GUID.

### KOD-05 — Obnova hesla: predikovatelné heslo, plaintext mailem, odemčení účtu, enumerace
- `Controllers/Ecommerce/CustomerRegisterController.cs` `SubmitLostPassword` ř. 141–196 (klíč 149–163, 177–184):
  - ř. 157 `pswd = dt.Ticks.ToString();` — heslo odvozené od času (predikovatelné).
  - ř. 159 `member.IsLockedOut = false;` + ř. 160 `IsApproved = true;` — odemkne/aktivuje účet (obchází lockout).
  - ř. 178 `TextTemplateParam("PASSWORD", member.Password)` — heslo v mailu v plaintextu.
  - ř. 150–152 odlišná hláška pro neexistující e-mail → **enumerace účtů**.
  - ř. 190 `AddModelError("", exc.ToString())` — leak stacktrace.
- **Oprava:** jednorázový kryptograficky náhodný token s expirací (uložit jeho hash), mailem jen odkaz, nové heslo si zadá uživatel; neodemykat `IsLockedOut`/`IsApproved`; stejná neutrální odpověď bez ohledu na existenci účtu; `[ValidateAntiForgeryToken]` + captcha (`ApiKeyValidator` v projektu je) + rate-limit; nevypisovat výjimku.

### KOD-06 — Registrace bez ověření e-mailu → přístup k cizím nákupům
- `CustomerRegisterController.cs` `SubmitRegistration` ř. 25–125; `Models/Ecommerce/MemberModel.cs` `CreateCopyFrom` ř. 127–151 (ř. 136–141: `IsApproved=true`, `IsLockedOut=false`, `IsCustomerUser=true` → účet hned aktivní). Vazba objednávek/el. produktů je na **e-mail/login**, ne na ověřenou identitu (`QuoteForListRepository.GetForUser`, `ProductRepository.GetElectronicProductForUser`), takže registrace na cizí e-mail zpřístupní přes `CustomerDataController` (ř. 140–203) cizí objednávky a el. produkty.
- **Oprava:** po registraci účet neaktivovat dokud uživatel nepotvrdí e-mail tokenem; historii párovat až po ověření vlastnictví, ideálně na MemberId místo stringového e-mailu; `[ValidateAntiForgeryToken]`.

### KOD-07 — Slevy a kupóny se při dokončení nepřepočítají; jednorázový kupón víckrát; bez limitu pokusů
- `QuoteController.SubmitBasketReviewAndSend` ř. 301–326 → `BasketFinalize` ř. 327–373 → `QuoteRepository.FinishQuote` ř. 179–205 — jen odečte sklad a uzavře; **nepřepočítá slevu/dopravu zdarma a neověří kupón**. Přepočet běží jen při GET renderu (ř. 23, 40).
- Jednorázovost: `Models/Ecommerce/PriceDiscountModel.cs` ř. 112–122 — kontrola jen při `isNewDiscount==true`; `CouponRepository.WasUsed` ř. 32–39 počítá jen dokončené objednávky → race (TOCTOU) mezi souběžnými košíky.
- Bez limitu: `QuoteApiController.AddDiscountCouponToQuote` ř. 270–326 veřejné bez rate-limitu → enumerace kódů.
- **Oprava:** při finalizaci znovu přepočítat slevu i dopravu z DB a ověřit kupón (datum, min/max, jednorázovost); jednorázovost řešit atomicky (rezervace v transakci, unikátní vazba kupón→objednávka); rate-limit na uplatnění.

### KOD-08 — Zranitelné / neudržované závislosti
| Knihovna | Verze | Místo | Problém |
|----------|-------|-------|---------|
| UmbracoCms | 8.17.1 | `web/Web.config:26` | 8.x EOL, bez bezp. oprav od 24. 2. 2025 |
| Newtonsoft.Json | 12.0.1 | bindingRedirect `web/Web.config:268-269` | CVE-2024-21907 (DoS) |
| SharpZipLib | 0.86.0.518 | `web/*.csproj:66-67` | CVE-2018-1002208 (Zip Slip) |
| Microsoft.Owin | 4.0.1 | bindingRedirect `web/Web.config:252-266` | CVE-2020-1045 |
| jQuery (frontend) | 1.10.2 | `web/Views/Partials/Layout/_HtmlHead.cshtml:44` | CVE-2015-9251, 2019-11358, 2020-11022/11023 (XSS) |
| iTextSharp | 5.5.13.1 | `packages/` | EOL 5.x, nahradit iText 7/8 |
| BouncyCastle | 1.8.1 / Portable 1.8.10 | `packages/` | staré |
- **Oprava:** Umbraco na podporovanou větev (nebo min. 8.18.x), Newtonsoft ≥13.0.3, SharpZipLib ≥1.3.3, Microsoft.Owin ≥4.2.2, jQuery ≥3.7.1.

### KOD-15 (NOVÝ) — Neautorizované mazání dat a logů
- `Controllers/Ecommerce/EcommerceApiController.cs` `ClearSessionData()` ř. 18–54 — `UmbracoApiController`, bez auth, GET-able; maže session data v DB (UserProp, Quote, CookiesSetup) a soubory logů (`fi.Delete()`). Destruktivní, veřejně spustitelné.
- **Oprava:** autorizovat (admin / scheduler token), převést na POST.

### KOD-16 (NOVÝ) — Hardcoded klíče + slabá kryptografie v kontaktním API
- `Controllers/Website/WebsiteApiController.cs` ř. 23–24 — `key1`, `key2` natvrdo v kódu; `ApiKeyValidator` používá `TripleDES` + `CipherMode.ECB` + `MD5` pro odvození klíče.
- **Oprava:** klíče do konfigurace/secretů; nahradit ECB/MD5/3DES za AES-GCM + HMAC.

---

## 3. STŘEDNÍ

### KOD-11 — Nebezpečná konfigurace (`web/Web.config`)
- ř. 150 `compilation debug="true"` — v base configu (Release transform `Web.Release.config:18` to sice odstraní, ale při deploy kopií base configu poběží debug). Nastavit `debug="false"` i v base.
- ř. 172 `machineKey` natvrdo (viz BEZ-SECRET-03).
- **Chybí `web/Media/web.config`** — šablona `packages/UmbracoCms.8.17.1/Content/Media/Web.config` obsahuje `<handlers>` (StaticFile only) vypínající spouštění skriptů v Media; bez něj hrozí spuštění nahraného webshellu (viz KOD-01). Nasadit.
- ř. 134 `customErrors mode="RemoteOnly"` — s debug=true riziko úniku info; doporučeno `mode="On"` + `defaultRedirect`.

### KOD-12 — Chybějící ValidateAntiForgeryToken
Chybí u: `QuoteController.SubmitBasketDeliveryData`/`SubmitBasketReviewAndSend` (ř. 63, 301), `CustomerRegisterController.SubmitRegistration`/`SubmitLostPassword` (ř. 25, 141), `MemberController.SubmitLogout` (ř. 61), `QuestionnaireFormController.SaveRecord`/`DeleteRecord` (ř. 53, 91), `CookiesController` (ř. 23, 32). U Web API endpointů (KOD-03/04) volatelných přes GET nutná vlastní token/header ochrana + převod na POST.

### BEZ-02 — HTTPS se nevynucuje
`web/Web.config:33` `Umbraco.Core.UseHttps=false`, `:104` `redirectToHttps=false`; žádný HSTS/redirect. Potvrzeno i Umbraco HealthCheckem v logu. Oprava: `UseHttps=true`, HTTP→HTTPS redirect, HSTS.

### BEZ-05 — Chybějící bezpečnostní hlavičky
`web/Web.config:229-233` řeší jen `X-Powered-By`. Chybí HSTS, X-Frame-Options/CSP frame-ancestors, X-Content-Type-Options, Referrer-Policy, CSP, Permissions-Policy; `X-AspNetMvc-Version` není vypnuta (`MvcHandler.DisableMvcResponseHeader`). Doplnit `customHeaders` + `DisableMvcResponseHeader=true` v Application_Start.

### BEZ-06 — Cookies bez Secure/HttpOnly
V `web/Web.config` chybí `<httpCookies requireSSL="true" httpOnlyCookies="true">`; forms auth cookie `yourAuthCookie` (ř. 152) bez requireSSL. Oprava: doplnit + `sameSite`.

---

## 4. NÍZKÉ

- **KOD-13/exception leak** — `exc.ToString()` do odpovědi klientovi napříč `QuoteApiController` (ř. 144, 222, 261, 319, 352, 392, 470, 566) a `CustomerRegisterController:190`. Vracet obecnou hlášku, detail jen do logu.
- **Logy v repozitáři** — `web/App_Data/Logs/UmbracoTraceLog.*.json` ve snapshotu (info disclosure: jména strojů, cesty). Vyčistit, vyloučit z VCS/deploye.
- **CDN jQuery 3.4.1 bez SRI** — Umbraco member šablony (`Umbraco/PartialViewMacros/Templates/Login.cshtml:14`, `RegisterMember.cshtml:36`, `EditProfile.cshtml:12`).
- **Connection string placeholder** — `web/Web.config:112` je zástupný (ne únik), ale reálný connection string by neměl končit v base configu.

---

## 5. Pořadí oprav (doporučené)

1. **Okamžitě:** zablokovat `/umbraco/Ecommerce/FileUploadApi/` (KOD-01) + doplnit `Media/web.config`; rotovat a vyjmout produkční tajemství (BEZ-SECRET-01/02/03).
2. **Do 24–48 h:** autorizace peněžní cesty — KOD-09 (kontrola částky), KOD-02 (množství + el. produkt), KOD-14/KOD-03 (IDOR objednávek), KOD-15 (ClearSessionData).
3. **Vysoké:** KOD-05, KOD-06, KOD-07, KOD-04, KOD-16, KOD-08 (upgrade).
4. **Střední/nízké:** KOD-11, KOD-12, BEZ-02/05/06, exception leak, logy.

**Systémově** nejúčinnější je bod 0: autorizovaný base controller + session-based identifikace + jednotná anti-CSRF ochrana Web API.
