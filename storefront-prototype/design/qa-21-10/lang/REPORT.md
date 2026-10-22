# QA jazykových verzí EN/RU (21. 10. 2026)

Overené na živom `https://anastasia-test.l-code-dynamics.com` (prepník SK/EN/RU vľavo hore, voľba
sa ukladá) na 8 stránkach (`/`, `/eshop`, `/klub`, `/kontakt`, `/o-lucii`, `/konzultacie`, košík,
prihlásenie) pri 390 px aj 1440 px. Kontrola: vodorovné pretečenie dokumentu, pretečenie textu
z tlačidiel/štítkov, prekrývanie prvkov a slová rozdelené cez okraj.

## Verdikt

**Žiadna chyba špecifická pre EN/RU.** Ani jedna z meraných stránok nemala v EN ani RU
vodorovné pretečenie dokumentu (`scrollWidth > clientWidth` je vždy `false`), text nepreteká
z tlačidiel ani štítkov a žiadne slovo sa nerozdelí cez okraj.

Nálezy, ktoré sa zobrazili v oboch jazykoch rovnako, sú zámerné a neboli zmenené:

| Prvok | Čo je to | Verdikt |
|---|---|---|
| `div.lh-intro__stage`, `div.lh-sky__stage` | parallax scény s maskou | zámerné (text sa neorezuje) |
| `section#lh-reset.lh-reset` | vodorovný bežiaci pás tém | zámerné (posúva sa pri scrolle) |
| `div.lh-lucia` | zaoblená fotografia | zámerné |
| `article.lh-card--light/--dark` | dekoratívny prepľav karty | zámerné (text v karte sa neorezuje) |
| `section` na `/o-lucii` | sekcia s obrázkom | zámerné |
| `a.product-image` | odkaz na fotografiu produktu | zámerné |
| `span.media-label`, `label.contact-trap` | text pre čítačky obrazovky / pasca proti robotom | zámerné |
| `button.cookie-btn` × obsah | fixná lišta cookies | zámerné (prekryva obsah, schová sa výberom) |
| „ObchodObchod“, „Menu Menu“ | zdvojený text v hlavičke | markup dizajnu (rovnaké v SK) – mimo jazykového rozsahu |

## Screenshoty

`design/qa-21-10/lang/` – 32 snímok (8 stránok × EN/RU × 390 a 1440 px).

## Zmeny

Žiadne zmeny v CSS/HTML – namerané chyby sa nezistili, takže vzhľad SK ostal nedotknutý.
