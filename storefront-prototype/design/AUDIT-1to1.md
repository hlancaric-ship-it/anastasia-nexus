# Audit 1:1 – starý web anastasiaoz.eu ↔ nový storefront (21. 10. 2026)

Surová data: /Users/lucky/.claude/jobs/8ebf6c40/tmp/audit/ (old.json, new.json, medusa.json, content-cmp-16.json, redir-check.txt).
Starý web je jen SK (EN/RU tam neexistují).

## STOREFRONT – úkoly pro MiniMax (po designových opravách 1–7)

P0
1. Filtry e-shopu vracejí 0 produktů: `?category=…`, `?filter=novinky|bestsellery`, `/eshop/kategoria/<x>/` (např. bio-kozmetika-bez-chemie). Karty nesou staré názvy kategorií z Medusa (handle: sebarozvoj, bio-kozmetika-bez-chemie, zdrave-doplnky-vyzivy, konzultacie-pomoc-podpora), filtr hledá nové → mapovat přes handle.
2. Karta MINERAL PROTECT odkazuje na `/eshop/produkt/mineralny-…` → 404; platná je URL s velkým `M` (`Mineralny-…`). Odkazy brát z handle 1:1 + 301 z lowercase.
3. Přesměrování 301 (v `_redirects`) pro 10 starých URL kategorií a pro staré aktivní 301: /domov-socialnych-sluzieb → /denny-stacionar-vysna-slana; /receptury, /zlata-brana → /ai-anastasia; /konzultacie/zlata-brana → /konzultacie/online-zdravotna-konzultacia; /lekaren-anastasia → /zdrava-lekaren; /ai-anastasia/pharmanews → /ai-anastasia/pharmanews-novinky-zo-sveta-farmacie-zdravia-mediciny; /moj-ucet/moje-elektronicke-produkty/* → účet/knihovna. Přesný seznam v redir-check.txt.
4. /ai-anastasia: odstranit interní text „Asistent sa pripravuje vo fáze 2. V tejto ukážke ešte nie je dostupný.“ – nechat jako starý web („Pripravuje sa...“).
P1
5. Štítek NOVINKA (metadata.is_new) na kartách + funkční filtr Novinky: VVV.001, EP.001, L005, L004, K05, NR.01.
6. Řazení produktů podle starého webu (metadata legacy_rank): Výuka, Pleťový krém, Pleťová voda, Chrípkový, Nič nemusíš, Sprcháč, Jančova, Online konz., Osviežujúca voda, PZP, Mineral, RESET, Supervízia, Astro.
7. Detail produktu: zobrazit KÓD (SKU); dostupnost text „Skladom“ jako starý web; galerie všech fotek z `images`.
8. „Nič nemusíš“: chybí odkaz na ukázku „AUDIO 0“ (starý: /media/vv2nhaeb/a0_nic-nemusis.mp3) – přidat přehrávač ukázky.
9. Menu jako starý web: vrátit AI ANASTASIA (Pharmanews, Recenzie farmaceutických produktov, Recenzie zákazníkov) a ACADEMY; Recenzie zákazníkov nikde nejsou prolinkované.
10. Denný stacionár: chybí foto vonkajší-vchod.jpg; DS DNES: 6 fotek img_1–5.jpg, propagacia.jpg (Claude je dodá do public/media).
11. /zdravy-svet: H1 má být „Zdravý svet“ (ne „Vitajte.“), „Ligth for your Future.“ ponechat jako zdroj? → ponech text zdroje 1:1, jen H1 vrátit.
12. Chybí stránka /nova-registracia/vyhody (výhody registrácie) – text v old.json.
P2
13. Patička: telefon + e-mail textem (jako starý web), odkaz Cookies; cookie lišta jen pokud web používá ne-nezbytné cookies.
14. Newsletter formulář je `method=get action=/` – napojit na backend, nebo skrýt.
15. Darčekový poukaz v menu je nefunkční („momentálne nie sú dostupné“) – skrýt, dokud se nezapne.
16. EN/RU přepínač skrýt do schválení překladů (starý web je jen SK).
17. Kontaktní formulář: přidat pole Telefón.
18. Drafty: jednotně 404 (teď některé vrací 200 s výpisem e-shopu).

## DATA / BACKEND – dělá Claude
- Kategorie: 3× „Podkategória 1“ smazat; VETERINA, Rituálna práca, Konzultácie → inactive (na starém webu skryté).
- Supervízia a Astro přidat i do ACADEMY.
- 10 chybějících fotek galerií u 6 produktů nahrát do Medusa.
- Doprava/platby: chybí osobní odběr (0 €), doprava zdarma nad 60 €, dobírka (+2 €), převod na účet, region CZ – VOP čl. IV je slibují → rozhodnutí Lucky/Lucia.
- 3 legacy kupóny – po podpisu zpracovatelské smlouvy.

## Dodané soubory (Claude)
- Fotky Denného stacionára: public/media/ds/vonkajsi-vchod.jpg (DS), img_1–5.jpg + propagacia.jpg (DS DNES), pořadí podle starého webu.
- Ukázka audia Nič nemusíš: public/media/a0_nic-nemusis.mp3.
- Galerie produktů doplněné v Medusa (images): Pleťová voda 2, Online konz. 4, PZP 3, Mineral 3, Chrípkový 3, Pleťový krém 2.
- Kategorie v Medusa uklizené (aktivní jen ACADEMY 7, BIOKOZMETIKA 5, Zdravé doplnky 2).
