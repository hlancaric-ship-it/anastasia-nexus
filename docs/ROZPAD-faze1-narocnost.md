# Rozpad fází, náročnost a model ceny (INTERNÍ)
**Projekt:** Anastasia — centralizovaný commerce (Medusa + NEXUS), fáze 0–1 do přepnutí.

## Cenový model (klíč)
- **Standardní náročnost (h)** = kolik by to zabralo běžnému dodavateli. **Na tom se počítá CENA.**
- **Náš dodací čas (h) = ⅓ standardu** — dodáme 3× rychleji (reuse L-Code komponent, NEXUS jádro, nástroje), ale **cena zůstává na standardní náročnosti.**
- **Cena = Standardní hodiny × tvoje sazba.** (Sazbu dosaď, čísla dopočítám.)
- Úzké hrdlo dodání NENÍ kód, ale dodání **designu / obsahu / feedu** od klientky — proto u nich 🔶.

---

## FÁZE 0 — Podepřít starý web (hoří, běží paralelně)
| WP | Práce | Standard (h) | Náš čas (h) |
|----|-------|:---:|:---:|
| 0.1 | CardPay: ověřit podpis + částku | 4–8 | 1,5–3 |
| 0.2 | Zavřít veřejný upload + `Media/web.config` | 4 | 1,5 |
| 0.3 | Vynutit HTTPS + skrýt `/umbraco` + Secure cookie + hlavičky | 4–8 | 1,5–3 |
| 0.4 | Reset hesla tokenem + lockout | 4–8 | 1,5–3 |
| 0.5 | Autorizovat údržbové/souborové endpointy | 4 | 1,5 |
| 0.6 | Rotace tajemství (CardPay/SMTP/machineKey) | 4 | 1,5 |
| **Σ Fáze 0** | | **≈ 24–36 h** | **≈ 8–12 h** |

## FÁZE 1 — Prémiový e-shop + členství + migrace → CUTOVER
| WP | Práce | Standard (h) | Náš čas (h) | Záv. |
|----|-------|:---:|:---:|:---:|
| 1.1 | Medusa backend + edge infra (Cloudflare) + prostředí | 24–40 | 8–13 | — |
| 1.2 | Datový model: produkty (digi, fyzické), varianty, kategorie | 16–24 | 5–8 | — |
| 1.3 | Import katalogu + napojení feedu dodavatele | 24–48 | 8–16 | 🔶 feed |
| 1.4 | Integrace **Pricing Engine** (ceny/slevy/marže) | 24–40 | 8–13 | reuse |
| 1.5 | Integrace **SafeOrder** (riziko objednávek) | 16–24 | 5–8 | reuse |
| 1.6 | Checkout + platební brána | 24–40 | 8–13 | 🔶 brána |
| 1.7 | Účty zákazníků + SSO | 16–32 | 5–11 | — |
| 1.8 | Členská sekce + **entitlements** (nákup→přístup) | 32–48 | 11–16 | — |
| 1.9 | **Migrace dat** (členové/zákazníci/objednávky→přístupy) + reset hesel + ověření | 24–40 | 8–13 | malý objem pomáhá |
| 1.10 | **Prémiový storefront** (SK/CS), autorský vzhled | 48–96 | 16–32 | 🔶🔶 design |
| 1.11 | SEO: redirect mapa + kanonizace + hreflang + sitemap | 16–24 | 5–8 | mapu máme |
| 1.12 | Admin + role + zaškolení majitelky | 8–16 | 3–5 | — |
| 1.13 | Testy (funkční/bezpečnostní/zátěžové) + UAT | 24–40 | 8–13 | — |
| 1.14 | Plán přepnutí + DNS switch + go-live + monitoring | 8–16 | 3–5 | 🔒 jen s jejím „go" |
| **Σ Fáze 1** | | **≈ 304–528 h** | **≈ 101–176 h** | |

> **Pro cenu ber Σ standard.** Náš dodací čas (⅓) drží termín — ne cenu.

---

## Harmonogram (reálný dodací čas)
- **Fáze 0:** náš čas ≈ 8–12 h → spustit hned, hotovo do pár dní (paralelně).
- **Fáze 1:** náš čas ≈ 101–176 h → při plné kapacitě a včas dodaném **designu + obsahu + feedu** reálně **cca 3–6 týdnů** do přepnutí.
- **Úzké hrdlo = design (WP 1.10) + obsah + feed.** Kód limit není.

## Rámec ceny (dosaď sazbu)
- **Cena Fáze 0 = 24–36 h × sazba.**
- **Cena Fáze 1 = 304–528 h × sazba** (dej rozsah, drží podle rozsahu designu; klidně i fixní cena za balíček).
- **NEXUS platforma = 0** (dárek 1. klientovi — ale komunikovat jako hodnotu zdarma).
- **Provoz (její, měsíčně):** Cloudflare Stream/R2, platební poplatky, AI překlad, domény → transparentní odhad dle provozu.

## Fáze 2–3 (po cutoveru — necenit teď detailně)
Média (Stream/R2 + přehrávač + transkripty), multijazyk (AI překlad + EN), ambasadoři, dashboard, marketingové funnely. Audit léků (compliance) + Zlatá brána (2. funnel site). Naceníme stejným modelem (standard × sazba, dodání ⅓) po odsouhlasení fáze 1.
