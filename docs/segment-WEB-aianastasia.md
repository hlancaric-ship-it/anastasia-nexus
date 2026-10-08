# aianastasia.com (AI Pharmacy Assistant) — bezpečnostní audit (segment úrovně B)

**Datum:** 7. 10. 2026 · **Zdroj:** `AI Pharmacy Assistant Site.zip` → `_src-pharmacy/`. Statická analýza, read-only, nic nespuštěno, tajemství/PII nevypsány.
**Stack:** React/Vite SPA + **FastAPI/Python** backend (Atoms Cloud, PostgreSQL/asyncpg, SQLAlchemy async) — **stejná MGX/MetaGPT šablona jako anastasia.academy**. Vícejazyčný zdravotní/lékový AI poradce (`deepseek-v3.2`/`gpt-5-chat`/`gemini`/`claude` přes Atoms AI Hub), OIDC+JWT, admin `/admin`. Bez košíku/checkoutu.
**Tým:** audit dokončen přímo (3 opus agenti spadli na session rate-limitu těsně před finálem; jejich dílčí nálezy ověřeny a dotaženy čtením kódu).

## Verdikt

**Kritický stav — stejná kořenová vada jako academy** (entitní CRUD bez autorizační vrstvy), navíc dvě specifika lékárny: (1) **medicínské bezpečnostní pravidla jsou pouze ve frontendu**, backend je nevynucuje → triviálně obejitelné přímým voláním AI endpointu; (2) **kontaktní PII z žádostí o lékovou konzultaci** (leads/consultations) je anonymně čitelné i mazatelné. V několika bodech je ale pharmacy **lepší než academy** (viz čistá místa) — hlavně chybí SSRF a nejsou přibalené produkční dumpy/logy s PII.

## Kořenová příčina

Identická s academy: backend vygenerovaný ze šablony jako **plné CRUD bez autorizační vrstvy**. Entitní routery (`articles, analytics, consultations, leads, reviews`) mají **nula** autentizačních závislostí — jen `Depends(get_db)`. Autorizace reálně drží jen na `settings` (admin), `storage` a `user`. Jedna oprava (router-level `dependencies=[Depends(get_admin_user)]` / `get_current_user`) zavře většinu.

## Potvrzené útočné řetězy (bez přihlášení, triviální)

| # | Cíl | Klíč | Oprava |
|---|-----|------|--------|
| 1 | **Obejití medicínského guardrailu → nebezpečná léková rada na účet majitelky** | `POST /api/v1/aihub/gentxt` bez auth; system prompt (`AIAdvisor.tsx:43 buildSystemPrompt`, `DrugAnalysis.tsx:61`) posílá **klient** (`role:"system"`), backend bere `messages` syrově a proxuje do LLM. Útočník pošle vlastní messages → poradce bez omezení (dávkování, interakce, off-label) pod hlavičkou lékárny. | Auth + **serverové** vynucení system promptu + disclaimer, ignorovat klientský `system`, rate-limit |
| 2 | **Únik kontaktní PII z lékových konzultací (GDPR)** | `GET /entities/leads/all` a `/consultations/all` (`limit≤2000`) bez auth → stažení jmen/e-mailů/telefonů lidí, kteří žádali lékovou konzultaci | admin-only na čtení, veřejný jen POST formuláře |
| 3 | **Defacement + destrukce obsahu** | `articles/analytics/consultations/leads/reviews` — PUT/DELETE/`/batch` bez auth (přepis i hromadné smazání) | admin guard na zápisech |
| 4 | **Manipulace recenzí lékárny (falešná důvěra)** | `POST /entities/reviews` bez auth a `approved: Optional[bool]` je **řízené klientem** (`routers/reviews.py:26`) → anonym si sám publikuje 5★ fejk recenze; `rating:int` bez rozsahu; DELETE/PUT anon maže/mění pravé | admin guard + server nastaví `approved=false`, validace `rating` 1–5 |
| 5 | **Zneužití AI na náklady majitelky** | `aihub.py` (`gentxt`, `genimg`) bez auth, bez rate-limitu/stropů | auth + rate-limit + stropy |
| 6 | **Převzetí admina** (podmíněné) | CORS `allow_origin_regex=".*"` + `allow_credentials=True` (`main.py:94-96`); JWT **HS256 symetrický** (`core/auth.py:96/111`), bez `aud/iss/jti`; `/admin/settings` vrací secrets **nemaskované** (`settings.py:98-105`) — ale za `get_admin_user`. Řetěz: jakýkoli únik `JWT_SECRET_KEY` → padělání admin tokenu → settings → ostatní secrets. | zúžit CORS na allowlist; maskovat settings; `aud/iss` ve validaci JWT |

