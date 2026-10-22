# Platba kartou nesmie čakať na cookies (body 1–3 z `anastasia-admin/HANDOFF-stripe-cookies-fix.md`)

**Dátum:** 21. 10. 2026 (večer) · **Vetva:** `release/predani-faze1` (worktree `anastasia-nexus-release`) · **Nič nebolo pushnuté.**

## Zadanie

1. Stripe.js je nevyhnutný pre platbu (jeho cookies slúžia k prevencii podvodov) → patrí medzi
   nevyhnutné technológie, súhlas nepotrebuje. Načítať v pokladni vždy pri výbere platby kartou
   (nie skôr, nie na ostatných stránkách). Odstrániť hlášku „Pred platbou kartou dokončite nastavenia
   cookies“ a akékoľvek blokovanie platby kvôli cookies. Ak klientka radí Stripe inam, text časti E
   **nemeniť** – do `PRAVNE-TEXTY-DOPLNIT.md` pripísať poznámku „potvrdiť: Stripe ako nevyhnutný“.
2. E2E pokladne s platbou kartou v TEST režime bez kliknutia na cookies lištu musí prejsť.
   Spustiť len relevantné testy.
3. Napísať slovenský podklad pre klientku `anastasia-admin/EMAIL-Lucia-doplnenia.txt` (neodesielať).

## Čo je hotové

| # | Stav | Kde |
|---|---|---|
| 1 | **VERIFIED** | `storefront-prototype/public/app.mjs` – brána Stripe sa načíta v pokladni bez rozhodnutia o cookies; hláška aj blokovanie odstránené (pokladňa aj Klub) |
| 2 | **VERIFIED** | `storefront-prototype/test/browser-checkout-stripe.mjs` – e2e v prehliadači (TEST režim, bez kliknutia na lištu) + `test/cookie-consent.test.mjs` |
| 3 | **IMPLEMENTED_UNVERIFIED** | `anastasia-admin/EMAIL-Lucia-doplnenia.txt` – podklad pre klientku (ručne poslať; **neodoslaný**) |

## Kľúčové rozhodnutia (najnižšie riziko, najmenšia složitosť)

1. **Súhlas sa nevyžaduje, ale lišta zostáva.** Zmena je v jedinom bode: `loadStripeScript()` už
   nečaká na `requireDecision()`. Lišta cookies, panel nastavení, uloženie voľby aj texty z časti E
   zostávajú 1:1 s dokumentom klientky – nemení sa nič, čo klientka vidí.
2. **Načítanie ostáva v pokladni.** `loadStripeScript()` sa volá iba z `choosePayment()` (pokladňa)
   a z platby v Klube – teda vždy pri výbere platby kartou, nikdy pri načítaní stránky. Overené v
   prehliadači: na domovskej stránke je 0 externých requestov.
3. **Blokovanie odstránené na dvoch miestach** – pokladňa (`#payment-info`) a Klub (`#klub-result`).
   Oba hlášky boli totožné, takže oprava je symetrická a klient neuvidí ani jednu.
4. **Text časti E sa nemení.** Klientka v časti E neurčuje, kam patrí platobná brána (píše len
   „konkrétny bezpečnostný alebo platobný prvok treba posúdiť podľa jeho reálnej funkcie“). Preto je
   v `PRAVNE-TEXTY-DOPLNIT.md` nový bod **16** s poznámkou „potvrdiť: Stripe ako nevyhnutný“.
5. **Backend sa nemenil.** `guard` súhlasu v pokladni (`requireCheckoutConsent`) sa týka súhlasu s
   obchodnými podmienkami a GDPR, nie cookies; platbu neblokuje. Zmena je len na strane storefrontu.
6. **E2E beží bez kľúčov a bez siete.** Test používa syntetický kľúč `pk_test_`, test client secret
   a zásahnutý Stripe.js (route interception) – žiadny platobný účet, žiadna reálna platba, žiadne
   produkčné volanie. API pokladne je lokálny stub so syntetickými údajmi.

## Súbory

| Súbor | Zmena |
|---|---|
| `storefront-prototype/public/app.mjs` | `loadStripeScript()` bez `await requireDecision()`; odstránené hlášky „Pred platbou kartou dokončite nastavenia cookies“ (pokladňa + Klub); import `requireDecision`/`hasConsentDecision` odstránený |
| `storefront-prototype/public/consent.mjs` | upravený iba komentár hlavičky (Stripe = nevyhnutná technológia) – kód sa nemenil |
| `storefront-prototype/test/cookie-consent.test.mjs` | test „platobná brána je nevyhnutná technológia…“ nahradí test „pred súhlasom sa nenačíta skript tretej strany“ |
| `storefront-prototype/test/browser-checkout-stripe.mjs` | **nový** – e2e pokladne s platbou kartou v TEST režime bez kliknutia na lištu cookies |
| `anastasia-admin/PRAVNE-TEXTY-DOPLNIT.md` | nový bod 16 („potvrdiť: Stripe ako nevyhnutný“) + záznam o zmene v stave dokumentu |
| `anastasia-admin/EMAIL-Lucia-doplnenia.txt` | **nový** – podklad pre klientku (neodoslaný) |
| `anastasia-admin/COOKIES-ODSTUPENIE-HOTOVO.md` | opravené znenie o načítaní Stripe a o otvorených bodoch |
| `backend/docs/wp/cookies-odstupenie.md` | opravené rozhodnutie č. 5, riziko a „ďalší krok“ (obsahoval neplatné tvrdenie o blokácii platby) |
| `backend/docs/wp/stripe-cookies-fix.md` | **nový** – tento balík dokumentácie |

