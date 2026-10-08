# Bod 5 — Výkon e-shopu anastasiaoz.eu (měřeno 7.10.2026)

**Metoda:** pasivní měření reálné produkce (origin 81.95.98.157, Umbraco 8/.NET/IIS). Běžná návštěvnická zátěž (sekvenčně, ~1 req/s), BEZ zátěžového testu. Warm i cold vzorky. Žádný zápis, jen GET.

## Pozitiva (neopravovat)
- **HTTP/2** ✓, **gzip** komprese ✓ (Content-Encoding, Vary: Accept-Encoding)
- **Warm TTFB ~70–130 ms** (dobré), TLS handshake ~30–40 ms
- **Žádný version leak** — Server, X-Powered-By, X-AspNet-Version odstraněny ✓
- Cache-busting přes `?v` query na aktivech ✓ (ale viz PERF-1 — nevyužito)

## Nálezy

**🔴 PERF-1 — chybí Cache-Control/Expires na VŠECH statických aktivech**
JS/CSS (i img) vrací jen `ETag` + `Last-Modified`, žádný `Cache-Control` ani `Expires`. → prohlížeč **revaliduje všech 32 souborů při každém načtení stránky** (podmíněné GETy / 304). Zabiják opakovaných návštěv a vícestránkových relací, zvlášť na mobilu/vyšší latenci. Aktiva jsou přitom verzovaná `?v4` → cache-busting je nachystaný, jen chybí `max-age`.
**Oprava:** `Cache-Control: public, max-age=31536000, immutable` na /Scripts, /Styles, obrázky. Trivální, velký efekt.

**🔴 PERF-2 — 32 samostatných souborů + zastaralý JS stack**
Homepage tahá **20 JS + 12 CSS** = 32 requestů, nebundlováno. Stack: **jQuery 1.10.2 (2013, EOL)** + jQuery UI + bootstrap + slick + lightslider + lightgallery + chosen + 13 dalších. **~274 KB (gzip) jen CSS+JS**, bez obrázků. jQuery 1.10.2 má známé bezpečnostní i výkonové dluhy.
**Oprava:** bundle+minify do 1–2 souborů; dlouhodobě odstranit/nahradit jQuery stack (řeší migrace na moderní frontend).

**🟡 PERF-3 — intermitentní cold-start spike**
1× z 13 hitů = TTFB **3.0 s** (ostatní 66–230 ms). Klasická IIS recyklace/idle-timeout app poolu nebo necachovaná DB cesta po nečinnosti. Warm výkon dobrý.
**Oprava:** app pool „always running" + vypnout idle-timeout/periodic recycle, nebo warmup; primárně vyřeší edge architektura.

**🟡 PERF-4 — ASP.NET session na anonymní stránce**
`Set-Cookie: ASP.NET_SessionId` i na anonymní homepage → brání plnému cachování stránky + paměť serveru per návštěvník.
**Oprava:** nevázat session state na anonymní/katalogové stránky.

**🟡 PERF-5 — Cache-Control: private na HTML**
Stránky nelze cachovat na CDN/proxy. Dynamický košík OK, ale homepage/katalog/produkty by šly cachovat na edge s krátkým TTL + invalidací.

## Statické indicie z kódu (potvrzené dřív, projeví se pod zátěží / na velkých datech)
N+1 dotazy, per-operation transakce, wildcard LIKE search. Na 30 produktech/58 objednávkách (dev snapshot) se neprojeví; riziko při produkčních objemech → ověřit zátěžovým testem (viz níže).

## Závěr pro cílovou architekturu
Většina nálezů (bundling, cache headers, edge cache, cold start) **zmizí migrací na edge (Cloudflare) + CDN + moderní frontend**. Bod 5 tedy není „opravovat teď" (drží se pravidlo „nic neopravovat dokud není celkový pohled"), ale **kvantifikuje přínos migrace**. Quick-win bez migrace = jen PERF-1 (cache headers), pokud by to klientka chtěla hned.

## Zátěžový test — ČEKÁ NA SOUHLAS s konkrétním profilem (viz chat)

## ✅ Zátěžový test — PROVEDEN (7.10.2026, se souhlasem, GET-only, auto-stop)
Profil: ramp-up 5→50 souběžných, auto-stop při chyb>5 % / p95>5 s. Zastaveno pojistkou **už na 1. stupni (5 souběžných)**.

**🔴 PERF-6 (KRITICKÝ) — velmi nízký strop souběžnosti.**
Při pouhých **5 souběžných** požadavcích server timeoutuje (15 s) a propadne na **~1,6 req/s**. Rozpad po endpointech (5 souběžných, 20 s):
| Endpoint | p50 | timeouty |
|---|---|---|
| homepage | 79 ms | 1 |
| eshop | 99 ms | 1 |
| produkt | 990 ms | 3 |
| search „astrolog" | 581 ms | 2 |
| search „bio" | **15 s (timeout)** | 3 |

Padá **všechno, ne jen search** → není to jedna pomalá stránka, je to **globální saturace** při minimální souběžnosti. Mediány statiky jsou dobré (79–99 ms), ale pod souběžností se requesty **řadí do fronty a timeoutují**.

**Pravděpodobné příčiny (potvrzují statické indicie z kódu):**
- vyčerpání DB connection poolu (per-operation transakce držící spojení)
- limit vláken/spojení IIS app poolu na sdíleném Active24 Windows hostingu
- wildcard **LIKE search** (nejtěžší konzument) blokuje a stáhne celý web s sebou (`eshop?search=bio` medián = timeout)

**Dopad na byznys:** jakýkoli nárůst provozu (kampaň, sezóna, i pár desítek reálných souběžných návštěvníků) web **položí**. Pro prémiový repositioning a růst je to tvrdý strop.

**Řešení:** quick-win = zaindexovat search (odstranit wildcard LIKE) + zvětšit/ošetřit DB pool; **systémové = migrace na edge** (cachovaný katalog na CDN, správný connection pooling, bez IIS app-pool stropu). Migrace tenhle problém odstraní z podstaty.

## ✅ BOD 5 (VÝKON) — E-SHOP UZAVŘEN
Pasivní měření (PERF-1..5) + zátěžový test (PERF-6). Headline: PERF-1 (chybí cache headers) + PERF-6 (strop 5 souběžných = kritický). Obojí řeší edge migrace.
