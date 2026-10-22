# 03 – API

**Pre:** Mgr. Lucia Rogožanová, LUCRAT spol. s r.o.
**Vypracoval:** L-Code Dynamics
**Verzia:** 22. 10. 2026, vetva `release/predani-faze1`

---

## 1. Čo je API a prečo Vás to zaujíma

API je rozhranie, cez ktoré spolu hovoria časti systému. Web sa cez API pýta backendu na produkty a posiela mu košík. Administrácia sa cez API prihlasuje a ukladá zmeny. NEXUS a backend si cez API vymieňajú cenu, riziko a udalosti.

Pre Vás sú podstatné tri dôsledky:

1. **API je jediná cesta k dátam.** Nedá sa obísť obrazovkou ani priamym zásahom do prehliadača.
2. **API je zdokumentované.** Ak by systém prevzal iný dodávateľ, má presný zoznam trás a ich úloh.
3. **API nie je verejný zoznam na skúšanie.** Väčšina trás vyžaduje prihlásenie a pri neoprávnenom volaní vracia chybu.

Katalóg nižšie obsahuje **iba vlastné trasy tohto projektu**. Štandardné trasy Medusy (produkty, košíky, objednávky, platby, prihlásenie, nativna administrácia) tu nie sú opakované. Katalóg ich dopĺňa, nenahrádza.

Rozsah k 22. 10. 2026: **125 súborov trás a 159 HTTP metód**.

| Skupina | Trasy | Metódy | Pre koho |
|---|---|---|---|
| Store API (predná časť) | 44 | 50 | web, teda návštevník a zákazník |
| Feedy pre porovnávače | 2 | 2 | Heureka a Google Merchant Center |
| Strojové rozhrania (webhooky) | 2 | 2 | NEXUS a okrajová vrstva |
| Admin API (správca) | 77 | 105 | administrácia |

---

## 2. Ako sa API prihlasuje

| Skupina | Čo sa vyžaduje | Čo to **nie je** |
|---|---|---|
| Store API | verejný kľúč obchodu, pri osobných údajoch navyše identita zákazníka | verejný kľúč nie je prihlásenie zákazníka |
| Admin API | prihlásenie typu správca | zákaznícky token sem nemá prístup |
| Webhooky | podpis správy a časová pečiatka | nie je to prihlásenie zákazníka |
| Feedy | nič, sú verejné | ceny aj tak počíta server |

Telo požiadavky, query parametre, chyby a oprávnenia určuje vždy konkrétna trasa a jej middleware. Tento katalóg je mapa, nie náhrada kódu.

---

## 3. Store API – prehľad trás

Verejný kľúč obchodu, pri osobných údajoch identita zákazníka.

### 3.1 Rezervácie konzultácií

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/booking-slots` | voľné termíny konzultácie pre produkt v rozsahu 31 dní, bez osobných údajov |
| GET, POST | `/store/bookings` | zoznam vlastných rezervácií a vytvorenie rezervácie s držaním termínu |
| POST | `/store/bookings/:id/cart` | pripnutie rezervácie ku košíku, kontroluje vlastníctvo |
| POST | `/store/bookings/:id/cancel` | zrušenie vlastnej rezervácie |

### 3.2 Košík, cena a dokončenie objednávky

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/nexus-cart` | serverový prepočet košíka, teda cena, zľava podľa úrovne, kupón, darčekový poukaz a DPH |
| GET, POST | `/store/nexus-checkout/options` | možnosti dopravy a platby, pri POST zapísanie výberu a vytvorenie platobnej relácie |
| POST | `/store/nexus-checkout` | dokončenie objednávky v poradí súhlas, kontrola ceny, posúdenie rizika, objednávka |
| POST | `/store/carts/:id/consents` | uloženie súhlasu s obchodnými podmienkami a s ochranou údajov, viazané na verziu textu |
| GET | `/store/legal/versions` | aktuálne verzie obchodných podmienok, zásad ochrany údajov a súhlasu s newsletterom |

