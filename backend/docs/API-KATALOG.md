# Katalog vlastních backend API a modulů

**Generováno ze zdrojáku:** `find backend/src/api -name route.ts` — **125 route souborů, 159 HTTP metod**.
Stav: 22. 10. 2026 (vetva `release/predani-faze1`).

Níže je přesný výčet vlastních tras. Nativní Medusa rozhraní (produkty, košíky, objednávky, payment collections, customer/auth, nativní admin) tu **nejsou duplikována** — katalog vlastních tras doplňuje, nenahrazuje.

> Pravidla čtení: `Store API` používá zverejňovací kľúč webu; ten **není** prihlásenie zákazníka. Kde trasa pracuje s osobnými údajmi, vyžaduje identitu zákazníka. `Admin API` vyžaduje prihlásenie správce. Strojové rozhrania overujú podpis a odmietajú cudzí pôvod.

Telo požiadavky, query, chyby a oprávnenia určujú implementácia trasy a jej middleware — tento katalog je mapa, nie náhrada kódu.

## Store API (predná časť)

Zverejňovací kľúč + pri osobných údajoch identita zákazníka. **44 tras, 50 metod.**

| Metody | Cesta | Čo rieši | Zdroj |
|---|---|---|---|
| GET | `/store/booking-slots` | Voľné termíny konzultácie pre produkt v rozsahu 31 dní (bez osobných údajov). | `src/api/store/booking-slots/route.ts` |
| POST | `/store/bookings/:id/cancel` | Zrušenie vlastnej rezervácie konzultácie. | `src/api/store/bookings/[id]/cancel/route.ts` |
| POST | `/store/bookings/:id/cart` | Viaže rezerváciu konzultácie na konkrétny košík (kontroluje vlastníctvo). | `src/api/store/bookings/[id]/cart/route.ts` |
| GET, POST | `/store/bookings` | Zoznam vlastných rezervácií; POST vytvorí rezerváciu (hold termínu). | `src/api/store/bookings/route.ts` |
| POST | `/store/carts/:id/consents` | Uloženie súhlasu s obchodnými podmienkami a GDPR ku košíku (viazané na verziu textu). | `src/api/store/carts/[id]/consents/route.ts` |
| POST | `/store/chat/conversations/:id/messages` | Pridanie správy do konverzácie (limity podľa pravidiel). | `src/api/store/chat/conversations/[id]/messages/route.ts` |
| POST | `/store/chat/conversations/:id/read` | Označenie konverzácie ako prečítanú (znovu sa zarmuje e-mail). | `src/api/store/chat/conversations/[id]/read/route.ts` |
| GET | `/store/chat/conversations/:id` | Detail vlastnej konverzácie (cudzia konverzácia sa neprezradí). | `src/api/store/chat/conversations/[id]/route.ts` |
| GET, POST | `/store/chat/conversations` | Zoznam konverzácií zákazníka; POST otvorí novú konverzáciu s prvou správou. | `src/api/store/chat/conversations/route.ts` |
| GET | `/store/chat/status` | Stav chatu a zostávajúci počet správ zákazníka. | `src/api/store/chat/status/route.ts` |
| POST | `/store/contact` | Kontaktný formulár: správa pre správcu s odpoveďou na e-mail návštevníka. | `src/api/store/contact/route.ts` |
| GET | `/store/content/:page` | Aktuálny obsah stránky webu pre storefronte (zmeny z administrácie, inak pôvodné znenie). | `src/api/store/content/[page]/route.ts` |
| POST | `/store/contract-withdrawal` | Online odstúpenie od zmluvy (časť C právnych textov): záznam pre správcu + potvrdenie doručenia zákazníkovi. Verejné, obmedzené podľa IP. | `src/api/store/contract-withdrawal/route.ts` |
| POST | `/store/coupon-links` | Kontrola QR odkazu na kupón (iba čítanie -- zľava sa tu neuplatňuje). | `src/api/store/coupon-links/route.ts` |
| GET | `/store/custom` | Zástupná trasa (scaffold Medusa) -- nič nevracia. | `src/api/store/custom/route.ts` |
| POST | `/store/customers/me/erasure-request` | Žiadosť zákazníka o výmaz osobných údajov (GDPR). | `src/api/store/customers/me/erasure-request/route.ts` |
| GET | `/store/customers/me/export` | Export vlastných osobných údajov ako JSON. | `src/api/store/customers/me/export/route.ts` |
| GET | `/store/entitlements` | Zoznam aktívnych prístupov zákazníka k digitálnemu obsahu. | `src/api/store/entitlements/route.ts` |
| POST | `/store/gift-vouchers/apply` | Uplatnenie darčekového poukazu ako kredit košíka (výšku určí server). | `src/api/store/gift-vouchers/apply/route.ts` |
| POST | `/store/gift-vouchers/recipients` | Uloženie obdarovaného ku kusom darčekového poukazu v košíku. | `src/api/store/gift-vouchers/recipients/route.ts` |
| POST | `/store/gift-vouchers/remove` | Odoberanie kreditu darčekového poukazu z košíka. | `src/api/store/gift-vouchers/remove/route.ts` |
| GET | `/store/legal/versions` | Aktuálne verzie právnych textov (VOP, GDPR, súhlas s newsletterom). | `src/api/store/legal/versions/route.ts` |
| POST | `/store/media-access` | Krátkodobé podpísané prepojenie na chránený súbor (po overení prístupu). | `src/api/store/media-access/route.ts` |
| GET | `/store/memberships/:id/payment` | Stav platby členstva a pokračovanie v platbe. | `src/api/store/memberships/[id]/payment/route.ts` |
| POST | `/store/memberships/:id/reconcile` | Zosúladenie prerušenej platby členstva. | `src/api/store/memberships/[id]/reconcile/route.ts` |
| POST | `/store/memberships/:id/stop` | Zastavenie budúcej obnovy členstva. | `src/api/store/memberships/[id]/stop/route.ts` |
| POST | `/store/memberships/checkout` | Príprava checkoutu členstva so snapshotom zmluvy. | `src/api/store/memberships/checkout/route.ts` |
| POST | `/store/memberships/checkouts/:id/payment-session` | Vytvorenie platobnej session pre checkout členstva. | `src/api/store/memberships/checkouts/[id]/payment-session/route.ts` |
| POST | `/store/memberships/checkouts/:id/settle` | Usporiadanie checkoutu členstva proti vytvorenej objednávke. | `src/api/store/memberships/checkouts/[id]/settle/route.ts` |
| GET | `/store/memberships/offer` | Ponuka členstva pre košík (podmienky zo servera). | `src/api/store/memberships/offer/route.ts` |
| GET | `/store/memberships` | Zoznam členstiev zákazníka. | `src/api/store/memberships/route.ts` |
| POST | `/store/newsletter` | Prihlásenie na newsletter (zaznamená sa súhlas s verziou textu). | `src/api/store/newsletter/route.ts` |
| POST | `/store/newsletter/unsubscribe` | Odhlásenie z newslettru tokenom z e-mailu. | `src/api/store/newsletter/unsubscribe/route.ts` |
| GET, POST | `/store/newsletter/unsubscribe/link` | Odkaz z kampane: GET zobrazí potvrdenie, POST odhlási (aj jednoklikové `List-Unsubscribe`). | `src/api/store/newsletter/unsubscribe/link/route.ts` |
| POST | `/store/nexus-cart` | Serverový prepočet košíka: cena, zľava podľa úrovne, kupón, darčekový poukaz, DPH. | `src/api/store/nexus-cart/route.ts` |
| GET, POST | `/store/nexus-checkout/options` | Možnosti dopravy a platby; POST zapíše výber a vytvorí platobnú session. | `src/api/store/nexus-checkout/options/route.ts` |
| POST | `/store/nexus-checkout` | Dokončenie objednávky: súhlas -> kontrola ceny -> posúdenie rizika -> objednávka. | `src/api/store/nexus-checkout/route.ts` |
| POST | `/store/orders/:id/cancel` | Zrušenie vlastnej objednávky zákazníkom (pravidlá a lehota na serveri). | `src/api/store/orders/[id]/cancel/route.ts` |
| GET | `/store/pages/:slug` | Znenie právnej/informačnej stránky (trasa je pripravená na pripojenie webu). | `src/api/store/pages/[slug]/route.ts` |
| POST | `/store/withdrawals` | Žiadosť o odstúpenie od zmluvy do 14 dní. | `src/api/store/withdrawals/route.ts` |

