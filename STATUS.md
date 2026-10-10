# Detailný Prehľad a Stav Projektu ANASTASIA & NEXUS Integration

**Dátum aktualizácie:** 9. 10. 2026

> **Historický souhrn:** tento dokument zachycuje stav před integrací wave1/K4 a není aktuální roadmapou. Pro ověřený stav, zdroje, blockers a další pořadí práce viz [ROADMAP_ANASTASIA_NEXUS.md](ROADMAP_ANASTASIA_NEXUS.md) a aktuální [docs/REQUIREMENTS_MATRIX.md](docs/REQUIREMENTS_MATRIX.md).

---

## 1. Hlavná Architektúra & Target System (Centralizovaný Hub)
- **E-Commerce Jádro:** **Medusa.js v2** (otvorené headless e-commerce jádro pre správy produktov, košíka, objednávok a zákazníkov v Node.js/PostgreSQL).
- **Edge VRSTVA (Cloudflare Workers / Durable Objects / D1 / R2):**
  - **Pricing Engine API:** Jediný autoritatívny zdroj pre výpočet cien (`/api/nexus/pricing` — tiery ZR4–ZR25, brandové akcie DELPHIN/MIVARDI/MIKADO, zľavové stropy a zaokrúhľovanie). ✅
  - **SafeOrder 3.0 OS:** Risk scoring engine pre detekciu podvodných objednávok (`/api/nexus/safeorder` — stropy dobierky, blokácia dočasných emailov). ✅
  - **Digital Voucher:** Kreditný modul a digitálne poukazy s D1 perzistenciou a Durable Object `SecurityCoordinator`. ✅
  - **Klub ANASTASIA & Stripe Billing:** Členská sekcia a predplatné (`/api/klub/subscribe`), R2/Stream ochrana. ✅
  - **AI Gateway & Guardrails:** AI lékový/kozmetický poradca s GDPR gate, anonymizáciou a tokenovými stropmi (`/api/ai/query`). ✅

---

## 2. Aktuálny Stav Realizácie po Fázach

### ✅ DOKONČENÉ (NEXUS Cloudflare Edge Microservices Layer):
- **Worker API Deployment (`nexus-api.hlancaric.workers.dev`):**
  - Endpointy: `/api/nexus/pricing`, `/api/nexus/safeorder`, `/api/klub/subscribe`, `/api/ai/query`, `/api/vouchers/*`, `/api/webhooks/medusa`, `/api/webhooks/shoptet`.
  - Všetkých 1 035 testov zelených (82 testovacích súborov), TypeScript `tsc --noEmit` bez chýb.
  - D1 Databáza `nexus-voucher` + SQL migrácie 0001–0004 aplikované.
- **Admin Demo Deployment (`anastasia-admin-demo.hlancaric.workers.dev`):**
  - Správa produktov, kategórií, kupónov, objednávok, zákazníkov, vernostného programu, AI poradcu a pravidiel NEXUS.

---

### ⏳ V PROCESE / PLAN PRE POKRAČOVANIE (Medusa.js v2 Backend Core & Integrácie):

#### Fáza 1A: Medusa.js v2 Core Backend Setup (`/Users/lucky/medusa-spike-app/apps/backend`)
1. **PostgreSQL Databáza & Schéma Medusa v2:**
   - Konfigurácia produkčnej/dev PostgreSQL databázy pre Medusa.
   - Vytvorenie a aplikácia migrácií Medusa v2 pre produkty, kategórie, zákazníkov a objednávky.
2. **Katalóg & Data Seed:**
   - Import produktov z exportu ANASTASIA (SKU, varianty, ceny, akcie, fotky v R2).
3. **Medusa ↔ NEXUS Pricing Integration Workflow:**
   - Vytvorenie Medusa v2 Custom Workflow / Price Selection Strategy, ktorý volá NEXUS Pricing Engine pre deterministický výpočet finálnej ceny v košíku a checkoutu.
4. **Medusa ↔ NEXUS SafeOrder Integration Workflow:**
   - Pre-checkout validation workflow v Meduse volajúci SafeOrder pre vyhodnotenie rizika objednávky.
5. **Stripe & ComGate Payments Adaptér:**
   - Napojenie Stripe Payment Provider v Medusa v2 a webhook handler pre spracovanie úhrad.

#### Fáza 1B: Členská Sekcia & Entitlements
1. **SSO / JWT Customer Identity:**
   - Vydávanie a overovanie prístupových tokenov pre zakúpené kurzy/členstvo.
2. **R2 / Stream Protected Content Delivery:**
   - Podpísané R2/Stream URL adresy len pre aktívne členky Klubu ANASTASIA.

---

## 3. Akčný Plán pre Dnešok / Nasledujúce Kroky
- [x] Dokončenie a deploy NEXUS Worker Edge API (`nexus-api.hlancaric.workers.dev`).
- [ ] **Spustenie a konfigurácia Medusa.js v2 Backend Core** (`/Users/lucky/medusa-spike-app/apps/backend`).
- [ ] Implementácia custom Medusa v2 workflow pre NEXUS Pricing Engine & SafeOrder.
- [ ] End-to-end akceptačný test Medusa v2 Checkout + NEXUS Pricing.
