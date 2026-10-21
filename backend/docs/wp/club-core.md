# Klub: hranice jednoho platebního jádra

Rozhodnutí Claude/Jose 16. 10. 2026 přesouvá Klub/předplatné do fáze 1. Veškeré platby musí projít jednou Medusou + NEXUS, se společnou zákazníkov, objednávkou a přístupem. Starší dokumenty označující Klub mimo rozsah toto nové rozhodnutí nenahrazují.

## První balík: vyřazení druhého platebního toku

`POST /api/klub/subscribe` je vyřazené rozhraní a vrací `410 LEGACY_SUBSCRIPTION_RETIRED`, `Cache-Control: no-store`. Nečte tělo, nepoužije Stripe klíč a nevolá Stripe ani jinou síť. Stará URL zůstává rozpoznaná, aby starý klient nebo retry nespustil předplatné mimo jádro. Odpověď neobsahuje alternativní platební URL ani slib dokončené objednávky.

Předchozí implementace vytvořila Stripe Customer a Subscription přímo z klientského e-mailu a názvu plánu, s pevně uvedenými neověřenými price ID a bez společné Medusa objednávky. Nemá být cestou k novému Klubu. Tato změna neruší ani nemigruje případná dřívější Stripe předplatná; jejich existence nebyla proti produkci ověřovaná, žádné produkční volání se neprovádí.

## Co to ještě neimplementuje

Automatické předplatné a jeho nativní kontrakt stále chybí. Nainstalovaný standardní Stripe provider Medusy obsluhuje PaymentIntent, nikoli automaticky obchodní subscription model. Existující entitlement synchronizace umí udělit přístup po zachycené platbě a odebrat jej při stornu/plném refundu; metadata.digital + entitlement_days mohou reprezentovat jednorázový časový přístup. Samotná tato metadata však nejsou automaticky obnovované předplatné.

Před napojením storefront CTA je nutné doplnit a ověřit: členství/periodu a souhlas v jádru, vazbu na skutečný produkt a serverovou cenu, první nákup přes nexus-checkout, ověřenou platbu před přístupem, opakované účtování s nativním platebním záznamem a objednávkou, obnovu při výpadku/souběhu/duplicitní události, nezaplacení a ukončení členství, admin obsluhu a customer izolaci. Klient nesmí poslat cenu nebo přidělit přístup. Žádná subscription CTA nemá používat vyřazenou Worker URL.

## Ověření

Pět cílených unit kontrol žádné sítě pro platný/starý, neplatný i prázdný požadavek a přítomný/chybějící klíč; plná Node/workerd/Medusa regrese jen CI. Tento balík není tvrzení hotového předplatného.

## Finální důkaz prvního balíku

VERIFIED pro vyřazení staré platební cesty: [CI38965584015](https://github.com/hlancaric-ship-it/anastasia-nexus/actions/runs/38965584015), [trvalý důkaz](evidence/club-checkout-boundary-ci.json). Backend672/672, NEXUS1233/1233, workerd142/142 včetně3nových boundary kontrol, MedusaHTTP151/151 PASS. NEXUS TypeScript a cílené unit5/5 PASS. Automatické předplatné tím není implementované.
