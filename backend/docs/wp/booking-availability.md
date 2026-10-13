# Rezervace: typy konzultací a týdenní dostupnost (K9)

## Model
- **Typ konzultace** = Medusa produkt s `metadata.booking = {version:1, durationMinutes, bufferMinutes, form: online|in_person, archived}`. Zakládá se přes `createProductsWorkflow` (digitální shipping profil, kanál „ANASTASIA e-shop“). Neaktivní = `draft`, archiv = `archived: true` (store vrací 404).
- **Dostupnost** = tabulka `booking_availability` (`calendar_id`, `date`, `start_time`, `end_time`). Lucia zadává úseky ručně po dnech, žádná opakovaná pravidla. Nevyplněný den nenabízí nic (fail-closed). Úseky jsou společné pro všechny typy, sloty se generují podle délky zvoleného typu.
- **Kalendář** je jeden (`calendar_id = "lucia"`). Advisory lock `booking:calendar:lucia` a kontrola překryvu (včetně bufferu každé rezervace) platí přes všechny typy. Unikátní index `(calendar_id, starts_at)` pro aktivní rezervace.
- Časová zóna je vždy `Europe/Bratislava`.

## API
- `GET/POST /admin/booking/types`, `GET/POST /admin/booking/types/:id` (název, délka, buffer, cena EUR, popis, forma, aktivní, archiv).
- `GET /admin/booking/availability?week_start=YYYY-MM-DD` vrací úseky týdne a aktivní rezervace (jméno zákaznice, typ).
- `POST /admin/booking/availability` `{week_start, days:[{date, ranges:[{start_time,end_time}]}]}` nahradí týden. Vrací 409 `availability_conflict`, pokud by smazání nebo zkrácení úseku vyřadilo aktivní rezervaci. „Zkopírovat minulý týden“ = GET minulého týdne + POST do aktuálního.
- Store `GET /store/booking-slots` a `POST /store/bookings` čtou úseky z tabulky. Hold mimo úsek vrací 409 `slot_not_offered`.

## Migrace
`Migration20261013192849`: přidá `booking.calendar_id`, vymění unikátní index z `(product_id, starts_at)` na `(calendar_id, starts_at)` a založí `booking_availability`. **Před nasazením ověřit**, že v produkci nejsou aktivní překrývající se rezervace různých typů, jinak index selže.