## Feedy pre porovnávače

Verejné, bez prihlásenia; ceny počíta server. **2 tras, 2 metod.**

| Metody | Cesta | Čo rieši | Zdroj |
|---|---|---|---|
| GET | `/feeds/google.xml` | Feed RSS 2.0 pre Google Merchant Center (ceny počíta server). | `src/api/feeds/google.xml/route.ts` |
| GET | `/feeds/heureka.xml` | XML feed pre Heureka (ceny počíta server). | `src/api/feeds/heureka.xml/route.ts` |

## Strojové rozhrania (webhooky)

Podpísané správy medzi službami -- nie používateľské API. **2 tras, 2 metod.**

| Metody | Cesta | Čo rieši | Zdroj |
|---|---|---|---|
| POST | `/hooks/nexus/booking-order` | Podpísaná synchronizácia rezervácie konzultácie so službou NEXUS. | `src/api/hooks/nexus/booking-order/route.ts` |
| POST | `/hooks/ops/edge-events` | Podpísaný príjem prevádzkových udalostí z okraja do `ops_event`. | `src/api/hooks/ops/edge-events/route.ts` |

## Admin API (správca)

Vyžaduje prihlásenie typu `user`; zákaznícky token sem nemá prístup. **77 tras, 105 metod.**

| Metody | Cesta | Čo rieši | Zdroj |
|---|---|---|---|
| GET, POST | `/admin/booking/availability` | Týždenná dostupnosť konzultácií (čítanie a nahradenie úsekov). | `src/api/admin/booking/availability/route.ts` |
| GET, POST | `/admin/booking/types/:id` | Detail a úprava typu konzultácie (deaktivácia, archív). | `src/api/admin/booking/types/[id]/route.ts` |
| GET, POST | `/admin/booking/types` | Zoznam a vytvorenie typu konzultácie (cena, forma, dĺžka). | `src/api/admin/booking/types/route.ts` |
| POST | `/admin/bookings/:id/cancel` | Zrušenie rezervácie konzultácie správcom. | `src/api/admin/bookings/[id]/cancel/route.ts` |
| GET | `/admin/bookings` | Prehľad rezervácií s filtrami (zákazník, produkt, stav). | `src/api/admin/bookings/route.ts` |
| GET, POST | `/admin/carriers` | Dopravca a jeho API kľúč (klúč sa ukladá šifrovaný). | `src/api/admin/carriers/route.ts` |
| POST | `/admin/chat/conversations/:id/messages` | Odpoveď správcu v konverzácii. | `src/api/admin/chat/conversations/[id]/messages/route.ts` |
| POST | `/admin/chat/conversations/:id/read` | Označenie konverzácie ako prečítanú správcom. | `src/api/admin/chat/conversations/[id]/read/route.ts` |
| GET, POST | `/admin/chat/conversations/:id` | Detail konverzácie; POST akcia (close, reopen, mute, unmute). | `src/api/admin/chat/conversations/[id]/route.ts` |
| GET | `/admin/chat/conversations` | Priehrada konverzácií (neprečítané a stlmené hore). | `src/api/admin/chat/conversations/route.ts` |
| POST | `/admin/chat/customers/:id/block` | Blokovanie chatu zákazníka (vratné). | `src/api/admin/chat/customers/[id]/block/route.ts` |
| DELETE | `/admin/chat/templates/:id` | Zmazanie šablóny odpovede. | `src/api/admin/chat/templates/[id]/route.ts` |
| GET, POST | `/admin/chat/templates` | Šablóny odpovedí v chate (zoznam, vytvorenie). | `src/api/admin/chat/templates/route.ts` |
| POST | `/admin/content/reset` | Obnovenie pôvodného znenia poľa alebo konkrétnej staršej verzie. | `src/api/admin/content/reset/route.ts` |
| GET, POST | `/admin/content` | Obsah webu po sekciách a poliách; POST uloží hodnotu jedného poľa (s auditom). | `src/api/admin/content/route.ts` |
| GET, POST | `/admin/contract-withdrawals/:id` | Detail odstúpenia od zmluvy; POST zmena stavu (received -> processed -> closed). | `src/api/admin/contract-withdrawals/[id]/route.ts` |
| GET | `/admin/contract-withdrawals` | Zoznam odstúpení od zmluvy poslaných formulárom na webe. | `src/api/admin/contract-withdrawals/route.ts` |
| POST | `/admin/coupon-links/:id/deactivate` | Vypnutie kupónu viazaného na QR odkaz. | `src/api/admin/coupon-links/[id]/deactivate/route.ts` |
| GET | `/admin/coupon-links/:id/qr` | Obrázok QR kódu (SVG alebo PNG). | `src/api/admin/coupon-links/[id]/qr/route.ts` |
| GET | `/admin/coupon-links/:id` | Detail QR odkazu (pôvod, stav kupónu, použitia). | `src/api/admin/coupon-links/[id]/route.ts` |
| POST | `/admin/coupon-links/import` | Hromadný import pôvodných QR odkazov (bez aktivácie kupónov). | `src/api/admin/coupon-links/import/route.ts` |
| GET, POST | `/admin/coupon-links` | Zoznam a vytvorenie QR odkazu na zľavový kupón. | `src/api/admin/coupon-links/route.ts` |
| GET | `/admin/custom` | Zástupná trasa (scaffold Medusa) -- nič nevracia. | `src/api/admin/custom/route.ts` |
| POST | `/admin/customer-erasures/:id/execute` | Vykonanie výmazu (anonymizácia účtu a zrušenie prístupov). | `src/api/admin/customer-erasures/[id]/execute/route.ts` |
| GET | `/admin/customer-erasures` | Zoznam žiadostí o výmaz osobných údajov. | `src/api/admin/customer-erasures/route.ts` |
| POST, DELETE | `/admin/customers/:id/notes/:note_id` | Úprava alebo zmazanie poznámky k zákazníkovi. | `src/api/admin/customers/[id]/notes/[note_id]/route.ts` |
| GET, POST | `/admin/customers/:id/notes` | Poznámky k zákazníkovi (zoznam, nová poznámka). | `src/api/admin/customers/[id]/notes/route.ts` |
| POST | `/admin/email-templates/:template/preview` | Náhľad e-mailu so vzorovými údajmi (nič sa neukladá ani neposiela). | `src/api/admin/email-templates/[template]/preview/route.ts` |
| GET, POST, DELETE | `/admin/email-templates/:template` | Prepísanie textových slotov, zapnutie/vypnutie a obnovenie šablóny. | `src/api/admin/email-templates/[template]/route.ts` |
| GET | `/admin/email-templates` | Zoznam e-mailových šablón a ich stav (zapnuté, upravené). | `src/api/admin/email-templates/route.ts` |
| POST | `/admin/entitlements/:id/revoke` | Odobratie prístupu k digitálnemu obsahu (s dôvodom). | `src/api/admin/entitlements/[id]/revoke/route.ts` |
| GET, POST | `/admin/entitlements` | Prehľad prístupov k digitálnemu obsahu; POST ručné udelenie prístupu. | `src/api/admin/entitlements/route.ts` |
| GET | `/admin/feeds` | Prehľad produktových feedov (adresy a počet produktov). | `src/api/admin/feeds/route.ts` |
| DELETE | `/admin/media/:key` | Odstránenie obrázka z knižnice (blokuje sa, ak ho používa produkt). | `src/api/admin/media/[key]/route.ts` |
| GET, POST | `/admin/media` | Knihovna obrázkov: zoznam a zápis nahratých súborov (len obrázkové typy). | `src/api/admin/media/route.ts` |
| POST | `/admin/memberships/:id/stop` | Zastavenie automatickej obnovy členstva. | `src/api/admin/memberships/[id]/stop/route.ts` |
| POST | `/admin/memberships/billing/:id/reconcile` | Dohľad existujúceho pokusu o platbu (read-only, nič neúčtuje). | `src/api/admin/memberships/billing/[id]/reconcile/route.ts` |
| POST | `/admin/memberships/products/:id` | Nastavenie produktu ako produktu Klubu (dĺžka obdobia, verzia podmienok). | `src/api/admin/memberships/products/[id]/route.ts` |
| GET | `/admin/memberships` | Prehľad Klubu: členovia, nákupy členstva, produkty a obnovy platieb. | `src/api/admin/memberships/route.ts` |
| GET, POST | `/admin/my-theme` | Vzhľad administrácie pre konkrétneho správcu (s revíziou proti súbehu). | `src/api/admin/my-theme/route.ts` |
| GET | `/admin/newsletter` | Zoznam súhlasov s newsletterom (voliteľne export CSV). | `src/api/admin/newsletter/route.ts` |
| GET, POST | `/admin/newsletter/campaigns` | Zoznam kampaní s číslami pre prehľad; POST vytvorí koncept (obsah sa sanitizuje). | `src/api/admin/newsletter/campaigns/route.ts` |
| GET, POST, DELETE | `/admin/newsletter/campaigns/:id` | Detail kampane, úprava len v stave konceptu, zmazanie konceptu. | `src/api/admin/newsletter/campaigns/[id]/route.ts` |
| POST | `/admin/newsletter/campaigns/:id/send-test` | Testovacia kópia kampane, len na adresy @l-code-dynamics.com. | `src/api/admin/newsletter/campaigns/[id]/send-test/route.ts` |
| POST | `/admin/newsletter/campaigns/:id/send` | Zafrontovanie kampane: snapshot prihlásených súhlasov a stav `queued`. | `src/api/admin/newsletter/campaigns/[id]/send/route.ts` |
| POST | `/admin/newsletter/campaigns/:id/cancel` | Zrušenie odosielania, zvyšné pending doručenia sa označia ako skipped. | `src/api/admin/newsletter/campaigns/[id]/cancel/route.ts` |
| POST | `/admin/nexus/customers/:id/tier` | Ručné priradenie vernostnej úrovne zákazníkovi (alebo zrušenie ručného zámku a automatický prepočet). | `src/api/admin/nexus/customers/[id]/tier/route.ts` |
| POST | `/admin/nexus/customers/tiers` | Hromadné priradenie vernostnej úrovne vybraným zákazníkom. | `src/api/admin/nexus/customers/tiers/route.ts` |
| GET | `/admin/nexus/loyalty-customers` | Prehľad zákazníkov s ich vernostnou úrovňou (serverové filtrovanie a stránkovanie). | `src/api/admin/nexus/loyalty-customers/route.ts` |
| GET, PUT | `/admin/nexus/loyalty-policy` | Politika vernostných úrovní (úrovne, percentá, prahy) -- čítanie, uloženie a odoslanie do služby cenenia. | `src/api/admin/nexus/loyalty-policy/route.ts` |
| GET | `/admin/ops/audit` | Záznam zmien v administrácii (kto, čo, kedy). | `src/api/admin/ops/audit/route.ts` |
| GET | `/admin/ops/events` | Prevádzkové udalosti s filtrami (požiadavka, objednávka, košík, zákazník). | `src/api/admin/ops/events/route.ts` |
| GET | `/admin/ops/nexus` | Prehľad spracovania úloh v službe NEXUS (read-only). | `src/api/admin/ops/nexus/route.ts` |
| DELETE | `/admin/pages/:slug` | Obnovenie pôvodného znenia stránky. | `src/api/admin/pages/[slug]/route.ts` |
| GET, POST | `/admin/pages` | Texty stránok webu (zoznam, uloženie s overením). | `src/api/admin/pages/route.ts` |
| GET | `/admin/product-catalogue` | Katalóg produktov s filtrom digitálne/fyzické a stavom zverejnenia. | `src/api/admin/product-catalogue/route.ts` |
| DELETE | `/admin/products/:id/protected-media/:key` | Odpojenie chráneného súboru od produktu. | `src/api/admin/products/[id]/protected-media/[key]/route.ts` |
| POST | `/admin/products/:id/protected-media/attach` | Pripojenie nahratého súboru z R2 k produktu. | `src/api/admin/products/[id]/protected-media/attach/route.ts` |
| GET, POST | `/admin/products/:id/protected-media` | Zoznam chránených medií produktu a uloženie názvov a poradia. | `src/api/admin/products/[id]/protected-media/route.ts` |
| POST | `/admin/products/:id/protected-media/upload-url` | Presigned URL na nahranie súboru do súkromného úložiska R2. | `src/api/admin/products/[id]/protected-media/upload-url/route.ts` |
| GET | `/admin/readiness` | Kontrola pripravenosti obchodu (chyby a upozornenia). | `src/api/admin/readiness/route.ts` |
| POST | `/admin/shop-prices/:id` | Úprava základnej ceny variantu (EUR; zľavové zoznamy sa nemenia). | `src/api/admin/shop-prices/[id]/route.ts` |
| GET | `/admin/vouchers/:id/transactions` | Deník pohybov darčekového poukazu. | `src/api/admin/vouchers/[id]/transactions/route.ts` |
| POST | `/admin/vouchers/:id/void` | Zneplatnenie darčekového poukazu (s dôvodom). | `src/api/admin/vouchers/[id]/void/route.ts` |
| POST | `/admin/vouchers/refund` | Vrátenie peňazí na darčekový poukaz (idempotencie). | `src/api/admin/vouchers/refund/route.ts` |
| GET | `/admin/vouchers` | Prehľad darčekových poukazov (kódy sa zobrazujú maskovane). | `src/api/admin/vouchers/route.ts` |
| GET, POST | `/admin/vouchers/settings` | Nastavenia poukazov: hodnoty, platnosť, doručenie, rozsah použitia. | `src/api/admin/vouchers/settings/route.ts` |
| POST | `/admin/withdrawals/:id` | Zmena stavu žiadosti o odstúpenie (received -> accepted/rejected -> refunded). | `src/api/admin/withdrawals/[id]/route.ts` |
| GET | `/admin/withdrawals` | Zoznam žiadostí o odstúpenie od zmluvy. | `src/api/admin/withdrawals/route.ts` |

