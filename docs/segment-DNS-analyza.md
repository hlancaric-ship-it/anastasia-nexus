# DNS audit celého ekosystému — 5 zón (BIND export)

**Datum:** 7. 10. 2026 · **Zdroj:** oficiální BIND exporty všech 5 zón z Websupportu (`dns-bind/`). Read-only analýza.
**Rozsah:** anastasiaoz.eu, anastasia.academy, aianastasia.com, zlatabrana.gold, zlatabrana.online.

## 1. Kam co reálně míří

| Doména | apex `@` | `www` | wildcard `*` | Reálný cíl | Pozn. |
|---|---|---|---|---|---|
| **anastasiaoz.eu** | 81.95.98.157 | 81.95.98.157 | **81.95.98.157** | Windows/IIS e-shop (origin) | wildcard → přímo origin |
| **anastasia.academy** | 107.150.101.9 | 107.150.101.9 | **37.9.175.133** | apex=atoms.dev, `*`=Websupport parking | split! |
| **aianastasia.com** | 107.150.101.9 | 107.150.101.9 | — (žádný) | atoms.dev | čisté, bez wildcardu |
| **zlatabrana.gold** | 37.9.175.131 | 37.9.175.131 | 37.9.175.131 | Websupport hosting/parking | |
| **zlatabrana.online** | 37.9.175.133 | 37.9.175.133 | 37.9.175.133 | Websupport parking slot | |

- Dvojčata (academy, aianastasia) mají apex správně na **atoms.dev `107.150.101.9`** (potvrzeno `_mgx_verify` TXT u obou).
- **academy wildcard `*` → 37.9.175.133** = prázdný Websupport parking → vysvětluje bot-provoz a HTTP 509 v logu parking slotu.
- zlatabrana.gold/online = zaparkované na Websupportu (`.gold` 37.9.175.131, `.online` 37.9.175.133).
- Všechny zóny: NS = `ns1/ns2.websupport.cz` + `ns3.websupport.eu`. Mail = **Active24**.

## 2. Mailová bezpečnost (SPF / DKIM / DMARC)

| Doména | SPF | DMARC | DKIM | Hodnocení |
|---|---|---|---|---|
| **anastasiaoz.eu** | 🔴 **CHYBÍ** | 🔴 **CHYBÍ** | a24 (1024-bit) | **nejhorší — a je to transakční e-shop** |
| anastasia.academy | ✅ `-all` | 🟠 `p=quarantine`, bez `rua` | mail (2048-bit) | OK, bez reportingu |
| aianastasia.com | ✅ `-all` | 🟠 `p=quarantine`, bez `rua` | a24(1024)+mail(2048) | OK, bez reportingu |
| zlatabrana.gold | ✅ `-all` | 🟠 `p=quarantine`, bez `rua` | mail (2048-bit) | OK |
| zlatabrana.online | ✅ `-all` | 🟠 `p=quarantine`, bez `rua` | 🟡 **žádný DKIM** | parkovaná |

**Nálezy:**
- 🔴 **DNS-M1 — anastasiaoz.eu nemá SPF ani DMARC.** Kdokoli může podvrhnout odesílatele `@anastasiaoz.eu`, projde to bez varování. Doména posílá objednávkové/účtové maily → vysoké riziko phishingu na zákazníky a spoofingu. **Nejvyšší priorita.**
- 🟠 **DNS-M2 — DMARC všude jen `p=quarantine` bez `rua`/`ruf`.** Žádná viditelnost (nechodí reporty), politika není `reject`. Doporučení: doplnit `rua=mailto:...`, po monitoringu zpřísnit na `p=reject`, přidat `adkim=s; aspf=s`.
- 🟡 **DNS-M3 — `a24._domainkey` je 1024-bit RSA** (sdílený Active24 klíč, stejný public key sdílí anastasiaoz.eu i aianastasia.com). Slabší; preferovat 2048-bit (`mail._domainkey` 2048 už existuje).
- 🟡 **DNS-M4 — zlatabrana.online bez DKIM** (zatím parkovaná, dořešit před spuštěním).

## 3. Integrita DNS a certifikáty

- 🟠 **DNS-I1 — DNSSEC nikde.** V žádné z 5 zón nejsou DNSKEY/DS záznamy → zóny nejsou podepsané. DNS je zranitelné na cache poisoning / spoofing. Websupport DNSSEC podporuje → zapnout u všech.
- 🟠 **DNS-I2 — CAA nikde.** Žádná doména neomezuje, která CA smí vystavit certifikát → snazší mis-issuance. Doplnit `CAA 0 issue "letsencrypt.org"` (dle reálné CA).
- 🟡 **DNS-I3 — wildcard na origin u e-shopu.** `*.anastasiaoz.eu → 81.95.98.157` směruje libovolnou subdoménu přímo na Windows origin (ten je už tak veřejně exponovaný, bez CDN/WAF). Zvažuje se v migraci (edge/Cloudflare před origin).

## 4. Co je v pořádku (neopravovat kvůli kosmetice)
- Apex dvojčat korektně na atoms.dev; aianastasia.com bez wildcardu (čisté).
- SPF `-all` (hardfail) na 4/5 doménách.
- Konzistentní NS, rozumné TTL (300/600), DKIM 2048-bit na většině.

## 5. Priorita oprav (DNS)
1. 🔴 **anastasiaoz.eu: doplnit SPF + DMARC** (DNS-M1) — hoří, transakční doména bez ochrany.
2. 🟠 DMARC `rua` + plán na `p=reject` napříč (DNS-M2); zapnout **DNSSEC** (DNS-I1) a **CAA** (DNS-I2) na všech.
3. 🟡 Přejít z 1024-bit a24 DKIM na 2048-bit (DNS-M3); u zlatabrana.* dořešit DKIM před spuštěním (DNS-M4).
4. 🟡 Wildcard e-shopu řešit v rámci migrace za edge (DNS-I3).

> Pozn.: Záznamy nejsou v této analýze přepisovány — jde o čtení a doporučení. Jakákoli změna DNS = až s explicitním souhlasem (CLAUDE.md §2).
