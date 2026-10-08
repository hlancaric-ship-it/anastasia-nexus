# ANASTASIA ekosystém — CELKOVÝ POHLED napříč všemi třemi weby (kulatý stůl)

**Datum:** 7. 10. 2026 · **Rozsah:** `anastasiaoz.eu` + `anastasia.academy` + `aianastasia.com`
**Zdroj:** statická analýza zdrojáků všech tří webů, read-only, nic nespuštěno proti produkci. Majitelka (Lucia Rogožanová / LUCRAT s.r.o.) dala písemný souhlas.
**Tým:** Černá Mamba (backend/sklad/doprava), Kapitán Flemazánka (cenotvorba), Jarvis (zabezpečení), Red-team (útočné řetězy). Koordinace: Jarvis.
**Status oprav:** NIC se zatím neopravuje. Tento dokument je podklad k rozhodnutí u stolu.

---

## 0. Co to vlastně je — tři weby, dva světy

Ekosystém nejsou tři varianty téhož. Jsou to **dva technologicky nesouvisející světy**, které spojuje jen značka a majitelka:

| | anastasiaoz.eu | anastasia.academy | aianastasia.com |
|---|---|---|---|
| Typ | **E-shop** (prodej, platby, sklad) | Obsahový web (programy, články) | AI lékový poradce |
| Stack | Umbraco 8.17.1 / C#/.NET 4.7.2 / MS SQL / Windows | React/Vite + **FastAPI/Python** / PostgreSQL | React/Vite + **FastAPI/Python** / PostgreSQL |
| Autor/původ | custom DUFEKSOFT modul | **MGX/MetaGPT šablona** (atoms.dev) | **MGX/MetaGPT šablona** (atoms.dev) |
| Checkout/platba | ANO (Tatra CardPay) | NE | NE |
| Zdravotní kontext | NE | NE | ANO (léková rada) |
| Stav platformy | **EOL** (bez záplat od 24.2.2025) | aktuální | aktuální |

**Důsledek pro strategii:** academy a pharmacy jsou **dvojčata** — stejná šablona, stejná kořenová vada, **jedna oprava spraví oba**. anastasiaoz.eu je samostatný problém na mrtvé platformě.

---

## 1. Verdikt jednou větou

Všechny tři weby jsou **systémově prolomitelné bez přihlášení** — a ačkoli mají úplně jiný kód, teče to u všech ze **stejné třídy chyby: chybějící autorizace na serveru**. U e-shopu k tomu přibývá padělání plateb a cenové podvody, u lékárny obejití medicínských pravidel.

---

## 2. Společná kořenová příčina napříč ekosystémem

**Backend nikde nevynucuje „kdo smí co".** Projevuje se trojím způsobem podle stacku:

1. **anastasiaoz.eu** — všechny `*ApiController` dědí z base kontroleru **bez `[Authorize]`**, žádný globální filtr. Desítky zápisových akcí jdou volat anonymně, často přes GET (nejdou chránit ani CSRF).
2. **academy + pharmacy** — entitní CRUD routery z MGX šablony mají **jen `Depends(get_db)`**, žádnou auth závislost. Autorizace existuje a je napsaná správně (OIDC+JWT), ale **drtivá většina API ji nepoužívá**. `/admin` je chráněné jen v prohlížeči (SPA), backend nevynucuje nic.

Sekundární společné vady:
- **Důvěra klientovi** — identita/role/stav se řídí hodnotami z requestu (e-shop: `memberId`, `quoteId`, `AMT`; FastAPI weby: klient řídí `approved`, `status`, posílá vlastní `system` prompt).
- **Tajemství + konfigurace odhalitelné** — e-shop: plaintext v `Web.config`; FastAPI: `/admin/settings` vrací secrets nemaskované, JWT HS256 symetrický bez `aud/iss`.
- **CORS dokořán** na obou FastAPI webech (`allow_origin_regex=".*"` + `allow_credentials=True`).

---

## 3. Kill-chainy podle webu (seřazeno podle škody)

