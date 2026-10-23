# E-maily ANASTASIA – pastelový layout

Stav: `PARTIAL`.

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

Náhledy vytvořené 2026-10-23 v `~/Desktop/ANASTASIA-K-ODESLANI/2026-10-23/emaily-nahled/`: `index.html`, 18 HTML souborů a screenshoty šířky 390/600 px vytvořené systémovým Google Chrome.
