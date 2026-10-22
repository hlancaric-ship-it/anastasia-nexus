# Audit: co chybí v administraci pro samoobslužnou klientku (13. 10. 2026)

Navazuje na `docs/PROGRESS_LOG.md` sekce 8-9 (princip "klientka musí vše běžné nastavit sama v adminu"). Tenhle dokument NEOPAKUJE tam už zapsané body (tier názvy/procenta, newsletter, odstoupenie, reklamácie, fakturace, transakční e-maily, doprava, sklad, storno, refund, VOP/GDPR checkbox, klub/předplatné) — hledá DALŠÍ natvrdo zadrátovanou business logiku přímo v kódu.

Značení: **[OVĚŘENO ČTENÍM KÓDU]** = viděno přímo v souboru. **[ODVOZENO]** = usuzeno ze struktury/pojmenování, nekontrolováno do hloubky.

---

## 1. NEJDŮLEŽITĚJŠÍ NÁLEZ — věrnostní tier procenta JSOU natvrdo v kódu, ne "0 % nerozhodnuto"

**[OVĚŘENO ČTENÍM KÓDU]** `nexus/domains/pricing/StaticPricingConfigurationProvider.ts:7-32`, konstanta `DEFAULT_ANASTASIA_PRICING_CONFIG`:

```
loyaltyTiers: { ZR4: 0.04, ZR6: 0.06, ZR8: 0.08, ZR10: 0.10, ZR12: 0.12,
                ZR14: 0.14, ZR16: 0.16, ZR18: 0.18, ZR20: 0.20, ZR25: 0.25 }
brandLimits: { DELPHIN: 0.25, MIVARDI: 0.20, MIKADO: 0.15, 'FISHING POINT': 0.10 }
brandSaleDiscounts: { DELPHIN: 0.15, MIVARDI: 0.10, MIKADO: 0.09 }
```

Dvě věci k tomu:

1. **Toto je v přímém rozporu s `PROGRESS_LOG.md` sekce 8**, kde je napsáno "slevové % se zatím vědomě nechávají na 0 %". V kódu reálné procento existuje a je defaultní hodnota, kterou `PricingConfigurationProvider` vrací, pokud nedostane jiný config.
2. **`brandLimits`/`brandSaleDiscounts` obsahují značky, které nepatří ANASTASIA** — jde o převzatá výchozí data. Soubor/konstanta se jmenuje `DEFAULT_ANASTASIA_PRICING_CONFIG`, ale obsah je zjevně zkopírovaný/sdílený. Pokud se tahle konfigurace reálně použije pro ANASTASIA bez úpravy, zákaznice uvidí nesmyslné značkové limity.

**Závěr pro C5:** tahle konfigurace (tier %, brand limity, sale limity) musí jít z administrace, ne z TS konstanty nasazované přes deploy. Než admin existuje, je potřeba tenhle soubor přinejmenším vyčistit a ujasnit, jestli `0.04-0.25` jsou skutečně "0 %, nerozhodnuto", nebo starý testovací default, co zůstal v kódu.

---

## 2. Booking/rezervace (`backend/src/modules/booking`) — mimo smlouvu Fáze 1 (K9), ale hotovo/natvrdo

**[OVĚŘENO ČTENÍM KÓDU]** `booking/slots.ts:12-19`, `DEFAULT_BOOKING_CONFIG`:
```
timezone: "Europe/Bratislava", durationMinutes: 60, bufferMinutes: 15,
stepMinutes: 30, minNoticeHours: 24, maxAdvanceDays: 90
```
Délka konzultace, pauza mezi termíny, jak daleko dopředu lze/nelze rezervovat — vše natvrdo. Týdenní otvírací pravidla (`WeeklyRule`) a výjimky (`DayException`) mají typy připravené na data z DB/adminu, ale žádný admin endpoint na jejich správu v `backend/src/api/admin/bookings/` není (jen `route.ts` a `[id]/cancel/route.ts` — výpis a zrušení, ne editace otvíracích hodin).

Protože K9 je oficiálně mimo rozsah Fáze 1 dle smlouvy, tohle neblokuje 23. 10. — ale pokud se rezervace přece jen zapne dřív (zmiňováno jako otevřená otázka v `STOREFRONT-POZADAVKY-FAZE1.md` sekce "Rezervace konzultace"), bude to potřeba doplnit.

## 3. Magic-link přihlášení — malá položka, nízká priorita

**[OVĚŘENO ČTENÍM KÓDU]** `auth-magic-link/policy.ts:5`: `MAGIC_LINK_TTL_SECONDS = 900` (15 min) natvrdo. Bezpečnostní parametr, pravděpodobně nemá smysl dávat klientce do adminu — zmiňuju jen pro úplnost, doporučuju nechat natvrdo.

## 4. Entitlement (RESET 40+) — z větší části v pořádku

