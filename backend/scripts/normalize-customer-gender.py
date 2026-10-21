#!/usr/bin/env python3
"""Zjednotenie rodového tvaru v textoch: zákazník / zákazníci / zákazníkov (Luckyho pokyn 21. 10. 2026).

Najprv sa preložia všetky tvary (aj správne skloňovacie pády), potom sa opravia miesta,
kde pôvodný tvar „zákazníčky“ stál za genitív jedného človeka (musí byť „zákazníka“),
a doplňujú sa zámeny rodových zástupcov (jej → jeho) a sloves (nemohla → nemohol).
"""
import sys
from pathlib import Path

NAIVE = [
    ("zákazníčkami", "zákazníkmi"),
    ("Zákazníčkami", "Zákazníkmi"),
    ("zákazníčiek", "zákazníkov"),
    ("Zákazníčiek", "Zákazníkov"),
    ("zákazníčkou", "zákazníkom"),
    ("Zákazníčkou", "Zákazníkom"),
    ("zákazníčka", "zákazník"),
    ("Zákazníčka", "Zákazník"),
    ("zákazníčky", "zákazníci"),
    ("Zákazníčky", "Zákazníci"),
    ("zákazníčke", "zákazníkovi"),
    ("Zákazníčke", "Zákazníkovi"),
    ("zákazníčku", "zákazníka"),
    ("Zákazníčku", "Zákazníka"),
    ("zákazníčkach", "zákazníkoch"),
    ("Zákazníčkach", "Zákazníkoch"),
    ("zákazníčk", "zákazník"),
    ("Zákazníčk", "Zákazník"),
]

