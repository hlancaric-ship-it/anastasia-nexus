# MASTER AUDIT — ANASTASIA ekosystém (3 weby)
## Exekutivní shrnutí a rozcestník

**Datum dokončení statické + pasivní fáze:** 7. 10. 2026
**Předmět:** anastasiaoz.eu · anastasia.academy · aianastasia.com (vlastník Lucia Rogožanová / LUCRAT s.r.o., písemný souhlas s auditem)
**Metoda:** hluboká statická analýza zdrojáků všech tří webů + pasivní neinvazivní infra/DNS/TLS/SEO/výkon sken. Žádný destruktivní ani zátěžový test, nic nespuštěno proti produkci se změnou stavu.
**Stav oprav:** NIC se zatím neopravuje (dohoda) — tento balík je podklad ke kulatému stolu a k rozhodnutí opravit/migrovat.

---

## 1. Hlavní zjištění jednou větou

Všechny tři weby jsou **prolomitelné bez přihlášení** kvůli jedné společné třídě chyby — **backend nevynucuje autorizaci** — a e-shop k tomu přidává **padělání plateb, cenové podvody a veřejně dostupný admin po nešifrovaném HTTP**.

## 2. Ekosystém = DVA technické světy

| | E-SHOP | DVOJČATA (obsah + lékárna) |
|---|---|---|
| Weby | anastasiaoz.eu | anastasia.academy + aianastasia.com |
| Stack | Umbraco 8 (EOL) / .NET / MS SQL / Windows | React + FastAPI / PostgreSQL (MGX šablona) |
| Hosting | Websupport/Active24, bez CDN, origin odhalená | atoms.dev za Cloudflare, stejná IP |
| Platby | ANO (CardPay) | NE |
| Zdravotní data | NE | ANO (pharmacy — léková rada) |
| Doporučení | **Migrovat** (Medusa.js) + okamžité záplaty | **Opravit** (platforma aktuální, oprava levná) |

## 3. Nejzávažnější rizika (TOP, napříč vším)

1. 🔴 **E-shop: RCE** — nahrání webshellu přes `FileUpload` bez auth → převzetí serveru.
2. 🔴 **E-shop: padělání CardPay platby** — callback ignoruje podpis i částku → zboží zdarma, „zaplaceno".
3. 🔴 **E-shop: admin `/umbraco` veřejně + HTTP bez redirectu + cookie bez Secure** (potvrzeno naživo) → převzetí relace/účtu přes MITM, brute-force na odhalený backoffice.
4. 🔴 **Pharmacy: obejití medicínského guardrailu** — bezpečnostní pravidla jen ve frontendu, `gentxt` bez auth → nebezpečná léková rada pod hlavičkou lékárny na účet majitelky.
5. 🔴 **Všechny FastAPI entitní API bez auth** — anonymní čtení/mazání PII (kontakty, konzultace, leady) a defacement obsahu.
6. 🔴 **E-shop: cenové/slevové podvody** — finalizace nepřepočítá cenu, kupóny stackovatelné, žádná ochrana marže.
7. 🟡 **Academy: SSRF → čtení `/app/backend/.env`** + `/admin/settings` leak secrets veřejně.

## 4. Pokrytí 7bodového rámce (po dokončení pasivní fáze)

| Bod | Stav | Kde |
|---|---|---|
| 1 Inventura systému | 🟢 hotovo | segmenty webů + INFRA |
| 2 Dependency / reverse-eng | 🟢 hotovo | segmenty webů |
| 3 Data audit | 🔴 blok (potřebuje DB zálohu) | — |
| 4 Security + business-logic | 🟢 hotovo | všechny segmenty |
| 5 Výkon | 🟡 lehké měření hotovo, zátěž blokovaná | INFRA §8 |
| 6 SEO / migrace | 🟡 povrch hotový, Search Console blok | INFRA §5,§9 |
| 7 Business-logic | 🟢 obsah hotov / 🟡 e-shop čeká na zadání | CELKOVÝ POHLED |
| + Infra/domény/TLS | 🟢 hotovo | INFRA segment |

**Hotovo do maxima bez přístupů. Zbývají 3 tvrdé bloky** (viz §6).

