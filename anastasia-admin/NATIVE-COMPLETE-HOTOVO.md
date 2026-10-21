# Natívne dokončenie košíka s kupónom – zamietnuté (USE_NEXUS_CHECKOUT)

Úloha: `POST /store/carts/:id/complete` nezapisuje použitie kupónu (zapisuje ho
`/store/nexus-checkout` po vytvorení objednávky), takže sa jednorazový kupón dal použiť
opakovane. Nález a jeho oprava: 21. 10. 2026 (pozri aj
`anastasia-admin/MEMBERSHIP-SAFEORDER-HOTOVO.md`, bod 3).

---

## 1. Čo bolo zistené

- Použitie kupónu zapisuje **iba** `recordCouponUsage` v `src/api/store/nexus-checkout/route.ts`
  (po vytvorení objednávky, jeden atomický CTE v `src/lib/pricing/coupon-usage.ts`).
- Natívna trasa `/store/carts/:id/complete` volá `completeCartWorkflow` priamo – **nezapisuje
  použitie kupónu**. `promotion.used` by teda zostal na nule a `codeAvailable`
  (`src/api/admin/coupon-links/validation.ts`) by kupón považoval za dostupný donekonečno.
- **Interný checkout natívnou trasou neprechádza:** `/store/nexus-checkout` volá
  `completeCartWorkflow(req.scope)` priamo (`src/api/store/nexus-checkout/route.ts`), žiadny
  HTTP volanie na `/store/carts/:id/complete` v kóde nie je (`grep "/complete"` v `src/` →
  len náš middleware matcher). Poistka teda `/store/nexus-checkout` nezasiahne.
- Web používa len `/store/nexus-checkout` (`storefront-prototype/src/lib/api/http.mjs`),
  takže zákazník sa zmeny nedotkne.

## 2. Oprava

Nový middleware `backend/src/api/store/carts/complete-guard.ts`
(`requireNexusCheckoutForCouponCart`):

- na `POST /store/carts/:id/complete` načíta košík cez
  `query.graph({ entity: "cart", fields: ["id", "metadata", "promotions.code"] })`,
- ak má košík Medusa promotion kód **alebo** uložený kupón v `cart.metadata.nexus_coupon`
  (NEXUS kupón – `storedCouponCode` v `src/lib/pricing/coupon.ts`), vráti
  **409 `{ ok: false, code: "USE_NEXUS_CHECKOUT", error: "USE_NEXUS_CHECKOUT", message: … }`**,
- inak `next()` (košík bez kupónu ide ďalej bez zmeny),
- pri chybe čítania košíka **fail closed** (chyba sa pošle ďalej, nie ticho).

Registrácia v `backend/src/api/middlewares.ts`:
```ts
{ matcher: "/store/carts/:id/complete", method: ["POST"], middlewares: [requireNexusCheckoutForCouponCart] }
```

Prečo sa blokujú **všetky** košíky s kupónom (a nie len jednorazové): natívna trasa nezapisuje
použitie vôbec, takže by počítadlo `promotion.used` odchádzalo od reality pri každom kupóne
(adminský prehľad použitia kupónov by klamal).

## 3. Testy

### Unit test – `backend/src/api/store/carts/__tests__/complete-guard.unit.spec.ts` (6/6 PASS)
| Scénár | Očakávanie |
|---|---|
| košík s Medusa promotion kódom | 409 + `USE_NEXUS_CHECKOUT`, `next()` sa nezavolá |
| košík s kupónom v `metadata.nexus_coupon` | 409 + `USE_NEXUS_CHECKOUT` |
| košík bez kupónu | `next()` zavolané, žiadna odpoveď |
| neexistujúci košík | `next()` zavolané (rozhodne workflow) |
| neúplný metadát kupónu | nepovažuje sa za kupón, `next()` |
| chyba čítania DB | fail closed – chyba ide do `next(error)` |

### Integračný test – `backend/integration-tests/http/safeorder-persistence.spec.ts` (scenár C3)
Scenár C3 beží pre obe trasy:
- **standard** (`/store/carts/:id/complete`): oba košíky s jednorazovým kupónom dostanú
  **409 USE_NEXUS_CHECKOUT**, žiadna objednávka nevznikne, `promotion.used` zostáva 0,
  košíky zostanú nedokončené (`completed_at` je null),
- **custom** (`/store/nexus-checkout`): beží pôvodný súbežný scenár (počítadlo 1, jedna objednávka
  započítaná, druhá `coupon.limit_exhausted`, obe zľavnené, vyčerpaný kupón → 400 COUPON_INVALID).

**Výsledok:** `safeorder-persistence.spec.ts` **PASS 1/1 (351 s)** v syntetickom PostgreSQL klustre
(`scripts/verify-safeorder-local.py`) so skutočným NEXUS Workerom.

### Ostatné overenia
| Kontrola | Príkaz | Výsledok |
|---|---|---|
| Typy | `cd backend && npx tsc --noEmit` | 0 diagnostik |
| Unit testy | `cd backend && npm run test:unit` | 145 súborov / 1463 testov – všetky prešli |

## 4. Dopad a čo ďalej

- Web (`/store/nexus-checkout`) sa nemení – zákazník je nedotknutý.
- Natívna trasa zostáva funkčná pre košíky **bez kupónu** (testy safeorder ju používajú na
  overenie fail-closed správania SafeOrdera).
- Klienti, ktorí volajú natívnu trasu s kupónom, dostanú 409 s kódom `USE_NEXUS_CHECKOUT`
  a musia prejsť na `/store/nexus-checkout`.
- Nasadenie: middleware je súčasťou backendu, nič sa nedáva do DB → stačí redeploy backendu
  (žiadna nová migrácia).