# Opravy po naivnom preložení: (pred, po) – presné úseky v texte.
FIXES = {
    "anastasia-admin/guide.mjs": [
        ("s menom zákazníci", "s menom zákazníka"),
        ("k balíku u zákazníci", "k balíku u zákazníka"),
        ("pre ostatné zákazníci", "pre ostatných zákazníkov"),
        ("Údaje zákazníci, skupiny", "Údaje zákazníka, skupiny"),
        ("E-mail zákazníci sa v administrácii nemení, je to jej prihlasovací údaj",
         "E-mail zákazníka sa v administrácii nemení, je to jeho prihlasovací údaj"),
        ("Zablokovať chat zákazníci:", "Zablokovať chat zákazníka:"),
        ("Pri otázke zákazníci rýchlo zistíte, koľko jej na poukaze ostáva a kde ho použila. V prípade problému poukaz zneplatníte alebo jej peniaze vrátite späť na poukaz.",
         "Pri otázke zákazníka rýchlo zistíte, koľko mu na poukaze ostáva a kde ho použil. V prípade problému poukaz zneplatníte alebo mu peniaze vrátite späť na poukaz."),
        ("Web pre zákazníci sa tým nemení", "Web pre zákazníkov sa tým nemení"),
        ("Neaktívnu kategóriu zákazníci v ponuke nevidia", "Neaktívnu kategóriu zákazníka v ponuke nevidia"),
        ("Ako nájsť zákazníka a skontrolovať jej prístupy", "Ako nájsť zákazníka a skontrolovať jeho prístupy"),
        ("Kliknite na zákazníka a upravte jej údaje", "Kliknite na zákazníka a upravte jeho údaje"),
        ("ktorý by zákazník nemohla kúpiť", "ktorý by zákazník nemohol kúpiť"),
        ("Keď zákazník niečo vráti alebo nastane chyba, vrátite jej peniaze priamo z",
         "Keď zákazník niečo vráti alebo nastane chyba, vrátite mu peniaze priamo z"),
        ("dostane zákazník e-mail o prijatí platby, ak jej potvrdenie", "dostane zákazník e-mail o prijatí platby, ak jeho potvrdenie"),
        ("Ak zákazník nákup zruší alebo objednávku nemôžete splniť, zrušením ju uzavriete",
         "Ak zákazník nákup zruší alebo objednávku nemôžete splniť, zrušením ho uzavriete"),
    ],
    "anastasia-admin/app.mjs": [
        ("<h2>Zákazníci</h2>", "<h2>Zákazníci</h2>"),
        ('aria-label="Označiť zákazníka"', 'aria-label="Označiť zákazníka"'),
        ("Chat zákazníka je zablokovaný", "Chat zákazníka je zablokovaný"),
        ("aby zákazníci dostávali zľavu", "aby zákazníci dostávali zľavu"),
        ("celkovej útraty zákazníka. Ak jej úroveň nastavíte", "celkovej útraty zákazníka. Ak jeho úroveň nastavíte"),
    ],
    "anastasia-admin/library-editor.mjs": [
        ("Nahrajte súbory pre zákazníci", "Nahrajte súbory pre zákazníkov"),
        ("sa zobrazujú zákazníkom s prístupom", "sa zobrazujú zákazníkom s prístupom"),
        ("Verejné fotografie vyššie nenahrádzajú obsah pre zákazníci", "Verejné fotografie vyššie nenahrádzajú obsah pre zákazníkov"),
    ],
    "anastasia-admin/NAVOD-pre-Luciu.md": [
        ("ktoré zákazník nezaplatila", "ktoré zákazník nezaplatil"),
        ("e-mail zákazníka", "e-mail zákazníka"),
        ("– zákazník, stav platby", "– zákazník, stav platby"),
        ("čo zákazník kúpila", "čo zákazník kúpil"),
        ("keď potvrdíte, zákazník dostane e-mail", "keď potvrdíte, zákazník dostane e-mail"),
        ("sprístupní až potom", "sprístupní až potom"),
        ("ich zákazník vidí", "ich zákazník vidí"),
        ("zákazník dostane po zaplatení. Súbory sa chránia: zákazník si ich môže prehrať",
         "zákazník dostane po zaplatení. Súbory sa chránia: zákazník si ich môže prehrať"),
        ("odchádzajú zákazníkom", "odchádzajú zákazníkom"),
        ("čo zákazník dostane", "čo zákazník dostane"),
        ("ktorý uvidí zákazník", "ktorý uvidí zákazník"),
        ("útrat zákazníka úroveň získa", "útrat zákazníka úroveň získa"),
        ("Úroveň zákazníka sa priradí automaticky podľa jej", "Úroveň zákazníka sa priradí automaticky podľa jeho"),
        ("celkovej útraty; ak jej úroveň nastavíte ručne (v detaile zákazníka, záložka",
         "celkovej útraty; ak jeho úroveň nastavíte ručne (v detaile zákazníka, záložka"),
        ("## 9. Zákazníci", "## 9. Zákazníci"),
        ("**Zákazníci**: hľadajte", "**Zákazníci**: hľadajte"),
        ("V detaile zákazníka nájdete", "V detaile zákazníka nájdete"),
        ("ID zákazníka", "ID zákazníka"),
        ("skupiny, do ktorých zákazník patrí", "skupiny, do ktorých zákazník patrí"),
        ("ak zákazník požiadala o výmaz", "ak zákazník požiadala o výmaz"),
        ("digitálne súbory zákazníkom", "digitálne súbory zákazníkom"),
    ],
    "anastasia-admin/README.md": [
        ("- **Zákazníci** – stránkovanie, hľadanie podľa mena a e-mailu, jednotné ID zákazníka;",
         "- **Zákazníci** – stránkovanie, hľadanie podľa mena a e-mailu, jednotné ID zákazníka;"),
        ("- **Zákazníci** + prístupy ku knižnici.", "- **Zákazníci** + prístupy ku knižnici."),
    ],
    "anastasia-admin/AUDIT-admin.md": [
        ("/ kategorie / zákazníci / kupónu", "/ kategorie / zákazníka / kupónu"),
        ("**jednotné označenie** zákazníci v celom UI", "**jednotné označenie** zákazníka v celom UI"),
        ("doplnené ID zákazníci", "doplnené ID zákazníka"),
        ("3 zákazníci, 1 kupón", "3 zákazníci, 1 kupón"),
    ],
    "anastasia-admin/HANDOFF-vernostne-urovne.md": [
        ("priradiť zákazníka\n", "priradiť zákazníka\n"),
        ("**Úroveň zákazníka je jej členstvo v skupine**", "**Úroveň zákazníka je jeho členstvo v skupine**"),
        ("Zákazník ho neprepíše ani sama", "Zákazník ho neprepíše ani sám"),
        ("názov, ktorý vidí zákazník", "názov, ktorý vidí zákazník"),
        ("sú `null`, ak zákazník úroveň nemá", "sú `null`, ak zákazník úroveň nemá"),
        ("### 2.3 Zaradenie jednej zákazníka", "### 2.3 Zaradenie jedného zákazníka"),
        ("Ak zákazník nemá dosiahnutý prah", "Ak zákazník nemá dosiahnutý prah"),
        ("`Zákazník sa nenašla.`", "`Zákazník sa nenašiel.`"),
        ("aby zákazníci dostávali zľavu.`", "aby zákazníci dostávali zľavu.`"),
        ("útraty zákazníka. Ak jej úroveň nastavíte ručne", "útraty zákazníka. Ak jeho úroveň nastavíte ručne"),
        ("### 3.2 Detail zákazníka → výber úrovne", "### 3.2 Detail zákazníka → výber úrovne"),
        ("(detail zákazníka) pridajte", "(detail zákazníka) pridajte"),
        ("zákazníka načítajte", "zákazníka načítajte"),
        ("zákazníka podľa `id`", "zákazníka podľa `id`"),
        ("celkovej útraty zákazníka. Ručne nastavenú úroveň", "celkovej útraty zákazníka. Ručne nastavenú úroveň"),
        ("Ak zákazník raz nastavíte úroveň ručne, automatika ju", "Ak zákazník raz nastavíte úroveň ručne, automatika ju"),
        ("**Údaje o zákazníkoch neukladajte", "**Údaje o zákazníkoch neukladajte"),
    ],
    "backend/docs/wp/loyalty-tiers.md": [
        ("Zákazník má vernostnú úroveň", "Zákazník má vernostnú úroveň"),
        ("a zákazníka môže ručne priradiť", "a zákazníka môže ručne priradiť"),
        ("| Úroveň zákazníka | jej skupina", "| Úroveň zákazníka | jeho skupina"),
        ("| zákazník si ju neprepíše", "| zákazník si ju neprepíše"),
        ("– zákazníci s úrovňou", "– zákazníci s úrovňou"),
        ("zákazníkov alebo rôzne úrovne po zákazníkoch", "zákazníkov alebo rôzne úrovne po zákazníkoch"),
        ("celkovú útratu zákazníka a podľa prahov", "celkovú útratu zákazníka a podľa prahov"),
        ("(zákazník nemá žiadnu úroveň)", "(zákazník nemá žiadnu úroveň)"),
        ("a zákazník", "a zákazník"),
        ("Ak niekoho zákazníka ručne vloží", "Ak niekoho zákazníka ručne vloží"),
    ],
    "backend/docs/wp/digital-library-upload.md": [
        ("zákazník s prístupom", "zákazník s prístupom"),
        ("**Zákazník nedostane priamu adresu R2.**", "**Zákazník nedostane priamu adresu R2.**"),
        ("či produkt už kúpila zákazníčka; vtedy si potvrdenie", "či produkt už kúpil zákazník; vtedy si potvrdenie"),
        ("(zákazník by zaplatila", "(zákazník by zaplatil"),
        ("**Digitálny produkt môže kúpiť len prihlásená zákazníčka.**", "**Digitálny produkt môže kúpiť len prihlásený zákazník.**"),
        ("a zákazníčka nie je prihlásená, pokladňa ju vyzve", "a zákazník nie je prihlásený, pokladňa ho vyzve"),
        ("udeľí zákazníkovi prístup", "udeľí zákazníkovi prístup"),
        ("zákazníkovi s prístupom odstráni", "zákazníkovi s prístupom odstráni"),
    ],
    "backend/docs/wp/ADMIN-FUNKCE-A-POKRYTI.md": [
        ("| Zákazníci | Profily, objednávky, prístupy, rezervácie, poznámky, pomoc s prihlásením |",
         "| Zákazníci | Profily, objednávky, prístupy, rezervácie, poznámky, pomoc s prihlásením |"),
        ("customers — **Zákazníci**", "customers — **Zákazníci**"),
        ("**Pomoc s prihlásením zákazníka**", "**Pomoc s prihlásením zákazníka**"),
    ],
    "backend/docs/wp/ADMIN-SOUPIS.md": [
        ("| Zákazníci | Medusa zákazníci/skupiny + notes API |", "| Zákazníci | Medusa zákazníci/skupiny + notes API |"),
        ("### Objednávky, zákazníci a katalog", "### Objednávky, zákazníci a katalog"),
    ],
    "backend/docs/wp/admin-function-map.json": [
        ('"label_sk": "Zákazníci",', '"label_sk": "Zákazníci",'),
        ('"label_sk": "Pomoc s prihlásením zákazníka",', '"label_sk": "Pomoc s prihlásením zákazníka",'),
        ("Šablóny sa neposielajú automaticky zákazníkom, len sa vložia do pripravenej odpovede.",
         "Šablóny sa neposielajú automaticky zákazníkom, len sa vložia do pripravenej odpovede."),
    ],
    "storefront-prototype/src/lib/api/http.mjs": [
        ("pre túto zákazníčku", "pre tohto zákazníka"),
        ("prihlásenej zákazníčke", "prihlásenému zákazníkovi"),
        ("zákazníčka to musí vedieť", "zákazník to musí vedieť"),
        ("Nová zákazníčka: overený e-mail", "Nový zákazník: overený e-mail"),
        ("E-mail prihlásenej zákazníčky", "E-mail prihláseného zákazníka"),
    ],
    "storefront-prototype/src/lib/api/mock.mjs": [
        ("name:'Zákazníčka'", "name:'Zákazník'"),
        ("profile:{name:'Zákazníčka'", "profile:{name:'Zákazník'"),
    ],
    "storefront-prototype/public/app.mjs": [],
    "storefront-prototype/src/customer-center.mjs": [
        ("žiadne údaje zákazníčky sa negenerujú", "žiadne údaje zákazníka sa negenerujú"),
    ],
}


def rewrite(text: str, fixes: list[tuple[str, str]]) -> tuple[str, int]:
    count = 0
    for old, new in NAIVE:
        count += text.count(old)
        text = text.replace(old, new)
    for old, new in fixes:
        if old in text:
            text = text.replace(old, new)
        else:
            print(f"    ! nenašiel som: {old[:70]}")
    return text, count


total = 0
for arg in sys.argv[1:]:
    path = Path(arg)
    if not path.exists():
        print(f"preskočené (neexistuje): {arg}")
        continue
    original = path.read_text(encoding="utf-8")
    updated, n = rewrite(original, FIXES.get(arg, []))
    if updated != original:
        path.write_text(updated, encoding="utf-8")
    print(f"{arg}: {n} zámen")
    total += n
print(f"spolu {total} zámen")
