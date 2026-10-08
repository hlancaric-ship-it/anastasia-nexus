# anastasia.academy — bezpečnostní audit (segment úrovně B)

**Datum:** 7. 10. 2026 · **Zdroj:** export z atoms.dev (`Anastasia Academy.zip`) → `_src-academy/`. Statická analýza, read-only, nic nespuštěno, tajemství/PII nevypsány.
**Stack:** React/Vite SPA + **FastAPI/Python** backend (Atoms Cloud, PostgreSQL, SQLAlchemy async), OIDC+JWT, @metagptx template. Obsahový web (programy, články, newsletter, kontakt), **bez košíku/checkoutu**, admin `/admin`.
**Tým:** JARVIS-SEC (auth/tajemství), ČERNÁ MAMBA (backend/data), RED-TEAM (útočné řetězy).

## Verdikt

**Kritický stav — systémově horší než anastasiaoz.eu v jednom bodě:** backend má korektně postavený OIDC+JWT, ale **drtivá většina API ho nepoužívá vůbec**. 8 entitních CRUD routerů + 6 AI endpointů je **úplně bez autentizace**. Autorizace je reálně jen na `settings` (admin) a `storage` (user). `/admin` je chráněné jen v prohlížeči (SPA), backend nevynucuje nic.

## Kořenová příčina

Backend je vygenerovaný ze šablony (MGX/MetaGPT „FastAPI Modular Template") jako **plné CRUD bez autorizační vrstvy** a nikdo ji nedoplnil. Jedna oprava (router-level `dependencies=[Depends(get_admin_user)]`) zavře většinu.

## Potvrzené útočné řetězy (bez přihlášení, triviální)

| # | Cíl | Klíč | Oprava |
|---|-----|------|--------|
| 1 | **Defacement + smazání celého webu** — přepis/hromadné smazání článků, programů, obsahu stránek | 8 entitních routerů jen `Depends(get_db)` (`articles.py:206/301/333` atd.) | admin guard na zápisech |
| 2 | **Únik PII / GDPR** — stažení všech kontaktů a newsletteru | `GET /contact_messages/all?limit=2000`, `/newsletter_contacts/all` bez auth | admin-only na čtení, veřejný jen POST formuláře |
| 3 | **Zneužití AI na náklady majitelky** — neomezený LLM/image/video proxy na její klíč | `aihub.py:111/159/200/228/255/283` bez auth, bez stropů `n`/`max_tokens`/`seconds` | auth + rate-limit + stropy parametrů |
| 4 | **SSRF + čtení `/app/backend/.env`** — metadata cloudu, exfiltrace souborů | `transcribe`/`genimg` berou URL i absolutní cestu (`services/aihub.py:278-283/338-371`, `httpx trust_env=True`) | zakázat http(s) fetch i lokální cesty, jen `data:`; blokovat privátní IP |
| 5 | **Převzetí admina + únik všech secrets** | host-header injection na OIDC callbacku (`auth.py:52-74/230`) → krádež tokenu; `/admin/settings` vypisuje `.env` vč. `JWT_SECRET_KEY`/`SMTP_PASSWORD` → HS256 padělání admin tokenu | fixní trusted host/redirect whitelist; maskovat secrets; CORS allowlist |

## Nálezy podle závažnosti

**KRITICKÉ**
- AC-K1 Entitní CRUD bez auth (defacement/destrukce) — `articles/article_categories/programs/program_topics/page_contents/media`.
- AC-K2 PII (kontakty, newsletter) čitelné i mazatelné bez auth — GDPR.
- AC-K3 AI Hub (6 endpointů) bez auth + bez rate-limitu/stropů → finanční zneužití.
- AC-K4 CORS `allow_origin_regex=".*"` + `allow_credentials=True` (`main.py:97-104`).
- AC-K5 Aplikační JWT se vrací v URL query a **loguje** (`auth.py:211-220`) → krádež relace.
- AC-K6 SSRF + čtení lokálních souborů přes aihub (vč. `.env`).

**VYSOKÉ**
- AC-V1 `/admin/settings` GET vrací tajemství v plaintextu (`JWT_SECRET_KEY`, `OIDC_CLIENT_SECRET`, `SMTP_PASSWORD`, `DATABASE_URL`, `STRIPE_SECRET_KEY`) + PUT/POST/DELETE přepisuje `.env` → převzetí auth. (`settings.py:66-193`)
- AC-V2 DEBUG logging v produkci + PII a celé issuer-response body v logu; `logs/app_2026*.log` přibalené v zipu. (`main.py:39-53`, `auth.py:271/298/317`)
- AC-V3 Produkční PII dumpy v exportu (`backups/prod_contact_messages_*.json` — reálná jména/e-maily/zprávy).
- AC-V4 Únik detailů výjimek klientovi (`detail=f"...{str(e)}"` napříč routery, obchází globální handler).
- AC-V5 Host-header injection na OIDC callbacku (redirect tokenu dle `X-Forwarded-Host`/`Host`).
- AC-V6 Kontakt + newsletter bez rate-limitu/captchy → spam/flood e-mailů na `info@anastasia.academy`.

**STŘEDNÍ**
- AC-S1 Storage: žádná vazba bucketu na vlastníka (každý přihlášený čte/maže libovolný bucket), bez whitelistu typů/velikosti, `object_key` bez kontroly `../`.
- AC-S2 Newsletter: `email` bez `unique`, `consent` nullable → duplicity + záznam bez průkazného souhlasu (GDPR).
- AC-S3 Chybí validace vstupů: `email: str` místo `EmailStr`, bez `max_length`, klient řídí pole `status`.
- AC-S4 `Settings.__getattr__` čte libovolnou env proměnnou; JWT bez `aud/iss/jti`, bez refreshe/revokace.

**NÍZKÉ / úklid**
- `services/payment.py` = mrtvý kód (Stripe ze šablony, nenapojené) — v rozporu s „žádný checkout"; odstranit.
- `core/mask_crypto.py` hardcoded fallback klíč (`"Mgx@FunctionSea"`) — mrtvý kód, odstranit.
- `.DS_Store`, `frontend/dist/` v exportu — vyčistit.

## Čistá místa (ověřeno 3× nezávisle — neopravovat)
- **Žádná SQL injection** — ORM, parametrizováno, whitelist operátorů/polí.
- **Žádná mail header injection** — pevné From/To/Subject, `set_content` (vstup jen do těla).
- **OIDC/JWT validace podpisu** přes JWKS, PKCE, nonce, issuer/audience — korektní.
- **Žádný `.env`/hardcoded secret v exportu**; storage upload je přes presigned URL + auth (webshell na host nejde).

## Priorita oprav
1. Router-level auth na všechny entitní + aihub routery (K1/K2/K3) + zúžit CORS (K4).
2. Token z URL/logů (K5), zakázat URL/filesystem vstupy aihubu + privátní IP (K6).
3. Maskovat/omezit `/admin/settings` (V1), fixovat trusted host (V5), DEBUG→INFO a pryč PII z logů (V2), smazat PII dumpy z exportu (V3).
4. Rate-limit/captcha formulářů (V6), error leaky (V4), pak S1–S4, úklid dead code.