**[OVĚŘENO ČTENÍM KÓDU]** `entitlement/policy.ts`: platnost přístupu (`entitlement_days`) a co počítá jako digitální/entitlement produkt (`metadata.digital`, `metadata.entitlement`) se čte z **metadat produktu** — to jde editovat přes standardní Medusa admin UI (produkt → metadata), takže tohle NENÍ gap, pokud klientka bude mít přístup k Medusa admin produktovému editoru. Ověřit jen, že se metadata pole v adminu reálně zobrazují/editují (ne skryté API-only pole).

## 5. Pricing rule chain (`nexus/domains/pricing/*Rule.ts`) — rule enginy samotné jsou v pořádku

**[OVĚŘENO ČTENÍM KÓDU]** `CouponDiscountRule.ts`, `ClearanceWindowRule.ts`, `DiscountLimitRule.ts`, `QuantityTierRule.ts` — všechny berou vstupní hodnoty (`discountPercent`, `pct`, `validFrom/To`, limity) jako **parametry**, nic business-specifického v nich natvrdo není. Problém není v rule engine, ale v tom, ODKUD se tyhle parametry berou (viz bod 1 — zatím ze statické TS konstanty, ne z adminu).

## 6. Klub ANASTASIA / předplatné — DŮLEŽITÉ ZJIŠTĚNÍ k otevřené otázce z chatu

K otázce "zařazení zákaznic do klubu/předplatného" (viz `PROGRESS_LOG.md` sekce 9, otevřený konflikt se smlouvou):

- **[OVĚŘENO ČTENÍM KÓDU]** `admin-demo/STATUS.md:13` (datováno 9. 10. 2026) tvrdí: *"Klub ANASTASIA & Stripe Billing: Členská sekcia a predplatné (`/api/klub/subscribe`), R2/Stream ochrana. ✅"* — označeno jako HOTOVO.
- **[OVĚŘENO ČTENÍM KÓDU]** Ale v `admin-demo/worker.js` (198 řádků, celý soubor) **žádný `klub` routing, string ani endpoint neexistuje.** Grep na "klub" nic nenašel. Tvrzení v STATUS.md o hotovém `/api/klub/subscribe` je nepodložené — přesně ten typ zápisu, před kterým `PROGRESS_LOG.md` sekce 5 varuje ("Nic se sem nezapisuje jako hotové na základě... tvrzení agenta").
- **[OVĚŘENO ČTENÍM KÓDU]** `nexus/domains/billing/TenantSubscriptionPlanFlow.ts` a `SubscriptionLifecycleRule.ts` existují, ale řeší **NEXUS vlastní multi-tenant SaaS billing** (Tenant → Subscription → Plan, tedy NEXUS fakturující SVÉ tenanty/klienty jako platformu), **ne** zákaznické členství/klub pro nákupčí ANASTASIA e-shopu. Jose v komentáři (`TenantSubscriptionPlanFlow.ts:21`) výslovně píše, že "subscription payment flow" je "zatím vůbec neřešit".

**Závěr:** žádný funkční "klub/předplatné" kód pro zákaznice ANASTASIA nikde neexistuje, navzdory starému tvrzení v `admin-demo/STATUS.md`. Ten dokument je zastaralý/nespolehlivý a neměl by se brát jako zdroj pravdy (doporučuju ho buď smazat, nebo na začátek napsat varování, že je neověřený a předchází dnešnímu `PROGRESS_LOG.md`). Rozhodnutí o rozsahu (prostá segmentace vs. skutečné předplatné) z `PROGRESS_LOG.md` sekce 9 zůstává nutné, nic se tím nevyřešilo — spíš naopak, potvrzuje se, že se musí stavět od nuly.

---

## 7. Prioritizovaný seznam — co blokuje správný návrh C5, pokud se neřeší dřív

1. **Vyčistit/ujasnit `StaticPricingConfigurationProvider.ts`** (bod 1) — obsahuje data pod jménem ANASTASIA a protiřečí zápisu "0 % nerozhodnuto". Bez opravy hrozí, že se omylem nasadí špatné slevy.
2. **Napsat varování/smazat `admin-demo/STATUS.md`** (bod 6) — tvrdí hotové věci, co v kódu nejsou; riziko, že si to někdo (Codex, jiný agent, i Lucky) přečte a bude stavět na neexistujícím základu.
3. Teprve pak má smysl navrhovat konkrétní obrazovky C5 (ceny/tiery/akce, rezervace-pokud se zapne, klub-pokud se potvrdí rozsah) — návrh postavený na současném stavu dokumentace by jinak kopíroval už zjištěné nepřesnosti.

Nekontrolováno v tomhle průchodu (mimo časový rozsah): `nexus/domains/campaign/*`, `warehouse/*`, `availability/*`, `voucher/*` do hloubky — rule enginy tam vypadají stejně parametrizované jako pricing (bod 5), ale nebyly čtené soubor po souboru.