### 3.3 Objednávky a odstúpenie

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/orders/:id/cancel` | zrušenie vlastnej objednávky, pravidlá a lehota sú na serveri |
| POST | `/store/withdrawals` | žiadosť o odstúpenie od zmluvy do 14 dní |
| POST | `/store/contract-withdrawal` | online odstúpenie verejným formulárom, záznam pre správcu a potvrdenie zákazníkovi, obmedzené podľa IP |

### 3.4 Zákaznícky účet a digitálny obsah

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/entitlements` | zoznam aktívnych prístupov k digitálnemu obsahu |
| POST | `/store/media-access` | krátkodobý podpísaný odkaz na chránený súbor po overení prístupu |
| GET | `/store/customers/me/export` | export vlastných osobných údajov ako JSON |
| POST | `/store/customers/me/erasure-request` | žiadosť o výmaz osobných údajov |

### 3.5 Chat a kontakt

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET, POST | `/store/chat/conversations` | zoznam konverzácií a otvorenie novej s prvou správou |
| GET | `/store/chat/conversations/:id` | detail vlastnej konverzácie, cudzia sa neprezradí |
| POST | `/store/chat/conversations/:id/messages` | pridanie správy s limitmi podľa pravidiel |
| POST | `/store/chat/conversations/:id/read` | označenie ako prečítané |
| GET | `/store/chat/status` | stav chatu a zostávajúci počet správ |
| POST | `/store/contact` | kontaktný formulár, správa správcovi s odpoveďou na e-mail návštevníka |

### 3.6 Newsletter

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/newsletter` | prihlásenie s uložením verzie súhlasu |
| POST | `/store/newsletter/unsubscribe` | odhlásenie tokenom z e-mailu |
| GET, POST | `/store/newsletter/unsubscribe/link` | odkaz z kampane, GET zobrazí potvrdenie a POST odhlási, vrátane jednoklikového odhlásenia |

### 3.7 Darčekové poukazy

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/gift-vouchers/apply` | uplatnenie poukazu ako kreditu košíka, výšku určí server |
| POST | `/store/gift-vouchers/recipients` | uloženie obdarovaného ku kusom poukazu v košíku |
| POST | `/store/gift-vouchers/remove` | odobratie kreditu poukazu z košíka |

### 3.8 QR kupóny

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/coupon-links` | kontrola QR odkazu na kupón, iba čítanie, zľava sa tu neuplatňuje |

### 3.9 Obsah webu

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/content/:page` | aktuálny obsah stránky vrátane zmien z administrácie |
| GET | `/store/pages/:slug` | znenie právnej alebo informačnej stránky |

### 3.10 Klub (mimo rozsahu Fázy 1)

Trasy pre členstvo existujú a sú overené, ale Klub nie je súčasťou Fázy 1 a v administrácii je skrytý.

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/memberships` | zoznam členstiev zákazníka |
| GET | `/store/memberships/offer` | ponuka členstva pre košík, podmienky zo servera |
| POST | `/store/memberships/checkout` | príprava checkoutu členstva so snapshotom zmluvy |
| POST | `/store/memberships/checkouts/:id/payment-session` | vytvorenie platobnej relácie pre členstvo |
| POST | `/store/memberships/checkouts/:id/settle` | zúčtovanie checkoutu proti vytvorenej objednávke |
| GET | `/store/memberships/:id/payment` | stav platby a pokračovanie v platbe |
| POST | `/store/memberships/:id/reconcile` | zosúladenie prerušenej platby |
| POST | `/store/memberships/:id/stop` | zastavenie budúcej obnovy |

### 3.11 Program RESET 40+ a Zrkadielko

Trasy pracujú iba pre zákazníka s aktívnym prístupom k programu. Bez prístupu vracajú 403 a nič neprezradia.

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/reset-program` | štruktúra programu, teda šestnásť týždňov, materiály a pracovné listy po dňoch, záverečné zhrnutie a odkaz na vstupný dotazník |
| GET, POST | `/store/reset-journal` | záznamy Zrkadielka vlastníka účtu a hodnotenia, ktoré sa majú zobrazovať, plus založenie nového záznamu |
| PATCH, DELETE | `/store/reset-journal/:id` | úprava a zmazanie vlastného záznamu, cudzí záznam sa nedá otvoriť |

