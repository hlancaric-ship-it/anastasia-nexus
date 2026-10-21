# Chat zákazník ↔ Lucia (C5)

Obousměrná komunikace vázaná na konkrétní zákazníci, volitelně i na objednávku nebo rezervaci. Všechna pravidla vynucuje server. Storefront jen zobrazuje stav z `GET /store/chat/status`.

## Pravidla

| Pravidlo | Hodnota | Kde se vynucuje |
|---|---|---|
| Kdo smí psát | přihlášená zákazník s aspoň 1 objednávkou (mimo `draft`/`canceled`), rezervací (`confirmed`/`completed`, nebo `held` s objednávkou) nebo aktivním entitlementem | `modules/chat/eligibility.ts`, kontrola při každém odeslání (fail-closed: chyba zdroje = nesmí) |
| Zprávy po sobě | max 3 bez Luciiny odpovědi, počítá se **per zákazník napříč konverzacemi** | `ChatModuleService.sendCustomerMessage` pod zámkem |
| Denní strop | 5 zpráv od lokální půlnoci `Europe/Bratislava` | totéž |
| Délka | zákazník 2000 znaků, Lucia 5000, předmět 120 (počítá se ve znacích, emoji = 1) | `policy.normalizeMessageBody` |
| Obsah | jen text. Pole navíc (např. `attachments`) → 400. Řídicí a bidi znaky se odstraní. HTML a odkazy se ukládají jako text a všude se vykreslují escapovaně, bez linkify | zod `.strict()`, `policy.ts`, admin stránka (React text) |
| Vazba na objednávku/rezervaci | jen vlastní (cizí = 404) | `eligibility.customerOwnsOrder/Booking` v route |

Chybové kódy (`type` v JSON) jsou stabilní pro storefront:

| Kód | HTTP |
|---|---|
| `chat_not_eligible`, `chat_blocked` | 403 |
| `conversation_closed` | 409 |
| `chat_consecutive_limit`, `chat_daily_limit` | 429 |
| `message_empty`, `message_too_long`, `invalid_message`, `invalid_subject` | 400 |
| `busy` (vypršel zámek) | 503 |

## Atomicita

Každé odeslání běží v jedné transakci pod `pg_advisory_xact_lock(hashtext('chat:customer:<id>'))` s `lock_timeout = 5s`. Pod zámkem se ověří blokace, stav konverzace (`FOR UPDATE`) a počty zpráv. Teprve potom se zpráva zapíše. Luciina odpověď a blokace berou stejný zámek. Souběžné požadavky tak nemohou přečíst stejné počty a limit obejít. Zámek je per zákazník, takže jiné zákazník neblokuje.

## Admin akce (všechny vratné)

- **Uzavřít / Znovu otevřít:** do uzavřené konverzace zákazník nepíše (409), může ale založit novou.
- **Ztlumit / Zrušit ztlumení:** Lucii nechodí souhrnná upozornění a konverzace se nepřipíná nahoru jako nepřečtená. Zákazník dál píše v rámci limitů. *(Interpretace zadání.)*
- **Zablokovat / Odblokovat zákazníci:** platí pro celý chat zákazník (tabulka `chat_customer_block`, jeden řádek na zákazníci). Ukládá se kdo a kdy.

## Události a e-maily

