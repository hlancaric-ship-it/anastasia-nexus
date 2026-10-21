# Dokončení fyzického a smíšeného nákupu

Na pokyn Luckyho po sloučení PR51. Stav: IMPLEMENTED_UNVERIFIED do výsledku CI.

Existující nativní sada ověřovala digitální nákup, platbu, oprávnění, refund/storno, kurýrní cenu a odmítnutí nesprávného přepravního profilu. Doplněny dva přímé pozitivní scénáře do stejného shipping HTTP helperu:

- Fyzický košík se správnou dopravou: NEXUS přecenění, právní souhlasy, nativní objednávka, PENDING před platbou, capture přes skutečný nativní workflow, shodné uložené součty a dopravné, objednávka v zákazníkové historii, opakování bez duplicit a žádný digitální nárok.
- Smíšený košík: oba skutečné nativní přepravní profily, stejné dokončení a zachycení platby, přístup automaticky vznikne jen k zakoupenému digitálnímu produktu a patří správné zákazníci.

Žádná náhrada rout, platebních workflow ani databáze mockem; izolované syntetické identity a lokální nativní provider existují pouze v CI. Skutečný katalog/nároky/objednávky v uživatelském náhledu se nemění. Žádné e-maily, produkce, nasazení ani nové závislosti. Plný HTTP/PG běh pouze na GitHub Actions.