## Ako to funguje

`initCookieConsent()` beží pri načítaní stránky a zobrazí lištu, ak zákazník ešte nerozhodol.
Voliteľné kategórie (analytické, marketingové) sa bez súhlasu nenačítajú. Keď zákazník v pokladni
zvolí platbu kartou, `choosePayment()` zavolá `api.selectCheckout()` (server pripraví `client_secret`)
a `loadStripeScript()` načíta `https://js.stripe.com/v3`. **Krok nečaká na súhlas s cookies** –
`Payment Element` sa zobrazí aj vtedy, keď zákazník lištu nikdy nevyriešil. Po potvrdení platby
prejde `api.checkout()` na server. Súhlas s cookies teda platbu nebrzdí, len umožňuje načítať
voliteľné skripty, ktoré na webe momentálne nie sú.

## Overenie

```
cd backend && npx tsc --noEmit                                                     # PASS (bez výstupu)
cd backend && npm run test:unit                                                    # PASS 139 sád / 1424 testov
cd storefront-prototype && ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs             # 69 stránok OK
cd storefront-prototype && node --test test/cookie-consent.test.mjs \
  test/checkout.test.mjs test/contract-withdrawal.test.mjs test/navigation.test.mjs \
  test/mock.test.mjs test/http-adapter.test.mjs test/purchase-submit.test.mjs \
  test/membership.test.mjs                                                        # PASS 80/80
cd storefront-prototype && node test/browser-checkout-stripe.mjs                  # PASS (5 kontrolí)
```

E2E (`browser-checkout-stripe.mjs`) overuje v prehliadači (Playwright, lokálny náhľad `dist/`,
lokálna stub API, zásahnutý Stripe.js):

- na domovskej stránke sa Stripe **nenačíta** (0 externých requestov) a lišta cookies je otvorená;
- v pokladni sa pri výbere platby kartou načíta Payment Element **bez jediného kliknutia na lištu**;
- v `localStorage` nie je uložené žiadne rozhodnutie o cookies (`anastasia.consent` = `null`) –
  platba prejde aj bez neho;
- na stránke nie je hláška „Pred platbou kartou dokončite nastavenia cookies“;
- objednávka sa vytvorí (karta potvrdená raz, objednávka dokončená), bez chýb v konzole.

**Regresná poistka:** test bol overený proti pôvodnému správaniu (umelá vratka `await requireDecision()`
a umelá hláška v `dist/app.mjs`) – v oboch prípadoch test zlyhá, teda pôvodný blok sa naozaj zachytí.

## Riziká

- **Reálny Stripe test kľúč v tomto teste nebeží.** E2E používa syntetický `pk_test_` kľúč a
  zásahnutý Stripe.js – overuje tok pokladne, nie správanie Stripe SDK. Pri nasadení treba raz
  spustiť platbu kartou s testovacím kľúčom (bez poplatku) a potvrdiť, že Payment Element a
  Apple/Google Pay fungujú.
- **E2E potrebuje lokálny prehliadač a lokálny náhľad** (`dist/`): po každej zmene `public/app.mjs`
  treba prebuildovať (`ANASTASIA_OFFLINE_FIXTURES=1 node build.mjs`), inak test beží proti starej
  verzii. Test je samostatný skript (nie v `node --test`), spúšťa sa ručne.
- **Zaradenie Stripe medzi nevyhnutné technológie ešte nie je potvrdené klientkou** (bod 16).
  Kým potvrdenie nepríde, text časti E o nevyhnutných technológiách Stripe nemení.
- **Súhlas s cookies nie je na webe vyžiadaný** – lišta je informačná pre voliteľné kategórie.
  Ak klientka pridá analytiku, načítanie musí zostať viazané na `onConsent('analytics', …)`,
  nie na `loadStripeScript()`.
- **`requireDecision()` ostáva exportovaný** v `public/consent.mjs` (verejné API
  `globalThis.anastasiaConsent`) pre budúce voliteľné skripty; v pokladni sa už nepoužíva.

## Ďalší krok

1. Poslať `anastasia-admin/EMAIL-Lucia-doplnenia.txt` klientke (ručne, z vlastného mailu).
2. Po potvrdení bodu 16 zo strany klientky zvážiť doplnenie odseku o nevyhnutných technológiách
   na stránke `/cookies` (text meniť až po potvrdení, potom v `legacy-content.json` a v seede).
3. Pri nasadení raz overiť platbu kartou s reálnym testovacím kľúčom Stripe.