### anastasiaoz.eu (e-shop) — nejvyšší absolutní riziko (jde o peníze a server)
| # | Co útočník získá | Klíč | Přetrhne to |
|---|---|---|---|
| 1 | **RCE / převzetí serveru** — webshell `.aspx` bez přihlášení | `FileUploadApiController` bez auth/whitelistu + path traversal | auth + whitelist přípon + `Media/web.config` |
| 2 | **Objednávka zdarma + „zaplaceno"** — padělaný CardPay callback | `TatraCardPayController.PaymentResult:82-105` **ignoruje podpis i částku** | přijmout platbu jen při platném HMAC **A** `AMT==cena` |
| 3 | **Převzetí účtu → admin** | reset hesla = `DateTime.Ticks`, login bez lockoutu, statický `machineKey` | náhodný token + přegenerovat machineKey |
| 4 | **Exfiltrace dat + přepis katalogu** | IDOR `QuoteController:381-410`, veřejné zápisové API, admin SQLi | globální autorizace + ověření vlastnictví |
| 5 | **Položení eshopu + smazání logů** | `ClearSessionData` + `ManageFiles` path traversal, bez auth | autorizace na údržbové endpointy |
| 6 | **Cenové podvody** | `FinishQuote` nepřepočítá cenu/slevu; kupóny: TOCTOU, double-dipping; žádná ochrana marže | přesun cenotvorby do deterministického Pricing Engine |

### aianastasia.com (lékárna) — nejvyšší riziko odpovědnosti
| # | Co útočník získá | Klíč | Přetrhne to |
|---|---|---|---|
| 1 | **Nebezpečná léková rada na účet majitelky** | `gentxt` bez auth; medicínský guardrail **jen ve frontendu** | server-side system prompt + auth + rate-limit |
| 2 | **Únik kontaktní PII z konzultací (GDPR)** | `/leads/all`, `/consultations/all` bez auth | admin-only na čtení |
| 3 | **Defacement + manipulace recenzí** | entitní CRUD bez auth; `reviews.approved` client-settable | admin guard + server řídí `approved` |

### anastasia.academy (obsah) — nejnižší riziko (není checkout ani zdravotní data)
| # | Co útočník získá | Klíč | Přetrhne to |
|---|---|---|---|
| 1 | **Defacement + mazání webu** | 8 entitních routerů bez auth | admin guard |
| 2 | **Únik PII (kontakty/newsletter)** | `/contact_messages/all`, `/newsletter_contacts/all` bez auth | admin-only |
| 3 | **SSRF → čtení `/app/backend/.env`** | `transcribe`/`genimg` berou URL i absolutní cestu | zakázat URL/filesystem vstupy |
| 4 | **Převzetí admina** | host-header injection na OIDC + `/admin/settings` leak secrets (veřejně!) | fixní trusted host + maskovat |

---

## 4. Srovnávací matice závažnosti

| Riziková třída | anastasiaoz.eu | academy | pharmacy |
|---|---|---|---|
| Neautorizované API (kořen) | 🔴 kritické | 🔴 kritické | 🔴 kritické |
| RCE / převzetí serveru | 🔴 ano (FileUpload) | 🟢 ne (OSS presigned) | 🟢 ne |
| Padělání platby | 🔴 ano (CardPay) | ⚪ N/A | ⚪ N/A |
| Cenové/slevové podvody | 🔴 ano | ⚪ N/A | ⚪ N/A |
| Únik PII bez auth | 🔴 ano (IDOR) | 🔴 ano | 🔴 ano (zdrav. kontext) |
| SSRF / čtení `.env` | 🟡 leak configu jinak | 🔴 ano | 🟢 ne (genimg odmítá URL) |
| Secrets leak | 🔴 plaintext Web.config | 🔴 settings veřejně | 🟡 settings za adminem |
| AI cost abuse | ⚪ N/A | 🔴 ano | 🔴 ano |
| Medicínský guardrail | ⚪ N/A | ⚪ N/A | 🔴 jen frontend |
| CORS dokořán | 🟡 n/a | 🔴 ano | 🔴 ano |
| Logy/PII v exportu | 🟡 logy v repu | 🔴 prod dumpy | 🟢 čisté |
| Platforma EOL | 🔴 Umbraco 8 | 🟢 aktuální | 🟢 aktuální |

---

## 5. „Hoří hned" — okamžité podepření (bez ohledu na opravit/migrovat)

Aktivně zneužitelné na produkci, podepřít neprodleně:

