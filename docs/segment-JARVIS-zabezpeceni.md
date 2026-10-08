# Segment JARVIS — zabezpečení (podklad ke kulatému stolu)

Zdroj: oficiální repozitář `~/Downloads/anozeu/dufeksoft.ecommerce.web/` (NENÍ git repo — žádná historie). Statická analýza, read-only.

## Nové / dořešené nálezy z vlastního čtení

### SEC-01 — Admin SQL injection v hledání zákazníků a výrobců (vysoká, řetězí se na kritickou)
- `Repositories/EcCustomerRepository.cs:109` — `searchText` lepen přímo do SQL (`Name LIKE '%{1}%'...`) BEZ escapování.
- `Repositories/ProducerRepository.cs:80` — totéž.
- Za `[Authorize(Roles="EcommerceAdmin")]` (`CustomerAdminController`, `ProducerController`).
- **Řetěz:** KOD-05 (reset hesla přepíše heslo libovolného účtu vč. admina) → login jako admin → tato SQLi → dump celé DB (zákazníci, objednávky, kupóny). Dvě „střední/vysoké" díry = kompletní únik dat + GDPR incident.
- Oprava: parametrizovat (`@SearchText`) nebo aspoň `StringUtil.GetSaveSql`; dlouhodobě ORM/parametry všude.

### SEC-02 — Mrtvý zranitelný kód (nízká, hygiena)
- `Repositories/ProductRepository.cs:437` `GetProductsForSearch` — raw konkatenace `searchText`, ale nevolá se odnikud (jen `GetPageForSearch:91`, taky nevolané). Odstranit, ať se omylem nezapojí.

### SEC-03 — Veřejné hledání produktů (OK, jen poznámka)
- `CategoryPublicController`/`ProductPublicController` → filter cesta → `GetSearchTextWhereClause:393` → `StringUtil.GetSaveSql` (`'`→`''`). Proti SQLi drží. Neescapují se LIKE wildcardy `%`/`_` → jen riziko pomalých dotazů (DoS-lite). Nízké.

### SEC-04 — Login a brute force
- `MemberController.cs:27 SubmitLogin` → `Members.Login(user, pass)` (Umbraco member provider). Lockout/rate-limit závisí na konfiguraci providera (`MaxInvalidPasswordAttempts`). **Ale KOD-05 lockout maří** — reset odemyká účet → brute force lze „resetovat". Nutno ověřit konfiguraci providera a opravit KOD-05.

## Shrnutí bezpečnostních témat (z celého auditu, bezpečnostní optikou)
- **Autentizace/autorizace:** systémová díra — neautorizovaná Web API (base controller bez auth). Nejvyšší priorita.
- **Tokeny/klíče:** machineKey + CardPay klíč + SMTP v plaintextu v repu → padělání session/ViewState/antiforgery, kompromitace plateb a mailu. Rotovat.
- **Košík/ceny:** podvržení ceny přes množství (KOD-02) a platbu bez kontroly částky (KOD-09); CardPay podpis neověřitelný bez `dufeksoft.lib`.
- **MITM:** HTTPS se nevynucuje + cookie bez Secure (BEZ-02/06).
- **DoS:** neomezené uplatňování kupónů, těžké dotazy přes wildcard search, veřejný `ClearSessionData` (maže data/logy).
- **Injektáž:** admin SQLi (SEC-01); jinak převážně parametrizováno.
- **Správa klientů:** IDOR na objednávky/PDF (KOD-14), registrace bez verifikace (KOD-06), reset hesla (KOD-05).