### 3.12 Prihlásenie zákazníka

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/store/nexus-auth/logout` | zneplatní prihlásenie na serveri, po odhlásení token prestane platiť aj pri ďalšom volaní |

Samotné prihlásenie jednorazovým odkazom a štandardné prihlásenie heslom rieši natívne rozhranie Medusy, ktoré tento katalóg neopakuje. Vlastná trasa odhlásenia existuje preto, že bežné odhlásenie v Meduse token nezruší a ten by ostal platný do vypršania.

### 3.13 Pomocné trasy

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/store/custom` | zástupná trasa zo šablóny Medusy, nič nevracia |

---

## 4. Feedy pre porovnávače

Verejné, bez prihlásenia, ceny počíta server.

| Metódy | Cesta | Čo rieši |
|---|---|---|
| GET | `/feeds/google.xml` | feed pre Google Merchant Center |
| GET | `/feeds/heureka.xml` | XML feed pre Heureka |

Odkazy na oba feedy nájdete v administrácii v Nastavenia → Pripojenia. Feed sa generuje automaticky a obsahuje iba zverejnené produkty v predajnom kanáli, s cenou s DPH a s obrázkami.

---

## 5. Strojové rozhrania (webhooky)

Podpísané správy medzi službami, nie používateľské API.

| Metódy | Cesta | Čo rieši |
|---|---|---|
| POST | `/hooks/nexus/booking-order` | podpísaná synchronizácia rezervácie konzultácie so službou NEXUS |
| POST | `/hooks/ops/edge-events` | podpísaný príjem prevádzkových udalostí z okraja do tabuľky `ops_event` |

Pri neshode podpisu alebo identifikátora obchodu vracajú 401 alebo 503. Nikdy nekončia tichou chybou.

---

## 6. Admin API – prehľad podľa agend

Vyžaduje prihlásenie typu správca. Zákaznícky token sem nemá prístup.

### 6.1 Objednávky, zákazníci a údaje

| Agenda | Trasy |
|---|---|
| Poznámky k zákazníkovi | `/admin/customers/:id/notes`, `/admin/customers/:id/notes/:note_id` |
| Výmaz osobných údajov | `/admin/customer-erasures`, `/admin/customer-erasures/:id/execute` |
| Odstúpenia od zmluvy | `/admin/withdrawals`, `/admin/withdrawals/:id` |
| Odstúpenia z webového formulára | `/admin/contract-withdrawals`, `/admin/contract-withdrawals/:id` |
| Prevádzkové udalosti a audit | `/admin/ops/events`, `/admin/ops/audit`, `/admin/ops/nexus` |
| Objednávky | `/admin/nexus/orders/:id/cancel`, `/admin/nexus/orders/:id/refund`, `/admin/nexus/orders/:id/notes` |
| Pripravenosť obchodu | `/admin/readiness` |

Zrušenie objednávky aj vrátenie peňazí vyžadujú povinný dôvod. Systém si pamätá, kto zmenu vykonal, kedy a prečo, a zapisuje ju do prehľadu zmien. Vrátenie peňazí vie zároveň vrátiť tovar na sklad.

### 6.2 Produkty, ceny a kategórie

| Agenda | Trasy |
|---|---|
| Katalóg produktov | `/admin/product-catalogue` |
| Cena variantu | `/admin/shop-prices/:id` |
| Médiá produktu | `/admin/media`, `/admin/media/:key` |
| Chránené médiá produktu | `/admin/products/:id/protected-media`, `/admin/products/:id/protected-media/attach`, `/admin/products/:id/protected-media/upload-url`, `/admin/products/:id/protected-media/:key` |
| Feedy | `/admin/feeds` |

Kategórie, produkty a varianty sa spravujú štandardnými trasami Medusy, ktoré tento katalóg neuvádza.

### 6.3 Kupóny, QR a poukazy

| Agenda | Trasy |
|---|---|
| QR odkazy na kupóny | `/admin/coupon-links`, `/admin/coupon-links/:id`, `/admin/coupon-links/:id/qr`, `/admin/coupon-links/:id/deactivate`, `/admin/coupon-links/import` |
| Darčekové poukazy | `/admin/vouchers`, `/admin/vouchers/settings`, `/admin/vouchers/:id/transactions`, `/admin/vouchers/:id/void`, `/admin/vouchers/refund` |