- `chat.customer_message` → subscriber `chat-customer-message.ts` → `claimAdminDigest`. Souhrn odejde Lucii nejvýš 1× za hodinu, jen když přibyly nepřečtené zprávy v neztlumených otevřených konverzacích. Claim je pod zámkem v DB, takže je bezpečný i pro více instancí. Zprávy, které přijdou během hodinové pauzy, dobírá job `chat-admin-digest` (každých 10 min).
- `chat.admin_reply` → subscriber `chat-admin-reply.ts`. E-mail zákazníci „Lucia vám odpověděla“ odejde jen tehdy, když si předchozí upozornění už přečetla (`customer_notified_at` ≤ `customer_last_read_at`).
- E-maily **neobsahují text zpráv**, jen počty a odkaz.
- Doručení jde přes `ChatNotifier` (`modules/chat/notifier.ts`) a modul Notification (šablony `chat-admin-digest`, `chat-admin-reply`). Lokálně je provider `notification-local` (log). Skutečný e-mailový provider se nevymýšlí, řeší ho DEPLOY.
- Env:
  - `CHAT_ADMIN_NOTIFY_EMAIL`: adresa Lucie. Bez ní se souhrn jen zaloguje, bez osobních údajů.
  - `CHAT_ADMIN_URL`: odkaz v souhrnu, výchozí `BACKEND_PUBLIC_URL/app/chat`.
  - `CHAT_STOREFRONT_URL`: základ odkazu pro zákazníci, k němu se připojí `/<conversation_id>`.

## API

Store (auth `customer`, session nebo bearer, tělo max 16 kB):
- `GET /store/chat/status` vrací `{eligible, blocked, can_write, reason, remaining{today,in_row,now}, resets_at, limits}`
- `GET /store/chat/conversations` a `POST /store/chat/conversations` `{body, subject?, order_id? | booking_id?}` → 201
- `GET /store/chat/conversations/:id` (cizí = 404), `POST …/:id/messages` `{body}`, `POST …/:id/read`

Admin (auth `user`):
- `GET /admin/chat/conversations?status=open|closed|all&limit&offset`: nepřečtené a neztlumené nahoře, s počtem `unread`
- `GET /admin/chat/conversations/:id` (zprávy, zákazník, stav blokace), `POST …/:id` `{action: close|reopen|mute|unmute}`
- `POST …/:id/messages` `{body}`, `POST …/:id/read`
- `POST /admin/chat/customers/:id/block` `{blocked, reason?}`

Zprávy navenek: `{id, author: "customer"|"lucia", body, created_at}`, bez interních ID správce.

Admin stránka „Zprávy“ (`src/admin/routes/chat/page.tsx`):
- seznam s filtrem a detail konverzace,
- odpověď s počítadlem znaků,
- akce uzavřít, ztlumit a zablokovat,
- obnova každých 30 s.

## Data

Modul `chat` (`src/modules/chat`), migrace `Migration20261014002633` vygenerovaná přes `medusa db:generate chat`. Tabulky:
- `chat_conversation`
- `chat_message` (denormalizované `customer_id` kvůli limitům, index `(customer_id, author_type, created_at)`)
- `chat_customer_block`
- `chat_notification_state`

## Ověření

- Unit (`src/modules/chat/__tests__`):
  - politika: normalizace, pořadí pravidel, hranice dne včetně přechodu na zimní čas, digest, řazení;
  - služba se skutečným mutexem: 6 souběžných → limit drží napříč konverzacemi, zámek je per zákazník;
  - kontrolní běh bez zámku limit prolomí, takže test je na chybějící zámek citlivý.
- HTTP (`integration-tests/http/chat-http-checks.ts`, spouští `verify-safeorder-local.py --booking-only`):
  - 401 pro anonymní přístup a zákazníci na admin API;
  - nezpůsobilá zákazník 403;
  - přílohy 400, cizí objednávka 404;
  - **5 souběžných nových konverzací → 3×201 a 2×429**;
  - cizí konverzace 404;
  - odpověď Lucie, pak 2×201 a 1×429 `chat_daily_limit`;
  - uzavřít → 409, zablokovat → 403, odblokovat → 201.

## Otevřené body

- Storefront UI (`/ucet`) chat zatím nemá. Stačí mu volat výše uvedené API.
- Šablony e-mailů `chat-admin-digest` a `chat-admin-reply` se musí doplnit v produkčním e-mailovém provideru.
- Limit „po sobě“ je per zákazník. Pokud Lucia konverzaci uzavře bez odpovědi, zákazník nenapíše ani do nové konverzace, dokud Lucia neodpoví jinde. *(Interpretace, ověřit s Lucky.)*
- Uchovávání a mazání historie chatu (GDPR) zatím není řešeno.
