# C-1 Transakční e-maily a texty z adminu

## Co odchází a kdy

| Šablona | Událost | `idempotency_key` | Poznámka |
|---|---|---|---|
| `order-placed-sk` | `order.placed` | `order.placed:<order_id>` | položky, doprava, sleva, celkem; text o platbě podle `paid` |
| `payment-captured-sk` | `payment.captured` | `order.paid:<order_id>` | jen když potvrzení objednávky odešlo s `paid: false` (převod, ruční capture). Platba kartou se zachytí před `order.placed`, tak druhý e-mail nevzniká. Pokud potvrzení objednávky ještě neodešlo, přeskočí se (`ORDER_EMAIL_PENDING`) – potvrzení pak už uvidí zaplaceno. |
| `order-shipped-sk` | `shipment.created` | `order.shipped:<fulfillment_id>` | respektuje `no_notification`; číslo a odkaz sledování z `fulfillment.labels` |
| `order-refunded-sk` | `payment.refunded` | `order.refunded:<refund_id>` | jeden e-mail na každý refund (i částečný) |
| `order-canceled-sk` | `order.canceled` | `order.canceled:<order_id>` | admin i storno zákaznicí (X3) – X3 vlastní e-mail neposílá |
| `customer-welcome-sk` | `customer.created` | `customer.welcome:<customer_id>` | jen `has_account`, založen < 1 h, bez `metadata.legacy_customer_migration` |
| `withdrawal-received-sk` | X1 (`sendEmail` z modulu legal) | `withdrawal.received:<withdrawal_id>` | data: `order_display_id`, `received_at` (ISO), `url`; `withdrawal_id`/`order_id` jen jako `resource_id` a klíč |
| `magic-link-sk`, `gift-voucher-*`, `booking-*`, `chat-*` | beze změny | | povinné šablony (přihlášení, poukazy) nejde vypnout |

Adresát je vždy ze serveru (e-mail objednávky / zákaznice). Subscribery nikdy nevyhodí; výsledek je v `ops_event`
(domain `notification`: `sent`, `skipped` + `skip_reason`, `send_failed`, `duplicate_suppressed`, `template_disabled`).

## Odeslání

Jediná cesta: `sendEmail(container, { to, template, data, idempotency_key?, resource_id?, resource_type?, attachments? })`
v `src/lib/email/send.ts`. Přidá uložené přepisy do `data.texts` (texty od volajícího se zahodí), vypnutou
nepovinnou šablonu nepošle, duplicitu podle `idempotency_key` potlačí. Chybu načtení přepisů ignoruje (výchozí texty),
chybu odeslání vyhodí volajícímu.

## Texty z adminu

Modul `email-template` (tabulka `email_template_override`: `template` unikátní, `texts` jsonb, `enabled`, `updated_by`).
Šablona = sloty (předmět, nadpis, odstavce, popisky tlačítek) s výchozím textem v kódu. Upravit jde jen text –
rozvržení, tabulka položek, kód poukazu a odkazy zůstávají v kódu. V textu smí být jen proměnné šablony (`{cislo_objednavky}`,
`{suma}`, `{meno}`…); proměnná bez hodnoty → odstavec se vynechá nebo se použije náhradní text. Vše se escapuje.

| Metoda | Cesta | Tělo |
|---|---|---|
| GET | `/admin/email-templates` | – seznam, `customized`, `enabled` |
| GET | `/admin/email-templates/:template` | – sloty s výchozí i aktuální hodnotou, proměnné |
| POST | `/admin/email-templates/:template` | `{ texts?: { slot: text \| null }, enabled?: boolean }` – `texts` nahradí všechny přepisy |
| DELETE | `/admin/email-templates/:template` | – výchozí texty, zapnuto |
| POST | `/admin/email-templates/:template/preview` | `{ texts? }` – náhled se syntetickými daty, nic se neukládá |

Validace: neznámý slot/proměnná, prázdný povinný text, nový řádek v jednořádkovém slotu, délka (160 / 1000) → 400.
Prázdný text u volitelného odstavce = odstavec vypnout. Změny jdou do auditu (`email_template.update` / `.reset`).

## Env

`ACCOUNT_URL`, `ACCOUNT_ORDERS_URL` (odkaz `…/<order_id>`), `ACCOUNT_BOOKINGS_URL`. Bez nich e-mail odejde bez tlačítka.

## Zbývá

- Testovací doručení magic linku na adresu Luckyho až po ověření domény v ZeptoMailu (po přepnutí NS).
- Admin UI pro úpravu textů (fáze UI) – API je připravené.
