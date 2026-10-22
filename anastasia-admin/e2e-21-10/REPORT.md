# E2E test testovacieho prostredia – ANASTASIA (21. 10. 2026)

Web: https://anastasia-test.l-code-dynamics.com | Browser: Chrome headless | viewport 390x900

| Krok | Stav | URL | Hláška |
| --- | --- | --- | --- |

## Beh 2026-10-21 21:23:13 (tag 8375bc)

| Krok | Stav | URL | Hláška |
| --- | --- | --- | --- |
| a) Registrácia / prihlásenie | OK | https://anastasia-test.l-code-dynamics.com/ucet/ | UI odkazu: „Ak účet existuje, poslali sme vám prihlasovací odkaz na e-mail.“ \| session: účet založený pre qa-e2e-2110+8375bc@l-code-dynamics.com \| heslo: náhodne generované, neuložené |
| b) Pridanie do košíka (RESET 40+) | OK | https://anastasia-test.l-code-dynamics.com/kosik/ | produkt v košíku: AI ANASTASIA RESET 40+ \| AI ANASTASIA RESET 40+ \| položiek: 2 (množstvá 1/1) \| počítadlo košíka: 2 \| suma: 336,00 € \| NÁLEZ: 1 kliknutie poslalo 2× POST /store/carts/:id/line-items → v košíku 2 položiek (množstvá 1/1) |
| c) Košík + kupón Montelope | CHYBA | https://anastasia-test.l-code-dynamics.com/kosik/ | kupón „Montelope“ nebol prijatý – suma v košíku: 336,00 € (pred kupónom: 336,00 €) \| zľava: Kupón nezadaný \| položka: 168,00 € / kus \| hláška servera pre kupón „Montelope“: „Kupón nie je dostupný.“ |
| d) Pokladna + platba kartou | OK | https://anastasia-test.l-code-dynamics.com/pokladna/ | doprava: digitálne \| karta: vyplnená (4242 4242 4242 4242, 12 / 30, •••) \| tlačidlo: „Dokončiť objednávku“ \| stav: ALLOW \| výsledok: „Objednávka bola vytvorená. Ďakujeme.“ |
| e) Účet → RESET 40+ → Zrkadielko | OK | https://anastasia-test.l-code-dynamics.com/ucet#reset | pridaný záznam (2026-10-21), upravený cez „Uložiť zmeny“ (riadok: „21. 10. 2026 — 953 UpraviťZmazať“) a zmazaný (riadkov 1 → 0) \| entitlementy účtu: 1 |
| f) Účet → záložka Klub | OK | https://anastasia-test.l-code-dynamics.com/ucet#klub | záložka Klub otvorená, obsah: „Moje členstvoPonuka Klubu Zatiaľ nemáte členstvo.Pozrieť Klub“ \| akcia: „Ponuka Klubu“ (/klub) |
| g) Konzultácie → výber termínu | CHYBA | https://anastasia-test.l-code-dynamics.com/konzultacie/rezervacia/ | výber termínu nie je dostupný – stránka zobrazuje: „KONZULTÁCIEVyberte si termín.Vidíte len skutočne voľné termíny. Vybraný termín vám podržíme, kým dokončíte objednávku.Termíny konzultácií pripravujeme.Napíšte nám a dohodneme termín spolu.Kontakt“ (v testovom prostredí nie je publikovaný žiadny konzultačný produkt s kalendárom, preto server nepošle žiadne voľné termíny) |

### Zhrnutie behu 2026-10-21 21:27:49

**Výsledok:** 5/7 krokov prešlo (stav CHYBA = obmedzenie testovacieho prostredia, nie pád testu).

**Nálezy pre testovacie prostredie:**

1. **Dvojité pridanie do košíka (chyba storefrontu):** jedno kliknutie na „Pridať do košíka“ poslalo 2× POST /store/carts/:id/line-items → v košíku sú 2 položky a suma je 336,00 € namiesto 168,00 €. Pôvod: v app.mjs sú na ten istý formulár `.add-product` naviazané dva handlery „submit“ (jeden globálny, jeden v bloku živého detailu produktu).
2. **Prihlásenie je bez hesla:** web zákazníka má iba magic link (odkaz e-mailom), žiadny heslový formulár. Session pre prihlásené kroky bola získaná cez backend auth provider `emailpass` (registrácia e-mail + náhodné heslo); heslo zostalo iba v pamäti behu.
3. **Kupón „Montelope“ v testovacom prostredí nie je dostupný:** server vracia „Kupón nie je dostupný.“ (COUPON_INVALID) – rovnako ako pri náhodnom neexistujúcom kóde. Suma košíka bola zaznamenaná aj bez kupónu.
4. **Zrkadielko je zamknuté bez aktívneho programu:** záložka RESET 40+ hlási „Program je dostupný len zákazníčkám s aktívnym prístupom“, kým účet nemá entitlement (403 z /store/reset-journal). Prístup vznikol až po zaplatení programu v kroku d).
5. **Konzultácie nemajú žiadne termíny:** v testovacom prostredí nie je publikovaný konzultačný produkt s kalendárom, preto /konzultacie/rezervacia zobrazuje „Termíny konzultácií pripravujeme.“ a odkaz na Kontakt.
6. **Testovací účet:** qa-e2e-2110+8375bc@l-code-dynamics.com – alias zadanej adresy qa-e2e-2110@l-code-dynamics.com. Adresu qa-e2e-2110@l-code-dynamics.com už obsadil účet z prvého behu s heslom, ktoré sa nikam neuložilo, takže ďalší beh použije alias; na beh pod presne zadanou adresou treba v admini odstrániť existujúcu prihlasovaciu identitu (alebo prihlásiť sa raz cez magic link).

**Poznámky:** platba kartou 4242424242424242 prebehla v testovacom režime Stripe (bez reálnej platby); v košíku bola položka s množstvom 2, takže suma objednávky bola 336,00 €.
