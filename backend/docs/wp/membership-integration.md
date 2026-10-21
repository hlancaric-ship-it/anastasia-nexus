# Společná integrace Klubu

Stav IMPLEMENTED_UNVERIFIED do skutečné společné CI a propojení storefrontu/configu od Clauda. Navazuje na #39; nemění standardní Stripe provider ani entitlement zdroj. Cena není pevně daná: obsluha založí nativní produkt/cenu v C5 a v /app/clenstva nastaví verzi a počet pevných UTC dnů. Tento tok prodává digitální členský přístup bez fyzického doručování.

## Storefront kontrakt

Všechny cesty vyžadují autentizovanou zákazníci a no-store. Anonymní/neplatný actor401, cizí záznam404, změněné podmínky409, neplatné údaje422, nedostupné jádro503.

1. Standardní vlastní cart+jediná variantu členského produktu, /store/nexus-cart a uložený souhlas /store/carts/:id/consents.
2. GET /store/memberships/offer?cart_id vrací offer: cart_id, product_id,variant_id,title,version,period_days,amount_minor,currency,amount_label. Jen server vypočte cenu; při změně409 obnovit přes nexus-cart.
3. POST /store/memberships/checkout {cart_id,version,amount_minor,auto_renew} vrací checkout:{id,cart_id,status,terms,auto_renew}. Částka/verze je potvrzení serverového návrhu, ne vstup do cenového výpočtu. Jiné obchodní parametry se odmítají. Příprava proběhne před platební session; digitální členství nepřebírá nenulové poštovné.
4. POST /store/memberships/checkouts/:id/payment-session vrací payment_session:{id,provider_id,client_secret},checkout_id,cart_id. Vždy native pp_membership_stripe_membership a MANUAL capture; UI použije stejný Stripe Payment Element. Potvrzení karty vytvoří pouze autorizaci, zachycení proběhne až po checkout/SafeOrder kontrole. Žádné klientské provider/method/price se nepřebírají.
5. Stávající POST /store/nexus-checkout {cart_id} provede stále stejné NEXUS/legal/SafeOrder kontroly a native objednávku. Membership guard navíc ověří immutable souhlas, přesnou variantu/cenu/verzi/délku a trvalou vazbu session. Přímé standardní completeCartWorkflow jej neobejde.
6. POST /store/memberships/checkouts/:id/settle vrací SETTLED/PENDING, membership_id, access a mandate:{status:SAVED|NOT_REQUESTED|PENDING_VERIFICATION}. Přístup se neztratí jen proto, že se dočasně nedohledala uložená metoda; bez ověřeného mandátu se neúčtuje.
7. GET /store/memberships?offset=0 a POST /store/memberships/:id/stop pro vlastní přehled a zastavení budoucí obnovy. Běžící platbu nelze vydávat za zrušenou.
8. Při NEEDS_ACTION GET /store/memberships/:id/payment vrátí jen existující vlastní native client_secret+attempt_id. Po potvrzení banky POST /store/memberships/:id/reconcile pokračuje tímto EXISTUJÍCÍM pokusem; nevytváří další cyklus. Žádné karty/metody se do klienta nepřenášejí.

## Obnova a provoz

10min billing job používá trvalý klíč období, vlastní nativní košík, původní adresní/regionální kontext a původní právní souhlas pouze při stále aktuálních verzích. Změna ceny/verze/délky/právních dokumentů zastaví účtování k ověření. Před účtováním se ověří i GDPR tombstone a skutečný vlastník uložené Stripe metody.

Každá provider operace má předem uloženou hranici. Unknown se známou native session dohledá stejný intent přes stejný guarded checkout, nikdy nevytváří druhý. Bez dohledatelného native ID zůstává výsledek v karanténě k prověření; bezpečný systém nesmí tvrdit, že nezachycený response znamená neprovedenou platbu. Native Stripe off-session confirm/capture se provádí teprve v authorizePayment po core validation; requires_action zůstává ve stejném pokusu. Každá úspěšná obnova má nativní objednávku, capture ledger, receipt a omezený přístup.

Vlastní anastasia-admin/ SPA dostává HTTP /admin/memberships* pro členství/přístupy, nedokončené nákupy, editor podmínek a Platby a obnovy. Podle rozhodnutí Jose/Claude byla prototypová nová /app/clenstva agenda odstraněna; zákazník nemá používat Medusa Admin. Dohledání v adminu nikdy nespouští nové stržení. Stavy a chyby jsou slovensky a používají osobní vzhled adminu.

Claude integruje globální membershipStoreMiddlewares a modul membership + samostatný provider membership-stripe(id membership, stejné Stripe credentials jako standardní provider, capture:true). Do jeho configu/middleware ani storefrontu tento balík samovolně nesahá. Žádný self-merge ani deploy.

## Důkazy

Cílené unit/types lokálně; PostgreSQL a plná regrese pouze CI. Společná E2E fixture používá skutečný native backend/DB/auth/workflow/guard a skutečný NEXUS Worker. Nahrazuje pouze externí Stripe SDK protokol syntetickým transportem, takže neprokazuje živou Stripe/SCA/bankovní integraci. UI vlastní SPA a storefrontu ověřuje Claude; historické prototypové /app browser testy nejsou důkazem této nové SPA. Finální čísla a zdrojové commity se doplní až po úspěšné CI; do té doby žádné tvrzení o hotovém celku.
