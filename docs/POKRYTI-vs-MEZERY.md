# Co audit reálně pokrývá vs. co chybí — 7bodový rámec, VŠECHNY TŘI WEBY

**Aktualizováno:** 7. 10. 2026. Audit = hluboká statická analýza zdrojáků všech tří webů + pasivní infra/DNS/TLS/SEO sken (se souhlasem majitelky). Nemáme přístup k hostingu, produkční DB ani Search Console → to, co to vyžaduje, zůstává otevřené a je zde poctivě označené.

| # | Oblast rámce | anastasiaoz.eu | academy | pharmacy | Čím je pokryté / co chybí |
|---|---|---|---|---|---|
| 1 | Inventura systému | 🟢 | 🟢 | 🟢 | Stack, framework, knihovny, platební brána, hosting, DNS, mail, TLS, platforma — hotovo z kódu + pasivního skenu. Chybí jen interní admin účty. |
| 2 | Dependency / reverse-eng | 🟢 | 🟢 | 🟢 | Co volá co, kam zapisuje, mrtvý kód, dvojí logika — z kódu hotovo. |
| 3 | Data audit | 🔴 | 🔴 | 🔴 | Jen struktura tabulek/modelů. **Chybí reálná data + source of truth** → potřebuje zálohu DB (hosting účet). |
| 4 | Security + business-logic | 🟢 | 🟢 | 🟢 | **Kompletní** — kořenové příčiny, kill-chainy, nálezy s file:line pro všechny tři. Aktivní pentest produkce nahrazen pasivním ověřením klíčových hypotéz (/umbraco veřejně, HTTP bez redirectu). |
| 5 | Výkon | 🟢 | 🟡 | 🟡 | **E-shop UZAVŘEN** (`segment-VYKON-eshop.md`): pasivní měření (chybí cache headers, 32 souborů, jQuery 1.10.2, cold-start) + **zátěžový test** → 🔴 PERF-6 strop **5 souběžných = timeouty** (globální saturace, search nejhorší). Dvojčata bez běžícího prostředí. |
| 6 | SEO / migration | 🟢 | 🟡 | 🟡 | **E-shop UZAVŘEN z GSC** (`segment-INFRA-domeny-SEO.md` §SEO mapa): trend/dotazy/39 stránek/indexace 36-24/kanonizace C1/intent C2/404 C3/tenký C4/backlinky C5/publikum. Academy částečně (1 klik, 6/9 indexováno). Pharmacy bez GSC. |
| 7 | Business-logic audit | 🟡 | 🟢 | 🟢 | E-shop tok produkt→cena→sleva→košík→platba→sklad zmapován; **chybí** od majitelky co má byznys dělat (B2B? věrnost? provize?). Obsahové weby nemají checkout → hotovo. |
| — | Infra / domény / TLS | 🟢 | 🟢 | 🟢 | **NOVĚ hotovo** — `segment-INFRA-domeny-SEO.md`: hosting, origin IP, CDN/WAF, DNS, mail, WHOIS, DNSSEC, TLS, hlavičky, HTTPS enforcement, veřejné cesty. |

## Shrnutí: co je uzavřené
Body **1, 2, 4** a **infra/domény/TLS** jsou hotové pro všechny tři weby. Bod **7** hotový pro obsahové weby, u e-shopu čeká na byznysové zadání. Body **3, 5, 6** jsou částečné — dotažené do maxima bez přístupů.

## Co NELZE pasivně dokončit (tvrdý blok — potřebuje přístupy)
1. **Reálný data audit (bod 3)** → záloha produkční DB všech tří (hosting/atoms.dev účet).
2. **Měření výkonu (bod 5)** → běžící prostředí + souhlas se zátěžovým testem.
3. **SEO migrace (bod 6)** → Search Console + crawl + analytika (backlinky, 404, URL mapa).
4. **Byznysové zadání (bod 7)** → od majitelky: B2B / věrnost / provize ambasadorů.
5. **Rotace exponovaných tajemství** → Websupport (DNS všech tří), FTP, CardPay, SMTP, JWT/OIDC secrets.

Bez bodů 1–4 výše už jde jen hádat — statická + pasivní fáze auditu je na stropu.

> **Pozn. (7.10.2026):** Websupport export academy = prázdný/zaparkovaný slot (jen parking stránka, žádná DB). Reálná data academy/pharmacy jsou na **atoms.dev** → data audit (bod 3) u dvojčat jde jen přes přístup k atoms.dev, ne přes Websupport. Nesrovnalost hostingu tím uzavřena (viz `segment-INFRA-domeny-SEO.md`, dodatek).

> **Bod 3 (data audit) — e-shop ČÁSTEČNĚ HOTOVO (7.10.2026):** proveden offline z `DB.sql` (repo dump, 78 tabulek, 19 176 řádků) → viz `segment-DATA-eshop.md`. Potvrzen datový model a integrita. ⚠️ Objemy malé (30 produktů / 58 objednávek / 12 zákazníků) → pravděpodobně DEV/handover snapshot; produkční objemy vyžadují aktuální dump z hostingu Active24. Dvojčata: data na atoms.dev (Postgres), ne dosažitelná přes Websupport.
