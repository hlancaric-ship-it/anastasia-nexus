# Klub: smluvní podmínky uložené před platbou

Stav: VERIFIED pro níže vymezenou nativní integraci; důkaz [membership-checkout-ci.json](evidence/membership-checkout-ci.json). Není hotové předplatné ani veřejné subscribe API. Navazuje na membership policy/persistence/receipt/access (#33–#37) a opravu integrovaného inventáře #38.

## Implementace

`prepareMembershipCheckout(scope, cartId, actorId, approval)` je interní serverová funkce před vytvořením platební session. `actorId` pochází z ověřené identity. `approval` obsahuje potvrzení version/amount_minor/auto_renew, nikoli autoritativní cenu: košík se přepočítá stávajícím NEXUS adaptérem a jeho nativní celková částka se musí přesně shodovat. Produkt musí být publikovaný a mít serverová metadata `membership: {version, period_days}`; délka je 1–3650 pevných UTC dnů, ne kalendářní měsíce. Nic se neseeduje s vymyšlenou obchodní cenou/délkou. Košík musí patřit zákaznici, obsahovat pouze jednu členskou variantu v množství 1, být EUR, nedokončený, bez již vytvořené platební session/platby/objednávky. Po přepočtu se podmínky košíku znovu čtou.

`membership_checkout` uchovává trvalý, neměnný snapshot vlastního košíku, zákaznice, produktu/varianty, verze, období, celkové ceny a souhlasu včetně serverového času. Globální unique cart_id i order_id zůstávají účinné po soft-delete. Replay stejných podmínek zachová původní čas; změna ceny, délky, verze či obnovování pod stejným košíkem se odmítne. Nové podmínky vyžadují nový košík a nový souhlas, nepřepisují prodanou smlouvu.

Po dokončení EXISTUJÍCÍHO `/store/nexus-checkout` volá integrátor `settleMembershipCheckout(scope, checkoutId, actorId)`. Objednávku dohledá výhradně přes uložený košík a native order_cart. Při chybějící objednávce vrátí PENDING; nikdy nevytváří další checkout či platbu. Native receipt loader ověří vlastníka, položku, zachycenou částku/měnu a nulový refund. Platba před časem souhlasu nesmí aktivovat nové podmínky. Zápis membership + receipt claim + settlement patří do jedné transakce. Opakování neprodlouží období ani znovu nezapne zastavenou obnovu. Přístup následně udělí existující reconciler; jeho případný výpadek napraví dosavadní job.

10min recovery job nyní dohledává i připravené checkouty bez browser callbacku. Používá keyset stránkování, aby změna prepared→settled nepřeskakovala další zákaznice. Chyby se zapisují pouze konstantním kódem a opaque ID; neúspěšný záznam zůstává pro další průchod.

## Hranice a zbývající integrace

Příprava používá stejný cart lock key jako installed Medusa completeCartWorkflow. Garance napříč procesy odpovídá nakonfigurovanému nativnímu locking provideru; vlastní PG unique/advisory ochrana zůstává samostatná. Nejde o atomický snapshot všech modulů; finální receipt znovu kontroluje skutečně zaplacenou cenu a položku.

Funkce reserveCheckout/settleCheckout přijímající serverové fakty jsou interní, nikoli zákaznický HTTP payload. Žádné nové veřejné route ani middleware se v tomto balíku nepřidávají. Konfiguraci modulu nadále integruje Claude až po dokončení celého toku.

`auto_renew` je zaznamenaný souhlas, NENÍ doklad uložené karty/platebního mandátu ani oprávnění spustit účtování. Před veřejným zapnutím musí locked native validate hook vynutit existenci a shodu uložené smlouvy pro každý členský produkt, i při přímém volání standardního completeCartWorkflow; jinak lze nový přípravný krok obejít. Registrace tohoto guardu patří do dalšího integračního balíku před aktivací katalogu a HTTP. Ještě chybí příprava Stripe metody přes nativní payment session, její ověřené serverové svázání, bezpečné initial/renewal HTTP/workflow, dunning/needs_action a plný skutečný NEXUS checkout test. Právní souhlasy a SafeOrder zůstávají na stávajícím nativním checkoutu. Žádné přímé Stripe Subscription API, externí platby ani nasazení.

## Ověření

Lokálně pouze cílené unit a backend tsc. Nové testy ověřují neplatné podmínky, cizí košík, změnu potvrzené ceny/verze, přípravu až po zahájení platby, žádné dvojí checkout volání, serverové dohledání objednávky a recovery více než dvou stránek s částečným selháním.

Vlastní Medusa/PG fixture běží pouze na CI: souběžná rezervace, odmítnutí přepsání smlouvy, skutečná native system-provider capture, settlement souběžný s recovery, jedna membership/receipt, původní délka/čas, zastavená obnova, soft-delete unique a historická platba. Toto prokazuje nativní ledger/persistence/grant; neprokazuje živý Stripe ani celý NEXUS checkout. Plná regrese jen GitHub Actions.

Finální CI39026938969 SUCCESS:115/115unit,4/4actualMedusaPG,backendtsc PASS. Plná CI39026938973 SUCCESS: backend854/854, nexus1233/1233, workerd142/142, http151/151 PASS. Zdroj runtime809e676; doplnění důkazů runtime nemění.
