# E-maily ANASTASIA – pastelový layout

Stav: `PARTIAL` (pokračování 2026-10-23).

## Pokračování 2026-10-23

Logo šablon ZeptoMail je přepojeno na `https://anastasia-test.l-code-dynamics.com/assets/logo-mark.png`; `curl -I` ověřil `200 image/png`. HTML používá PNG, atributy `width="52"` a `height="52"` už byly přítomné.

## Paleta e-mailů (2026-10-23)

Transakční šablony i newsletter používají společnou paletu: bílý povrch, `#e9e9f2` pozadí, `#a7a5cf` dekorativní levandulové linky, `#73729c` nadpisy a tlačítka a `#2b2a3a` text. `#73729c` na bílé má kontrast 4.55:1 (WCAG AA pro běžný text); `#55546b` se používá pro drobnější sekundární text. Tmavě zelená se pro ovládací prvky nepoužívá. Náhled uvítacího e-mailu používá neutrální „Vitajte“ bez jména.

Aktualizovány jsou testy obou renderovacích cest v `notification-zeptomail` a `newsletter`. Nasazení vyžaduje zálohu testovací DB a rebuild služby `backend` přes existující Compose projekt `anastasia-test` v `~/anastasia-test/src/ops/test-server`; záložní cesta: `~/db-backups/pre-backend-deploy-20261023.dump`.

Do katalogu přibyly `set-password-sk` a `admin-invite`. Přibyl subscriber pro `invite.created`, který předá pozvánku stávajícímu `sendEmail`. Tvar payloadu Medusa invite eventu a skutečné vytvoření použitelného invite URL nebyly ověřeny běhovým testem. Migrace v `scripts/migrate-legacy-customers-orders.ts` zůstala beze změny.

Zbývá: kompletní ruční překlady všech šablon do EN/RU a výběr locale podle zákazníka/objednávky/metadat není implementován. Newsletterový `renderCampaignEmail` je distribuční HTML pro kampaně, nikoli potvrzení přihlášení; store endpoint newsletteru pouze zapíše souhlas, potvrzovací e-mail nespouští. V prohledaném backendu nebyl nalezen e-mail o zpřístupnění digitálního obsahu/knihovny. Tyto dvě cesty proto nebylo co vizuálně sjednotit.

Náhledy pro 20 katalogových šablon a `index.html` jsou v `~/Desktop/ANASTASIA-K-ODESLANI/2026-10-23/emaily-nahled/`. Screenshoty jednotlivých šablon se nestihly kompletně vygenerovat; dostupné jsou screenshoty indexu 390/600 px a část screenshotů šablon. EN/RU náhledy chybí, protože odpovídající překlady nejsou hotové.

Ověření: `cd backend && npx jest src/modules/notification-zeptomail/__tests__/template-texts.unit.spec.ts --runInBand` (18/18 PASS); `cd backend && npx tsc --noEmit` (PASS).

Transakční a kampaňové e-maily používají společný vizuální směr: krémové pozadí, lesní zelenou, levandulový akcent, kartu širokou nejvýše 600 px, tabulkovou strukturu a inline styly. Hlavička načítá logo absolutně z `https://media.anastasiaoz.eu/logo-mark.png`. Patička obsahuje LUCRAT spol. s r.o., IČO 36652164, web a kontaktní e-mail. Transakční renderer nadále vrací HTML i plain text a zachovává veřejné API i předměty.

## Pokryté šablony

- `magic-link-sk`, `customer-welcome-sk`
- `order-placed-sk`, `payment-captured-sk`, `order-shipped-sk`, `order-refunded-sk`, `order-canceled-sk`
- `withdrawal-received-sk`, `contract-withdrawal-received-sk`, `contract-withdrawal-admin`
- `booking-confirmed-sk`, `booking-canceled-sk`
- `gift-voucher-recipient-sk`, `gift-voucher-buyer-sk`
- `chat-admin-digest`, `chat-admin-reply`, `order-placed-admin`, `contact-form-admin`
- Newsletter kampaň: `renderCampaignEmail` v `modules/newsletter/policy.ts`.
- Stránka odhlášení: `api/store/newsletter/unsubscribe/link/page.ts`.

## Zbývá

Všechny transakční texty a newsletterové texty jsou stále slovenské. Jazyk SK/EN/RU podle zákazníka, úplné překlady a skloňování nebyly doplněny. Veřejné jméno existujících šablon končí převážně `-sk`; zavedení EN/RU variant vyžaduje překlad všech slotů včetně předmětů, tlačítek, systémových vět a větvených stavů objednávky. Nynější render preview jsou SK. Tmavý režim je omezen metadaty pro světlé schéma a pevnými inline barvami, ale nebyl ověřen v poštovních klientech.

Repo obsahuje také odeslání `set-password-sk` v `scripts/migrate-legacy-customers-orders.ts`, které není součástí katalogu ZeptoMail. Při tomto úkolu jsem soubor záměrně neupravoval, protože leží mimo vlastní oblast šablon. V prohledané části backendu jsem nenašel samostatné šablony pro newsletter double opt-in potvrzení, pozvánku do adminu ani digitální knihovnu; jejich existenci a runtime cestu je třeba potvrdit, než lze tvrdit pokrytí všech e-mailů.

Náhledy vytvořené 2026-10-23 v `~/Desktop/ANASTASIA-K-ODESLANI/2026-10-23/emaily-nahled/`: `index.html`, 18 transakčních šablon, 1 newsletterová kampaň, 5 stavů odhlášení a systémové screenshoty Google Chrome v šířkách 390 a 600 px (50 souborů včetně indexu).
