# Rozsah adminu podle posledního rozhodnutí vedení

Claude/Jose 16. 10. 2026 ve společném CODEX-CLAUDE-BACKEND-ADMIN.md výslovně zařadili do fáze1 Klub/předplatné a SK/EN/RU. Jedno jádro, jeden checkout, jedna zákazníková identita a jeden admin pro všechny její weby jsou závazné architektonické zásady. Starší rozdělení OUTSIDE_CONTRACT/PHASE2 v inventáři není aktuálním rozhodnutím. Produktový/obsahový rozsah dalších webů tím není automaticky implementovaný.

Klub se nesmí napojit přes přímé Worker Stripe subscriptions. Dílčí [PR#32](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/32), [#33](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/33), [#34](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/34) a [#35](https://github.com/hlancaric-ship-it/anastasia-nexus/pull/35) řeší hranici plateb, pravidla, trvalý stav a čtení nativních dokladů. Nejsou důkazem kompletního hotového předplatného nebo adminu. Správu kategorií, sekcí a stránek musí klientka ovládat vizuálně sama, bez programátora.

Překlady: backend model/verze/schválení a admin patří Codexovi; storefront přepínač/klíče a napojení Claudovi. Automatický překlad nikdy nepřepíše ručně schválený text. Osobní motiv adminu a veřejný vzhled jednotlivých webů jsou samostatné preference.

Po integraci membership modulu je potřeba znovu spustit inventář: doplnit `source_units.modules` o `backend/src/modules/membership/index.ts`, `models` o `membership.ts` a `membership-receipt.ts` v příslušné models složce a `test_sources` o nové testy; potvrdit hashe všech nových/změněných API. Nynější mapa ověřuje svůj skutečný strom C5, nikoli zdroje dosud neslitých větví. Zdrojový checker se nesmí vypnout nebo oslabit kvůli zastaralému inventáři.
