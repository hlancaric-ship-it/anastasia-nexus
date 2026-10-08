# ANASTASIA & NEXUS — Centralized E-Commerce Architecture

Centralizovaný ekosystém e-commerce pre projekt **ANASTASIA** (Health, Longevity & Wellness), postavený na headless architektúre **Medusa.js v2** a Cloudflare Edge microservices vrstve **NEXUS**.

---

## 🏗️ Architektúra Repozitára (Monorepo)

```
anastasia-nexus/
├── nexus/                # Cloudflare Edge Workers & Microservices (Pricing Engine, SafeOrder 3.0, Voucher DO, AI Gateway, Stripe)
├── backend/              # Medusa.js v2 Headless E-commerce Backend (PostgreSQL, Workflows, Cart & Checkout)
├── admin-demo/           # Cloudflare Worker Administration Interface & Demo Dashboard
├── docs/                 # Architektonické blueprinty, auditné zprávy a záväzná ponuka
├── STATUS.md             # Živý stav projektu a harmonogram realizácie
└── README.md             # Hlavná dokumentácia repozitára
```

---

## ⚡ Moduly a Služby

### 1. Edge Layer — NEXUS (`/nexus`)
- **Live Edge API:** `https://nexus-api.hlancaric.workers.dev`
- **Pricing Engine (`/api/nexus/pricing`):** Deterministický výpočet cien, zľavové tiery ZR4–ZR25, brandové akcie DELPHIN/MIVARDI/MIKADO, zľavové stropy a zaokrúhľovanie.
- **SafeOrder 3.0 OS (`/api/nexus/safeorder`):** Risk scoring engine pre detekciu rizikových dobierkových objednávok.
- **Stripe Billing (`/api/klub/subscribe`):** Automatizácia predplatného pre členský Klub ANASTASIA.
- **AI Gateway (`/api/ai/query`):** Gemini 2.0 Flash / Workers AI lekárenský a wellness poradca s GDPR gate a nákladovými stropmi.
- **Voucher Durable Object (`/api/vouchers/*`):** Digitálne poukazy s D1 perzistenciou.

### 2. E-Commerce Core — Medusa.js v2 (`/backend`)
- Otvorené headless e-commerce jádro.
- Správa produktov, kategórií, variantov, zákazníkov a objednávok.
- Napojenie Medusa v2 checkout workflow na NEXUS Pricing Engine & SafeOrder.

### 3. Administrácia (`/admin-demo`)
- **Live Admin Demo:** `https://anastasia-admin-demo.hlancaric.workers.dev`
- Administračné rozhranie upravené na mieru pre správy katalógu, objednávok, klientok a pravidiel NEXUS.

---

## 🧪 Testovanie & Kvalita Kódu

```bash
# Spustenie unit & regresných testov NEXUS (1 035+ testov)
cd nexus && npm test

# Statická typová kontrola
cd nexus && npx tsc --noEmit
```

---

## 📜 Licencia & Autori
- **Klient:** Lucia Rogožanová (LUCRAT s.r.o.)
- **Dodávateľ:** Jan Lančarič, L-Code Dynamics
- **Dátum:** 9. 10. 2026