Kupóny a zľavy sa zakladajú štandardnými trasami Medusy pre promotions.

### 6.4 Vernostné úrovne

| Agenda | Trasy |
|---|---|
| Politika úrovní | `/admin/nexus/loyalty-policy` |
| Zákazníci a úrovne | `/admin/nexus/loyalty-customers`, `/admin/nexus/customers/:id/tier`, `/admin/nexus/customers/tiers` |

### 6.5 Obsah, e-maily a newsletter

| Agenda | Trasy |
|---|---|
| Obsah webu | `/admin/content`, `/admin/content/reset`, `/admin/pages`, `/admin/pages/:slug` |
| Program RESET 40+ (len čítanie) | `/admin/reset-program` |
| E-mailové šablóny | `/admin/email-templates`, `/admin/email-templates/:template`, `/admin/email-templates/:template/preview` |
| Newsletter | `/admin/newsletter`, `/admin/newsletter/campaigns`, `/admin/newsletter/campaigns/:id`, `/admin/newsletter/campaigns/:id/test`, `/admin/newsletter/campaigns/:id/send`, `/admin/newsletter/campaigns/:id/cancel` |

Trasa `/admin/reset-program` je zámerne iba na čítanie. Ukáže, aké hodnotenia a akú štruktúru programu zákazník uvidí. Záznamy Zrkadielka sa tu neukazujú, patria zákazníkovi.

### 6.6 Zákaznícka starostlivosť

| Agenda | Trasy |
|---|---|
| Chat | `/admin/chat/conversations`, `/admin/chat/conversations/:id`, `/admin/chat/conversations/:id/messages`, `/admin/chat/conversations/:id/read`, `/admin/chat/customers/:id/block`, `/admin/chat/templates`, `/admin/chat/templates/:id` |
| Rezervácie | `/admin/bookings`, `/admin/bookings/:id/cancel` |
| Typy konzultácií | `/admin/booking/types`, `/admin/booking/types/:id` |
| Dostupnosť | `/admin/booking/availability` |
| Prístupy k obsahu | `/admin/entitlements`, `/admin/entitlements/:id/revoke` |
| Dopravcovia | `/admin/carriers` |

### 6.7 Klub a administrácia

| Agenda | Trasy |
|---|---|
| Klub | `/admin/memberships`, `/admin/memberships/:id/stop`, `/admin/memberships/products/:id`, `/admin/memberships/billing/:id/reconcile` |
| Vzhľad administrácie | `/admin/my-theme` |
| Správcovia a ich roly | `/admin/nexus/admin-roles` |
| Dvojfaktorové overenie | `/admin/nexus/admin-2fa`, `/admin/nexus/admin-2fa/verify`, `/admin/nexus/admin-2fa/recovery-codes` |
| Pomocná trasa | `/admin/custom`, zástupná trasa zo šablóny Medusy, nič nevracia |

Rolu môže meniť iba vlastník a posledného vlastníka nie je možné znížiť. Záložné kódy sa zobrazia raz pri zapnutí overenia, uložte si ich mimo počítača.

---

## 7. Doménové moduly a ich tabuľky