**anastasiaoz.eu**
1. Zablokovat veřejný `FileUpload` + doplnit `Media/web.config` (RCE).
2. CardPay: ověřovat podpis **i** částku.
3. Reset hesla přes náhodný token (ne Ticks).
4. Autorizovat `ClearSessionData` / `ManageFiles`.
5. Rotovat: CardPay klíč, SMTP heslo, machineKey.
6. Do opravy ručně kontrolovat zaplacené objednávky (hlavně el. produkty).

**academy + pharmacy (jedna oprava pro oba — stejná šablona)**
7. Router-level auth na všechny entitní + aihub routery; zúžit CORS na allowlist.
8. pharmacy: serverové vynucení medicínského system promptu na `gentxt` + rate-limit.
9. academy: zakázat URL/filesystem vstupy aihubu (SSRF), maskovat `/admin/settings`, smazat prod PII dumpy z working copy.
10. Rotovat exponované secrets na FastAPI webech (JWT secret, SMTP, OIDC client secret).

---

## 6. KEEP / REBUILD / REPLACE / DROP (předběžně, jen z kódu)

- 🟢 **KEEP:** QR/ambasadorský odkaz handler (`QuoteLinkController`); OIDC+JWT implementace na FastAPI webech (podpis validuje správně, PKCE/nonce OK) — jen ji donutit používat; ceny vždy z DB (e-shop).
- 🟡 **REBUILD:** autorizační vrstva všude (správný záměr, nevynucená); cenotvorba/slevy → Pricing Engine; skladová logika (transakce+constraint+přesnost).
- 🔴 **REPLACE:** platební callback (podpis se nevolá); reset hesla (Ticks); správa tajemství; EOL Umbraco 8; medicínský guardrail → na server.
- ⚫ **DROP:** mrtvý kód (`payment.py` Stripe na FastAPI webech, `GetProductsForSearch`, `mask_crypto` fallback); logy/dumpy/uploads v repech; dev import nástroj.

---

## 7. Rozhodnutí na stůl

Protože ekosystém = dva světy, rozhoduje se **dvakrát odděleně**:

**A) anastasiaoz.eu (e-shop)**
- Opravit cizí EOL kód (Umbraco 8, odcházející autor, 3 kořenové vady) = slepá ulička.
- **Doporučení Jarvise: migrovat** (Medusa.js jako pravděpodobné jádro) + okamžité podepření bodů 1–6. Cenotvorba na náš Pricing Engine.

**B) academy + pharmacy (FastAPI dvojčata)**
- Platforma je **aktuální a oprava je levná a rychlá** — jeden auth guard na router zavře většinu. Migrace tu není nutná ze stejných důvodů jako u e-shopu.
- **Doporučení Jarvise: opravit, ne migrovat.** Doplnit autorizační vrstvu, zúžit CORS, přesunout medicínský guardrail na server, maskovat settings. Zvážit sjednocení obou pod jeden společný backend/core (sdílí doslova tutéž šablonu).

**Společné pro celý ekosystém:** sjednotit identitu/SSO, správu tajemství (mimo kód/`.env` v repu), a politiku logování PII.

---

## 8. Co stále chybí pro úplný audit (body 1,3,5,6 ze 7bodového rámce)

Dosud = hluboká statická analýza zdrojáků. Nemáme:
1. **Hosting/infra** všech tří webů — logy, výkon, reálná dostupnost endpointů (ověřit, zda je FileUpload/`/admin` opravdu veřejně dostupné).
2. **Zálohy DB** — data audit + source of truth pro cenu/sklad.
3. **Výkon** — DB queries, TTFB, zátěž.
4. **SEO/migrace** — URL mapy, redirecty, Search Console (u e-shopu QR/odkazová struktura musí zůstat 1:1).
5. **Od majitelky:** co má byznys skutečně dělat (B2B? věrnost? provize ambasadorů?) + vyjasnit roli Dufka před jakoukoli komunikací.

---

### Podklady k stolu
- `CELKOVY-POHLED-kulaty-stul.md` — detailní rozbor anastasiaoz.eu
- `segment-WEB-anastasia-academy.md` — detail academy
- `segment-WEB-aianastasia.md` — detail pharmacy
- `segment-JARVIS-zabezpeceni.md`, `ANASTASIA-technicka-priloha-Dufek.md` — technické přílohy e-shopu file:line
- `POKRYTI-vs-MEZERY.md` — mapa pokrytí vs. chybějící vstupy
