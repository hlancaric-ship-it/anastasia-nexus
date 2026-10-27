# C5: rezervovaná služba bez dopravy

**Stav: VERIFIED.** Úplná backendová regrese 179/179 suites, 1698/1698 testů PASS; cílené testy klasifikace, zápisu řádku, checkout options a completion guardu PASS. `npx tsc --noEmit`, mapa API (54 features, 145 custom routes, 259 native routes) a `git diff --check` PASS.

## Problém a změna

Pokladna odvozovala fyzické zboží jen z přepravního profilu. Konzultace s platnou `product.metadata.booking`, běžným profilem a `requires_shipping: true` proto nabízela dopravu a bez jejího výběru blokovala platbu. Regresní test reprodukuje tuto kombinaci ze zadání bez volání Cloud API.

Před výběrem dopravy server vyřadí z přepravních profilů pouze služby s platnou konfigurací rezervací z katalogu. Samotný přepočet košíku zároveň přepíše `requires_shipping` každého řádku podle katalogu: rezervovaná služba nebo digitální profil `false`, ostatní včetně neznámých dat `true`. Používá se existující Medusa workflow aktualizace řádku; příznak z klientských metadat nemá vliv.

Kontrola dopravy před vytvořením platby běží až po této opravě. Nativní completion hook porovnává i příznak dopravy se svým uzamčeným snapshotem; po změně typu produktu nepovolí starý nesoulad. Služba samotná nepotřebuje přepravní adresu ani nabídku dopravy. Fyzická položka ve smíšeném košíku stále vyžaduje dopravu i při stejném profilu jako služba. Neplatná konfigurace rezervace ani chybějící profil fyzické položky výjimku nedostanou.

## Ověření a hranice

Cílené testy pokrývají klasifikaci katalogu, zápis serverového příznaku přes reprice, booking-only platbu bez dopravy, smíšený košík, neplatnou konfiguraci a stávající completion guard. Před předáním také `npx tsc --noEmit`, kompletní `npm run test:unit`, mapa API a `git diff --check`.

Žádný zápis do Cloud dat, žádná změna katalogu, migrace ani deploy. Pro opravený kód není nutná změna produktových dat; existující řádek se opraví při serverovém přepočtu. Skutečný průchod kartou po nasazení zůstává E2E úkolem týmu.
