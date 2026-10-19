# Správa názvů a pořadí zakoupeného obsahu

## Implementováno

Vlastní admin má v jednotném editoru produktu sekci „Zakúpený obsah“. Zobrazuje skutečný registr souborů tohoto produktu, srozumitelné názvy a druh obsahu; žádné technické identifikátory zákaznic ani JSON. Pět souborů na stránku udržuje sekci kompaktní. Tlačítka Vyššie/Nižšie fungují i přes hranici stránek a přesunují fokus spolu s položkou. Názvy a pořadí se potvrzují společným Uložiť zmeny.

`GET/POST /admin/products/:id/protected-media` vyžaduje správce, vrací pouze bezpečný registr a jeho revizi. Zápis je omezen na přejmenování a pořadí přesně stejné sady klíčů. Nepovoluje přidání cizího objektu, odstranění, duplicity ani změnu práv, cen a ostatních metadat. Původní doplňující metadata jednotlivých souborů zůstávají zachována. Revize, zámek, read-back a audit chrání před tichým přepsáním souběžné úpravy. Opakování již dokončeného zápisu je bez dalšího zápisu a auditu. Nečitelný původní registr se odmítne měnit.

Běžné uložení produktu pole protected_media vynechává, aby zastaralý formulář nepřepsal novější obsah. Nativní slučování metadat se ověřuje v izolované HTTP/PG regresi. Při chybě se místní úpravy nezahazují; načtení uložené verze vyžaduje potvrzení, pokud existují neuložené změny. Chyba načtení není vydávána za prázdnou knihovnu.

## Rozsah a omezení

Soukromý bucket, původních 24 objektů, podpisy a zákaznické přístupy se nemění. Žádné nahrávání do veřejných Medusa obrázků, žádný deploy, e-mail nebo zákaznická transakce. Tento balík NEIMPLEMENTUJE nahrávání nových soukromých souborů ani jejich nové přiřazování/mazání; to je navazující samostatný balík s validací úložiště. Obecné nativní produktové API zůstává dostupné důvěryhodnému správci, tento endpoint není novou globální RBAC politikou.

## Ověření

- Fokus backend unit: autentizace, validace, zámek/read-back, opakování, stará revize, cizí/duplicitní/odstraněné klíče, uchování metadat a chyba úložiště.
- Browser: izolovaná syntetická DOM fixture bez přístupu do Medusy/R2; názvy/pořadí, hranice stránkování, keyboard fokus, escapování, zachování editací při chybě a pravdivý prázdný/chybový stav.
- Nativní HTTP/PG: pouze Actions; správce versus zákaznice, read/write/replay/conflict, nativní metadata merge a zobrazení správného pořadí zákaznici při zachování media-access guardů.
- Evidence výsledků se doplní po dokončení běhů. Bez tvrzení produkčního nasazení.
