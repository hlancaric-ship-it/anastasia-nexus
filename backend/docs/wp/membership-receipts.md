# Klub: ověřená fakta z nativní objednávky

Stav: IMPLEMENTED_UNVERIFIED do skutečné integrační CI. Závisí na PR #33/#34; stále nejde o kompletní předplatné.

`loadNativeMembershipReceipt` načte skutečný `order_cart` link a nativní objednávku přes OrderModule.retrieveOrder (včetně verze, skutečného množství a serverových totals), jednu členskou položku s množstvím 1, customer/product/variant, EUR celkovou cenu a platební kolekce s platbami. Potvrdí jen přesně zachycenou celkovou částku, bez refundu/storna a s platným časem capture. Součet nativních plateb se musí shodovat se souhrnem kolekcí i objednávkou; duplicita, chybějící částka, částečné/nesouladné capture nebo čas v budoucnu končí odmítnutím.

Cena se převádí na celé EUR centy přesným serverovým parsováním, nikoli zaokrouhlením nebo výpočtem v prohlížeči. Chybějící/neplatné částky nejsou nula. Čas se přijímá pouze jednoznačně v UTC. Funkce nemá síťové volání na platební bránu ani neuděluje přístup.

`CheckoutBinding` MUSÍ pocházet z trvalého serverového pokusu o checkout nebo z jeho ověřeného vlastního prvního nákupu. Metadata košíku/objednávky ani klientský `customer_id`, cena, stav platby a klíč obnovy nejsou autorita. Nativní vazba order→cart se porovnává s tímto serverovým záznamem. Samotný typ není kryptografický důkaz a loader se nesmí vystavit jako HTTP přijímající binding od klienta. Unikátní spotřebu dokladu a jeho aplikaci dál zajišťuje membership modul; pravidla kontrolují souhlas a schválenou cenu/verzi.

Ověření: 38 cílených loader testů + 33 pravidel. Integrační CI přidává skutečnou Medusa objednávku/košík/linky a native system-provider autorizaci/capture/refund, zákaz cizí identity a cizího košíku a předání důkazu do trvalého membership modulu. Nejde o důkaz placeného Stripe checkoutu nebo kompletního NEXUS renewal toku; testovací system provider je syntetický, žádné externí platby.

Zbývá: trvalý pokus navázaný na checkout, souhlas/uložená metoda, native checkout/reconciliation adaptér a joby, skutečné grant/revoke, admin a storefront HTTP kontrakt. Modul se v produkční konfiguraci nepřipojuje tímto PR; integraci má Claude až po ověření celého toku. Nic nenasazovat ani automaticky neslučovat.

Nativní modul může vracet množství jako BigNumber, i když jej JSON/HTTP serializuje jako číslo. Loader proto přesně rozbaluje nativní číselný wrapper a stále vyžaduje množství přesně1. Chybějící množství není výchozí jednička; rekurze wrapperů je omezená.