## Nálezy podle závažnosti

**KRITICKÉ**
- AP-K1 Medicínský guardrail jen ve frontendu; `gentxt` bez auth bere klientský system prompt → nebezpečná léková rada + odpovědnost + náklady. (`routers/aihub.py:99`, `services/aihub.py`, FE `AIAdvisor.tsx:43/139`, `DrugAnalysis.tsx:61`)
- AP-K2 Kontaktní PII z konzultací/leadů čitelné i mazatelné bez auth — GDPR. (`routers/leads.py`, `consultations.py`, vč. `/all`)
- AP-K3 Entitní CRUD bez auth (defacement/destrukce) — `articles/analytics/consultations/leads/reviews`.
- AP-K4 AI Hub (`gentxt`/`genimg`) bez auth + bez rate-limitu/stropů → finanční zneužití.
- AP-K5 CORS `allow_origin_regex=".*"` + `allow_credentials=True` (`main.py:94-96`).

**VYSOKÉ**
- AP-V1 `reviews.approved` řízené klientem → self-publikace fejk recenzí; `rating` bez rozsahu. (`routers/reviews.py:26/35`)
- AP-V2 `/admin/settings` GET vrací secrets v plaintextu (`JWT_SECRET_KEY`, `OIDC_CLIENT_SECRET`, `STRIPE_SECRET_KEY`…) — za adminem, ale nemaskované; PUT/POST/DELETE přepisuje `.env`. (`settings.py:66-189`)
- AP-V3 JWT HS256 symetrický bez `aud/iss/jti`, bez revokace — při úniku secretu padělatelný. (`core/auth.py:96/111`)
- AP-V4 Únik detailů výjimek klientovi (`detail=f"...{str(e)}"` napříč routery).
- AP-V5 Formuláře (leads/consultations/reviews) bez rate-limitu/captchy → spam/flood.

**STŘEDNÍ**
- AP-S1 Storage: endpointy jsou za auth, ale `ObjectRequest`/`RenameRequest` klíče bez validace a **bucket bez vazby na vlastníka** → přihlášený čte/přejmenuje/smaže objekty v cizím bucketu (cross-tenant). Upload má `object_key` přes basename (OK). (`routers/storage.py:76/92/108`)
- AP-S2 Chybí validace vstupů: `email: str` místo `EmailStr`, bez `max_length`; klient řídí `status` (consultations) a `approved` (reviews).
- AP-S3 Newsletter/leads bez `unique`/průkazného souhlasu (GDPR) — dle modelů.

**NÍZKÉ / úklid**
- `logs/` (~22 souborů) a `uploads/` přibalené v exportu — vyčistit (loguje se do repo stromu).
- `mock_data/`, `data_models/*.json` (schémata, ne data) — neškodné, ale pryč z produkčního balíku.

## Čistá místa (ověřeno — neopravovat / nenafukovat)
- **Žádná SQL injection** — ORM, parametrizováno.
- **Žádné SSRF / čtení lokálních souborů** přes aihub — `genimg` odmítá `http(s)://` i ne-`data:` vstup (`services/aihub.py:183-191`); pharmacy **nemá** `transcribe` router. (Toto je oproti academy K6 navíc opravené.)
- **Logy neobsahují tokeny/PII** (0 výskytů) — lepší než academy.
- **Žádné přibalené produkční PII dumpy** — `leads.json` je JSON schéma, ne data; `.env` v exportu není.
- **Settings za `get_admin_user`** (na rozdíl od academy, kde byl leak veřejný).
- **Uložená data NEJSOU zdravotní záznamy** — modely `leads/consultations` drží jen jméno/e-mail/telefon/status, **ne** text dotazu/diagnózy; samotná AI konverzace se (dle `.wiki.md`) neukládá. GDPR citlivé kontextem (žádost o lékovou konzultaci), ale **ne** záznamy symptomů → neklasifikovat paušálně jako čl. 9 kartotéku.

## Priorita oprav
1. Router-level auth na všechny entitní routery (K2/K3) + `aihub` (K4) + zúžit CORS (K5).
2. **Serverové vynucení medicínského guardrailu** na `gentxt` (K1): auth, server-side system prompt + disclaimer, ignorovat klientský `system`, stropy/rate-limit.
3. Recenze (V1): server `approved=false`, validace ratingu; maskovat settings (V2); `aud/iss` do JWT (V3).
4. Error leaky (V4), rate-limit formulářů (V5), storage owner-binding (S1), validace vstupů (S2/S3), úklid logs/uploads.