## Doménové moduly

| Modul | Modely (tabuľky) | Kľúčové použitie |
|---|---|---|
| `auth-magic-link` | bez vlastných modelov | Prihlásenie bez hesla (jednorazový odkaz z e-mailu). |
| `auth-security` | auth_link_state, auth_link_rate | Stav jednorazových odkazov a počty pokusov (ochrana proti zneužitiu). |
| `booking` | booking, booking_availability | Rezervácie konzultácií: termíny, drženie, potvrdenie, zrušenie. |
| `chat` | chat_conversation, chat_message, chat_customer_block, chat_notification_state | Chat zákazníka so správcom, limity, blokovanie a notifikácie. |
| `coupon-link` | coupon_link_record | Registrované QR a odkazové kupóny (overenie v admin aj vo webe). |
| `customer-privacy` | customer_erasure, customer_note | Žiadosť o výmaz údajov, anonymizácia a interné poznámky. |
| `email-template` | email_template_override | Prepísané textové sloty e-mailov a zapnutie/vypnutie e-mailu. |
| `entitlement` | entitlement | Prístup k digitálnemu obsahu (vlastník, produkt, platnosť, zrušenie). |
| `gift-voucher` | gift_voucher, gift_voucher_transaction, gift_voucher_settings | Darčekové poukazy: vydanie, uplatnenie, vrátenie, deník pohybov. |
| `legal` | legal_consent, legal_withdrawal, legal_contract_withdrawal, newsletter_consent, newsletter_consent_event | Súhlasy, odstúpenie od zmluvy (prihlásený zákazník aj online formulár) a newsletter. |
| `membership` | membership, membership_receipt, membership_checkout, membership_mandate, membership_billing_attempt, membership_initial_payment | Klub: členstvo, zmluva, mandát, obnovy a platby. |
| `membership-stripe` | bez vlastných modelov | Stripe provider Klubu (platba až po overení session). |
| `newsletter` | newsletter_campaign, newsletter_delivery | Kampane, snapshot doručení a podklady pre odosielanie cez notification modul. |
| `notification-log` | bez vlastných modelov | Záložný provider: e-mail sa iba zapíše do logu (bez adresáta a obsahu). |
| `notification-resend` | bez vlastných modelov | Transakčné e-maily cez Resend (hlavný provider). |
| `notification-zeptomail` | bez vlastných modelov | Záložný provider e-mailov (nasadenia bez RESEND_API_KEY). |
| `ops-audit` | ops_event, ops_audit_entry | Prevádzkové udalosti a trvalý záznam zmien v administrácii. |
| `payment-manual` | bez vlastných modelov | Ručné platby (dobierka, prevod) -- platbu potvrdzuje správca. |

## Ako katalóg udržať

- Pri pridaní alebo presunutí trasy spustiť znovu generovanie zoznamu (`find backend/src/api -name route.ts`) a skontrolovať, že metódy v súbore zodpovedajú `export async function GET/POST/...`.
- Pri zmene oprávnení alebo tela odpovede upraviť aj tento katalóg a príslušnú doménovú dokumentáciu v `backend/docs/wp/`.
- Bezpečnostná zmena: čítať globálny `backend/src/api/middlewares.ts` aj middleware balíka -- samotný export handleru nepopisuje celý autentizačný reťazec.
