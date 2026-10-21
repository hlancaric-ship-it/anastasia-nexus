# Úloha: příprava backendu (release/predani-faze1) na nasazení na TEST

Cíl: aby šel backend s novými právními texty, cookie lištou a online formulářem na odstúpenie nasadit na test (anastasia-test-api.l-code-dynamics.com) bez chyb.

Udělej:
1. `npx tsc --noEmit` (backend) a existující testy (unit + integration, co jde lokálně). Oprav jen chyby, které způsobily commity 95c6df3, 066df73, 8966bc2, b76f615 a Stripe fix.
2. Zkontroluj nové migrace (odstúpenie, cookies/consent, legal seed): idempotence, žádný DROP existujících dat, rollback (`down`). Ověř na lokální/dočasné DB, NE na produkci ani testu.
3. Ověř seed právních textů: znovu spuštěný seed nesmí přepsat texty, které Lucia upraví v adminu.
4. Sepiš `anastasia-admin/DEPLOY-TEST-backend.md`: přesné kroky (migrate, env proměnné – jen NÁZVY, nikdy hodnoty: EMAIL_RECIPIENT_ALLOWLIST, CONTACT_NOTIFY_EMAIL…), kontrolní curl na nové endpointy, jak vrátit zpět.
5. Storefront v release větvi: ověř, že build projde a cookie lišta + /odstupenie formulář fungují proti lokálnímu backendu (screenshot 390 px a 1440 px do anastasia-admin/qa-deploy/).

Zakázáno: nasazovat, `git push`, `git checkout/reset/stash/clean`, číst .env / *.pem / db-pristup.txt, posílat e-maily mimo @l-code-dynamics.com, Stripe jen pk_test.
Commituj jen své soubory. Na konci krátké shrnutí: co opraveno, co blokuje nasazení.
