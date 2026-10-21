# Klub: přístup po zaplacení a obnova po výpadku

Stav: VERIFIED pro níže uvedený lifecycle přístupu a dohledání po výpadku. Závisí na PR#33–#35. Není to ještě checkout/automatické účtování ani storefront subscribe kontrakt.

Reconciler pod zámkem členství načte jeho trvalý doklad a znovu ověří vlastní nativní objednávku a platbu. Přístup volá přes veřejné API existujícího entitlement modulu, jeho kód nemění. Používá stejný order+product dedupe key jako obecný handler, takže nevytváří druhé paralelní právo. Po uložení ověří zákazníci/produkt/variantu/objednávku/platnost a znovu nativní platbu. Perioda končí sjednaným časem od skutečné platby, nikoli opakovaným zpracováním.

Plný refund nebo storno odebere současný přístup a zastaví obnovu. Částečný refund zachová dosavadní zaplacené období a zastaví další obnovu pro kontrolu. Ručně zrušený přístup se sám neobnoví; kratší ruční úprava nebo administrativní override se nepřepisují. Obecný omylem neomezený/delší order grant bez ručního override se pouze omezí na zaplacené období, neprodlouží. Nejasné čtení platby nehlásí úspěch ani naslepo neodebírá existující zaplacený přístup.

Události order.placed/payment.captured/payment.refunded/order.canceled spouštějí ověření existujícího členského dokladu. Výpadek nebo chybějící událost dohledá periodický job po10minutách. Job neprovádí žádnou platbu. Není-li membership modul připojený (integraci má Claude), obě cesty nic neprovádějí. Provozní stavy jsou v existujících strukturovaných/trvalých entitlement logách, bez e-mailu nebo platebních klíčů. Trvalý log používá stávající best-effort mechanismus; jeho zápis není atomický s přístupem.

Membership a entitlement zápisy nejsou jednou transakcí napříč moduly. Výpadek mezi nimi opraví idempotentní opakování a periodická kontrola. Refund mezi čtením a grantem řeší opětovné čtení po grantu a následné nativní události/reconciliation; nelze tvrdit okamžitou globální revokaci během výpadku DB nebo již vydaného media tokenu. První aktivace musí po uložení členského dokladu explicitně zavolat reconciler, protože capture událost mohla přijít ještě před jeho vznikem. To je úkol zbývajícího checkout adaptéru.

Ověření:9cílených lifecycle unit testů, actualMedusa/PG case s paralelním grantem/read-back/replay/expirací/částečným+plnýmrefundem. Plné testy a PG pouze CI. Zbývá nativní checkout/reconciliation adaptér, souhlas a uložená metoda, renewal účtování, HTTP/admin/storefront a bezpečné připojení konfigurace. Žádný self-merge/deploy ani externí platby.

Finální [důkaz](evidence/membership-access-ci.json): cílenáCI38971550923 unit80/80(access9),backendtsc,actualMedusa/PG3/3 PASS. PlnáCI38971550924 backend752/752,NEXUS1230/1230,workerd139/139,HTTP151/151 PASS. Kompletní předplatné a veřejná obsluha stále chybí; registrovat modul do aplikace má Claude až po zbytku integrace.
