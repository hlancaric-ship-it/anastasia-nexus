# Nová správa zákazníkovi z administrácie

**Balík:** chat – správy zákazníkov (test s Luciou 22.–23. 10. 2026) · **Dátum:** 21. 10. 2026
**Rozsah:** `backend/src/api/admin/chat/conversations` (+ chat služba) a administrácia `anastasia-admin`.
**Stav:** `VERIFIED` – unit testy aj prehliadačový test sú zelené.

---

## 1. Prečo

Doteraz sa dala z administrácie iba **odpovedať** na existujúcu konverzáciu. Chýbalo
**napísať novú správu** – napríklad keď zákazník napíše cez e-mail, alebo keď treba
osloviť zákazníka, ktorý v účte ešte nikdy nepísal.

## 2. API

### `POST /admin/chat/conversations`

```json
{ "customer_id": "cus_…", "body": "Dobrý deň, …", "subject": "Objednávka #12 – doprava" }
```

- `body` – text správy (max. 5000 znakov), `subject` – voliteľný popis (téma konverzace, max. 120 znakov).
- Ak zákazník už má **otvorenú konverzáciu**, správa sa pridá do nej.
- Ak nemá, **založí sa nová** (predvolený popis „Správa z administrácie“).
- Zákazníkovi odíde **e-mail** – rovnaká šablona a notifikácia ako pri odpovedi
  (`chat-admin-reply`, udalosť `chat.admin_reply`).
- Odpoveď: `201 { "conversation_id": "chconv_…", "message": { … } }` – administrácia hneď otvorí konverzáciu.

### Validácia (texty pre administráciu sú slovenské)

| Situácia | Odpoveď |
|---|---|
| Bez prihlásenia | `401` |
| Prázdna správa | `400` – „Správa nemôže byť prázdna.“ |
| Príliš dlhá správa | `400` – „Správa je príliš dlhá (najviac 5000 znakov).“ |
| Neexistujúci zákazník | `404` – „Zákazník sa nenašiel.“ |
| Zablokovaný zákazník | `409` – „Zákazník má zablokovaný chat – novú správu mu nemožno poslať.“ |
| Neznáme pole v tele | `400` – „Neplatná data požadavku.“ |

### Audit

Každá nová správa sa zapíše do auditu (`ops_audit`): akcia `chat.conversation.start`,
entita `customer`, v zmenách `conversation_id` a `subject`.

## 3. Služba (`ChatModuleService.sendAdminMessage`)

- Zámok zákazníka (`pg_advisory_xact_lock`) – rovnako ako pri odpovedi, aby sa
  súbežné zápisy neprekrývali.
- Blokovanému zákazníkovi sa správa nepošle (`admin_message_blocked`, 409).
- Limity zákazníka (denný strop, správy po sobě) sa neuplatňujú – píše administrácia.
- Text sa normalizuje ako pri ostatných správach (NFC, bez riadiacich znakov, maximálne
  dve prázdne riadky po sebe).

## 4. Administrácia

- **Správy → Nová správa** (tlačidlo vpravo hore): vyhľadanie zákazníka podľa mena alebo
  e-mailu, text správy, voliteľne šablóna odpovede a téma. Po odoslaní sa otvorí konverzácia.
- **Zákazníci → zákazník → Napísať správu**: to isté, len s predvybraným zákazníkom.
- Nápoveda: návod „Ako odpovedať zákazníkovi v správach“ má nový blok
  „Nová správa zákazníkovi“, obrazovka Pomoc → Správy má nový bod.

## 5. Testy

```bash
# backend
cd backend
npx jest src/modules/chat/__tests__/service.unit.spec.ts src/api/admin/chat/__tests__/conversations-route.unit.spec.ts
npm run test:unit && npx tsc --noEmit

# administrácia (prehliadač)
cd anastasia-admin
ANASTASIA_API_ORIGIN=https://anastasia-test-api.l-code-dynamics.com node build.mjs
ADMIN_URL=http://127.0.0.1:4179 ADMIN_TEST_PASSWORD=… node test/browser-new-message.mjs
```

- Služba (6 nových testov): nová konverzácia, pridanie do otvorenej, uzavřená → nová,
  zablokovaný zákazník (409), prázdna správa (400), popis konverzace.
- Trasa (5 nových testov): 401, 404, 400, 409, 201 + e-mailová udalosť + audit.
- Prehliadač (9 kontrol): tlačidlo Nová správa, výber zákazníka, šablóna, odoslanie,
  otvorenie konverzácie a tlačidlo Napísať správu v detaile zákazníka.

## 6. Čo zostáva na integrátora

Nasadenie backendu (trasa `POST /admin/chat/conversations`) a administrácie. Po nasadení
backendu treba obnoviť aj administráciu (nový súbor `dist/`).
