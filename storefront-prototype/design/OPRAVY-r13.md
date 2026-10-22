# OPRAVY r13 (kontrola r12b screenshotů, DPR 3, 390 px)

1. Tlačítko zvuku je pořád ZDVOJENÉ (vpravo dole dva kruhy přes sebe, r12b-intro-390.png). Najdi všechny elementy/pseudo-elementy (::before/::after, box-shadow, druhý .lh-intro__sound, plovoucí audio tlačítko z jiné komponenty) a nech jeden kruh. Ověř elementFromPoint + screenshot.
2. Hlavička v intru: „KOŠÍK0“ – text a počet se slévají. Musí být „Košík (0)“ s mezerou, stejně jako na ostatních stránkách.
3. Hlavička musí být na úvodu i na podstránkách STEJNÁ (Leil): na /eshop je Menu vlevo, logo uprostřed, košík vpravo; na úvodu Menu vpravo a logo vlevo. Sjednoť podle podstránek.
4. Malé logo v hlavičce + řada tří log pod ní = logo OZ dvakrát nad sebou. V intru na mobilu skryj logo v hlavičce, dokud se intro neprojede (nebo skryj OZ v řadě). Řada log: Academy | OZ | AI, zarovnané na stejnou výšku a osu; „ACADEMY“ zlatým je skoro neviditelné – zvýraznit kontrast.
5. Nápis ANASTASIA je teď vidět, ale je mdlý (šedozelený na mlze). Ztmavit výplň/tint, aby měl kontrast aspoň 3:1 vůči pozadí.
6. /eshop dlaždice: názvy (světle zlatá) jsou na světlé horní části gradientu nečitelné („AI ANASTASIA ACADEMY“, „ZDRAVÉ DOPLNKY VÝŽIVY“). Buď celá dlaždice tmavá lesní zelená #313C2B s krémovým textem, nebo text dole na tmavé části. Kontrast min. 4.5:1.

Pravidla jako v r12: texty klienta 1:1, commit jen vlastních souborů, žádný push, NIKDY git checkout/reset/stash/clean, animace jen transform/opacity. Ověř Chrome headless DPR 3 + Android UA na 360/390/430/1440, screenshoty do ~/.claude/jobs/8ebf6c40/tmp/r13-*.png, výsledek do OPRAVY-r13-HOTOVO.md.