| Modul | Tabuľky | Na čo slúži |
|---|---|---|
| `auth-magic-link` | bez vlastných tabuliek | prihlásenie bez hesla jednorazovým odkazom |
| `auth-security` | `auth_link_state`, `auth_link_rate` | stav odkazov a počty pokusov, ochrana proti zneužitiu |
| `booking` | `booking`, `booking_availability` | rezervácie konzultácií, termíny, držanie, potvrdenie, zrušenie |
| `chat` | `chat_conversation`, `chat_message`, `chat_customer_block`, `chat_notification_state` | chat so správcom, limity, blokovanie, notifikácie |
| `coupon-link` | `coupon_link_record` | registrované QR a odkazové kupóny |
| `customer-privacy` | `customer_erasure`, `customer_note` | žiadosť o výmaz, anonymizácia, interné poznámky |
| `email-template` | `email_template_override` | prepísané texty e-mailov a zapnutie či vypnutie |
| `entitlement` | `entitlement` | prístup k digitálnemu obsahu, vlastník, produkt, platnosť, zrušenie |
| `gift-voucher` | `gift_voucher`, `gift_voucher_transaction`, `gift_voucher_settings` | vydanie, uplatnenie, vrátenie a denník pohybov poukazov |
| `legal` | `legal_consent`, `legal_withdrawal`, `legal_contract_withdrawal`, `newsletter_consent`, `newsletter_consent_event` | súhlasy, odstúpenia a newsletter |
| `membership` | `membership`, `membership_receipt`, `membership_checkout`, `membership_mandate`, `membership_billing_attempt`, `membership_initial_payment` | Klub, zmluva, mandát, obnovy a platby |
| `membership-stripe` | bez vlastných tabuliek | platobný provider Klubu |
| `newsletter` | `newsletter_campaign`, `newsletter_delivery` | kampane, snapshot doručení a podklady pre odosielanie |
| `notification-log` | bez vlastných tabuliek | záložný provider, e-mail iba zapíše do logu bez adresáta a obsahu |
| `notification-resend` | bez vlastných tabuliek | alternatívny provider e-mailov |
| `ops-audit` | `ops_event`, `ops_audit_entry` | prevádzkové udalosti a trvalý záznam zmien v administrácii |
| `payment-manual` | bez vlastných tabuliek | ručné platby, dobierka a prevod, platbu potvrdzuje správca |

---

## 8. Chybové stavy, ktoré sa môžu objaviť

| Stav | Kedy | Čo to znamená pre Vás |
|---|---|---|
| 400 | chybný vstup alebo nedostatok zásob | zákazník musí upraviť košík alebo doplniť sklad |
| 401 | chýba alebo nesedí prihlásenie či podpis | niekto nie je prihlásený alebo sa neshodujú tajomstvá |
| 403 | konverzácia nie je dostupná alebo je zablokovaná | zákazník nemá prístup k chatu |
| 404 | objekt neexistuje alebo patrí niekomu inému | zámerne sa nerozlišuje, aby sa neprezradila existencia |
| 409 | konflikt, napríklad zmenená cena alebo obsadený termín | platba sa musí vytvoriť znova alebo vybrať iný termín |
| 422 | chýba platný súhlas alebo je produkt nedostupný | dokončenie sa nedá vykonať bez súhlasu |
| 429 | prekročený limit, napríklad počet správ | zákazník musí počkať |
| 503 | nedostupná závislosť, napríklad NEXUS alebo konfigurácia | objednávka sa nedokončí, nič sa nezapíše |

Zásada je rovnaká pri všetkých trasách: **keď je niečo nejasné alebo nedostupné, systém radšej nič nezapíše, než aby zapísal nesprávnu cenu alebo objednávku.**

---

## 9. Úplnosť zoznamu a údržba katalógu

Táto kapitola zoskupuje trasy podľa agend, aby sa dali čítať po činnostiach, nie po súboroch. Počty v tabuľke v kapitole 1 sú počty súborov v repozitári, teda 44 pre web, 77 pre administráciu, 2 feedy a 2 webhooky, spolu 125 súborov a 159 metód.

Úplný zoznam po jednotlivých súboroch je v technickom katalógu `backend/docs/API-KATALOG.md`. Ten pri odovzdaní neuvádzal v tabuľkách dvanásť pomocných trás, konkrétne odhlásenie zákazníka, program RESET 40+ a Zrkadielko, správcov s rolami a dvojfaktorovým overením a objednávky v administrácii. Tieto trasy sú doplnené v kapitolách 3.11, 3.12, 6.1 a 6.7. Katalóg sa doplní pri odovzdaní, aby sedel počet v hlavičke s počtom riadkov.

Keď sa pridá alebo presunie trasa, znovu sa vygeneruje zoznam a skontroluje sa, že metódy v súbore zodpovedajú exportom. Pri zmene oprávnení alebo tela odpovede sa upraví tento katalóg aj dokumentácia konkrétnej domény. Pri bezpečnostnej zmene sa čítajú všetky middleware, nielen samotný handler, pretože export handleru nepopisuje celý autentifikačný reťazec.