## 5. Okamžité záplaty („hoří teď", nezávislé na opravit/migrovat)

**E-shop:**
1. Zablokovat veřejný `FileUpload` + doplnit `Media/web.config`.
2. CardPay: ověřovat podpis **i** částku.
3. Reset hesla náhodným tokenem (ne `Ticks`); lockout na login.
4. **Skrýt `/umbraco`** za IP whitelist/VPN; **vynutit HTTPS serverově (301) + HSTS + `Secure` cookie**.
5. Autorizovat `ClearSessionData`/`ManageFiles`.
6. Bezpečnostní hlavičky (CSP/X-Frame/X-Content-Type) do web.config.
7. Rotovat: CardPay klíč, SMTP, machineKey, Websupport/FTP.

**Dvojčata (jedna oprava pro oba):**
8. Router-level auth na všechny entitní + aihub routery; zúžit CORS z `.*` na allowlist.
9. Pharmacy: serverové vynucení medicínského system promptu + rate-limit na `gentxt`.
10. Academy: zakázat URL/filesystem vstupy aihubu (SSRF); maskovat `/admin/settings`; smazat prod PII dumpy.
11. Rotovat FastAPI secrets (JWT/OIDC/SMTP).

**Ekosystém:**
12. DNSSEC zapnout; 2FA na Websupport/Active24; auto-renew `aianastasia.com` (expiruje 19.3.2027).

## 6. Co NELZE dokončit pasivně (tvrdé bloky — potřebují přístupy)

1. **Reálný data audit** → záloha produkční DB všech tří (source of truth cena/sklad, GDPR inventura).
2. **Zátěžový test výkonu** → běžící prostředí + samostatný souhlas (lehké měření už hotové: e-shop ~95 ms, dvojčata ~1,4 s TTFB).
3. **SEO migrace** → Search Console + crawl (backlinky, 404, URL mapa; QR struktura e-shopu musí zůstat 1:1).
4. **Byznysové zadání** → od majitelky: B2B? věrnost? provize ambasadorů? (nedá se vyčíst z kódu).

## 7. Doporučení Jarvise do diskuse

- **E-shop:** migrovat na Medusa.js (pryč z EOL Umbraco a závislosti na odcházejícím autorovi), cenotvorbu na náš **Pricing Engine**, objednávkové riziko přes **SafeOrder**. Do migrace nasadit záplaty §5.
- **Dvojčata:** opravit, ne migrovat (platforma aktuální, oprava = jeden auth guard na router). Zvážit sjednocení pod společný backend/core a jedno SSO. Vyřešit pomalý origin (TTFB 1,4 s) a SEO (hreflang, canonical, SSR).
- **Společné:** jednotná správa tajemství mimo kód, politika logování PII, konsolidace DNS/mail účtu.

---

## 8. Rozcestník dokumentů (balík auditu)

| Dokument | Obsah |
|---|---|
| **MASTER-AUDIT-ANASTASIA.md** | tento přehled |
| CELKOVY-POHLED-tri-weby.md | syntéza bezpečnosti napříč třemi weby |
| CELKOVY-POHLED-kulaty-stul.md | detail anastasiaoz.eu (e-shop) |
| segment-WEB-anastasia-academy.md | detail academy |
| segment-WEB-aianastasia.md | detail pharmacy |
| segment-INFRA-domeny-SEO.md | infra, DNS, TLS, výkon, SEO (všechny tři) |
| segment-STRUKTURA-architektura.md | kompletní struktura: endpointy, datové modely, moduly, závislosti, integrace + mapování na migraci |
| segment-JARVIS-zabezpeceni.md | technická příloha e-shopu (file:line) |
| ANASTASIA-technicka-priloha-Dufek.md | technické detaily e-shopu KOD-01..16 |
| POKRYTI-vs-MEZERY.md | mapa pokrytí vs. chybějící vstupy |

**Další krok (tvoje rozhodnutí):** svolat kulatý stůl nad tímto balíkem, nebo nechat rozpracovat MASTER migrační blueprint (úrovně A/B/C) — jakmile padnou přístupy z §6.
