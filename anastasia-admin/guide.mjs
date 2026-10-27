// Obsah sprievodcu administráciou ANASTASIA: úvodná prehliadka, centrum nápovedy a pomoc na stránkach.
// Len texty a štruktúra (žiadna logika). Popisuje výhradne obrazovky a akcie, ktoré v admine skutočne fungujú.
// Pri zmene funkcie v app.mjs uprav aj príslušný text tu. Texty slovensky, vykanie, bez technických výrazov.

export const SUPPORT_EMAIL = 'ceo@l-code-dynamics.com';

// Každá položka najprv ukáže navigáciu a potom prejde na skutočnú stránku.
// target môže chýbať pri prázdnom zozname; vtedy sa vysvetlenie zobrazí bez výrezu.
const steps = (items) => items.map(([title, what, target = null, tab = null, activate = null]) => ({ title, what, target, tab, activate }));
export const TOUR = [
  { id: 'prehľad', route: '', nav: '[data-tour="stats"]', title: 'Prehľad', what: 'Tu Lucia začne deň. Skontroluje nové objednávky, správy a úlohy.', steps: steps([
    ['Dnešné čísla', 'Počty objednávok, správ a konzultácií ukazujú, čo čaká na vybavenie.', '[data-tour="stats"]'],
    ['Úlohy na dnes', 'Tu Lucia otvorí konkrétnu úlohu a pokračuje priamo na jej vybavenie.', '[data-tour="tasks"]'],
    ['Prehľad obchodu', 'Graf a pripravenosť pomáhajú skontrolovať predaj a chýbajúce údaje.', '.dash']
  ]) },
  { id: 'objednavky', route: 'objednavky', nav: '.sidebar .nav-item[href="#/objednavky"]', title: 'Objednávky', what: 'Tu Lucia kontroluje stav nákupu a pripravuje jeho vybavenie.', steps: steps([
    ['Zoznam objednávok', 'Lucia skontroluje nové nákupy a otvorí objednávku zo zoznamu.', '.ot-head h2'],
    ['Filter stavu', 'Záložky hore zúžia zoznam podľa stavu vybavenia.', '.ot-filters [role="tab"]'],
    ['Detail objednávky', 'V detaile Lucia skontroluje platbu, dopravu a fakturačné údaje.', '.tabs [data-tab="p"]', null, '.ot-orders tr[data-id]'],
    ['Platba a vrátenie', 'V záložke Platby prijme potvrdenú úhradu alebo zaznamená vrátenie.', '.tabs [data-tab="pl"]', '.tabs [data-tab="pl"]'],
    ['Doprava a faktúra', 'V detaile skontroluje doručenie a fakturačné údaje.', '.tabs [data-tab="o"]', '.tabs [data-tab="o"]'],
    ['Storno', 'Nevybavenú objednávku môže zrušiť v jej detaile.', '#o-cancel']
  ]) },
  { id: 'produkty', route: 'produkty', nav: '.sidebar .nav-item[href="#/produkty"]', title: 'Produkty', what: 'Tu Lucia spravuje katalóg, ceny, fotografie a zakúpený obsah.', steps: steps([
    ['Zoznam a nový produkt', 'Lucia skontroluje katalóg alebo cez + Pridať produkt založí nový koncept.', '#p-new'],
    ['Základné údaje', 'Lucia otvorí kartu produktu a doplní názov a stav produktu.', '#p-title', '.pe-nav [data-jump="zaklad"]', '#p-body tr[data-id]'],
    ['Popis', 'Tu upraví text, ktorý zákazník uvidí na stránke produktu.', '#pe-popis', '.pe-nav [data-jump="popis"]'],
    ['Fotografie', 'Tu pridá fotografie a vyberie hlavnú.', '#pe-foto', '.pe-nav [data-jump="foto"]'],
    ['Kategórie a predaj', 'Tu zaradí produkt a skontroluje spôsob predaja.', '#pe-predaj', '.pe-nav [data-jump="predaj"]'],
    ['Sklad', 'Lucia skontroluje počet kusov, ktoré sú dostupné na predaj.', '#pe-sklad', '.pe-nav [data-jump="sklad"]'],
    ['Zakúpený obsah', 'Tu upraví digitálny obsah sprístupnený zákazníkovi po nákupe.', '#pe-obsah', '.pe-nav [data-jump="obsah"]']
  ]) },
  { id: 'kategorie', route: 'kategorie', nav: '.sidebar .nav-item[href="#/kategorie"]', title: 'Kategórie', what: 'Tu Lucia usporiada produkty do kategórií pre obchod.', steps: steps([
    ['Zoznam kategórií', 'Lucia skontroluje názvy a zaradenie kategórií.', '#view .ot-head h2'],
    ['Nová kategória', 'Tlačidlom pridá kategóriu alebo podkategóriu.', '#cat-new'],
    ['Detail kategórie', 'Tu upraví názov, adresu a nadradenú kategóriu.', '.ot-card tr[data-id]']
  ]) },
  { id: 'zlavy', route: 'poukazy', subtab: 0, nav: '.sidebar .nav-item[href="#/poukazy"]', title: 'Zľavy a kupóny', what: 'Tu Lucia kontroluje kupóny, ktoré zákazníci uplatnia pri nákupe.', steps: steps([
    ['Zoznam kupónov', 'Lucia skontroluje vytvorené zľavové kódy.', '#view .ot-card'],
    ['Nový kupón', 'Tlačidlom založí nový kupón a nastaví jeho pravidlá.', '#promo-new'],
    ['QR kódy', 'Záložka QR kódy otvorí odkazy na kampane.', '#actions .pills button', 1]
  ]) },
  { id: 'poukazy', route: 'poukazy', subtab: 2, nav: '.sidebar .nav-item[href="#/poukazy"]', title: 'Darčekové vouchery', what: 'Tu Lucia skontroluje a nastaví darčekové poukazy.', steps: steps([
    ['Vouchery', 'Lucia vyhľadá vystavený poukaz a skontroluje jeho stav.', '.tabs .tab'],
    ['Nastavenie poukazov', 'Tu nastaví ponuku hodnôt a pravidlá použitia.', '#actions .pills button', 3],
    ['Použitie', 'Detail poukazu ukáže jeho platnosť a zostávajúcu hodnotu.', '#view .ot-card']
  ]) },
  { id: 'zakaznici', route: 'zakaznicky', subtab: 0, nav: '.sidebar .nav-item[href="#/zakaznicky"]', title: 'Zákazníci', what: 'Tu Lucia vyhľadá zákazníkov a ich nákupy.', steps: steps([
    ['Zoznam zákazníkov', 'Lucia nájde zákazníka podľa mena alebo e-mailu.', '.customer-grid'],
    ['Detail zákazníka', 'Tu skontroluje kontaktné údaje a históriu.', '.customer-grid tr[data-id]'],
    ['Filter zákazníkov', 'Vyhľadávanie zúži zoznam podľa mena alebo e-mailu.', 'input[type="search"]']
  ]) },
  { id: 'kniznica', route: 'zakaznicky', subtab: 1, nav: '.sidebar .nav-item[href="#/zakaznicky"]', title: 'Prístupy a knižnica', what: 'Tu Lucia skontroluje digitálny obsah sprístupnený zákazníkom po nákupe.', steps: steps([
    ['Zoznam prístupov', 'Lucia skontroluje priradené prístupy k obsahu.', '#view .ot-head h2'],
    ['Detail prístupu', 'Tu overí, komu a ku ktorému produktu prístup patrí.', '.ot-card tr[data-id]'],
    ['Stav prístupu', 'Prístup sa po zaplatení pridelí automaticky.', '.pill']
  ]) },
  { id: 'konzultacie', route: 'konzultacie', subtab: 0, nav: '.sidebar .nav-item[href="#/konzultacie"]', title: 'Rezervácie', what: 'Tu Lucia vybavuje termíny objednaných konzultácií.', steps: steps([
    ['Rezervácie', 'Lucia skontroluje nové a potvrdené termíny.', '#actions .pills button', 0],
    ['Filter termínov', 'Záložky zúžia zoznam podľa stavu rezervácie.', '.tabs .tab'],
    ['Detail termínu', 'V detaile skontroluje čas a objednanú službu.', '.rc[data-id]']
  ]) },
  { id: 'typy_konzultacii', route: 'konzultacie', subtab: 1, nav: '.sidebar .nav-item[href="#/konzultacie"]', title: 'Typy konzultácií', what: 'Tu Lucia upraví ponuku konzultácií.', steps: steps([
    ['Zoznam typov', 'Lucia skontroluje názvy a trvanie konzultácií.', '.rc-grid .rc'],
    ['Nový typ', 'Tlačidlom pridá ďalší typ konzultácie.', '#bt-new'],
    ['Cena a trvanie', 'V detaile upraví údaje ponuky.', '#bt-price']
  ]) },
  { id: 'dostupnost', route: 'konzultacie', subtab: 2, nav: '.sidebar .nav-item[href="#/konzultacie"]', title: 'Dostupnosť', what: 'Tu Lucia nastaví časy na rezervácie konzultácií.', steps: steps([
    ['Týždenný rozvrh', 'Lucia skontroluje dostupné dni a hodiny.', '.av-card h3'],
    ['Pridať čas', 'Tlačidlom pridá čas, ktorý možno rezervovať.', '[data-add]'],
    ['Uložiť dostupnosť', 'Zmeny potvrdí tlačidlom Uložiť.', '#av-save']
  ]) },
  { id: 'spravy', route: 'spravy', subtab: 0, nav: '.sidebar .nav-item[href="#/spravy"]', title: 'Konverzácie', what: 'Tu Lucia odpovedá zákazníkom a sleduje ich správy.', steps: steps([
    ['Konverzácie', 'Lucia otvorí správu zákazníka a odpovie mu.', '#actions .pills button', 0],
    ['Stav správ', 'Záložkami prepne otvorené, uzavreté alebo všetky konverzácie.', '.tabs .tab'],
    ['Odpoveď', 'Tu napíše odpoveď alebo uzavrie vybavenú konverzáciu.', '.rc[data-id]']
  ]) },
  { id: 'sablony_odpovedi', route: 'spravy', subtab: 1, nav: '.sidebar .nav-item[href="#/spravy"]', title: 'Šablóny odpovedí', what: 'Tu Lucia spravuje pripravené texty pre odpovede zákazníkom.', steps: steps([
    ['Zoznam šablón', 'Lucia skontroluje pripravené odpovede.', '.card'],
    ['Upraviť šablónu', 'V editore upraví text odpovede.', '#ct-text'],
    ['Uložiť šablónu', 'Uložený text môže použiť v konverzácii.', '#ct-save']
  ]) },
  { id: 'stranky', route: 'obsah', subtab: 2, nav: '.sidebar .nav-item[href="#/obsah/2"]', title: 'Stránky a texty', what: 'Tu Lucia upravuje obsah webu a kontroluje živý náhľad.', steps: steps([
    ['Zoznam stránok', 'Lucia vyberie stránku, ktorú chce upraviť.', 'button[data-page]'],
    ['Živý náhľad', 'Po otvorení stránky náhľad ukáže zmeny v kontexte webu.', '.cp-live-h', null, 'button[data-page]'],
    ['Sekcie a polia', 'Lucia rozbalí sekciu, upraví text a uloží ho pri poli.', 'details.content-section summary']
  ]) },
  { id: 'media', route: 'obsah', subtab: 3, nav: '.sidebar .nav-item[href="#/obsah/3"]', title: 'Médiá', what: 'Tu Lucia vyhľadáva a pridáva obrázky používané na webe.', steps: steps([
    ['Knižnica médií', 'Lucia prehliada nahraté súbory.', '#md-upload'],
    ['Vyhľadávanie', 'Pole pomôže nájsť obrázok podľa názvu.', 'input[type="search"]'],
    ['Pridať médium', 'Tlačidlom nahrá ďalší obrázok.', 'input[type="file"]']
  ]) },
  { id: 'emaily', route: 'obsah', subtab: 0, nav: '.sidebar .nav-item[href="#/obsah"]', title: 'E-maily', what: 'Tu Lucia skontroluje automatické e-maily odosielané zákazníkom.', steps: steps([
    ['Zoznam e-mailov', 'Lucia vyberie správu, ktorú chce skontrolovať.', '#view .ot-head h2'],
    ['Náhľad správy', 'Tu skontroluje predmet a text e-mailu.', '#e-subj', null, '#rc-wrap tr[data-id]'],
    ['Doručenie', 'Stav ukazuje, či je šablóna pripravená na odoslanie.', '#e-enabled, #e-save']
  ]) },
  { id: 'newsletter', route: 'obsah', subtab: 1, nav: '.sidebar .nav-item[href="#/obsah/1"]', title: 'Newsletter', what: 'Tu Lucia spravuje odberateľov a rozosielanie noviniek.', steps: steps([
    ['Kampaň', 'Lucia skontroluje editor noviniek a ich stav.', '#nl-editor-h'],
    ['Predmet', 'Tu upraví predmet a úvodný text e-mailu.', '#nl-subject'],
    ['Odberatelia', 'V záložke Odberatelia skontroluje udelené súhlasy.', '.nl-tabs [data-tab="consents"]', '.nl-tabs [data-tab="consents"]']
  ]) },
  { id: 'ambasadori', route: 'ambasadori', nav: '.sidebar .nav-item[href="#/ambasadori"]', title: 'Ambasádori', what: 'Ambasádori sú vo Fáze 2 a zatiaľ tu netreba nič nastavovať.', steps: [] },
  { id: 'doprava', route: 'nastavenia', subtab: 2, nav: '.sidebar .nav-item[href="#/nastavenia/2"]', title: 'Doprava a platby', what: 'Tu Lucia skontroluje dostupné spôsoby doručenia a platby.', steps: steps([
    ['Dostupné možnosti', 'Lucia skontroluje dopravu a platobné metódy.', '#view .card-h'],
    ['Stav nastavenia', 'Prehľad ukazuje, či je spôsob dostupný v obchode.', '.pill, .notice'],
    ['Potrebujete zmenu?', 'Zmeny technického nastavenia pomôže vybaviť podpora.', '.card']
  ]) },
  { id: 'nastavenia', route: 'nastavenia', subtab: 0, nav: '.sidebar .nav-item[href="#/nastavenia"]', title: 'Vzhľad a nastavenia', what: 'Tu Lucia upraví vzhľad administrácie a skontroluje nastavenia.', steps: steps([
    ['Vzhľad', 'Lucia si vyberie vzhľad pracovného priestoru.', '#view .card-h'],
    ['Pripojenia', 'Tu skontroluje prepojené služby.', '#actions .pills button', 1],
    ['Používatelia', 'Tu spravuje pozvánky a prístupy kolegov.', '#actions .pills button', 4]
  ]) },
  { id: 'integracie', route: 'nastavenia', subtab: 1, nav: '.sidebar .nav-item[href="#/nastavenia/1"]', title: 'Integrácie', what: 'Tu Lucia skontroluje napojenia služieb obchodu.', steps: steps([
    ['Prepojené služby', 'Zoznam ukazuje dostupné prepojenia.', '#view .card-h'],
    ['Stav', 'Lucia skontroluje, ktoré prepojenie je aktívne.', '.pill, .notice'],
    ['Zmena prepojenia', 'Pri technickej zmene kontaktuje podporu.', '.card']
  ]) },
  { id: 'pouzivatelia', route: 'nastavenia', subtab: 4, nav: '.sidebar .nav-item[href="#/nastavenia/4"]', title: 'Používatelia', what: 'Tu Lucia pozýva kolegov a upravuje ich prístup.', steps: steps([
    ['Zoznam používateľov', 'Lucia skontroluje účty s prístupom do administrácie.', '#view .card-h'],
    ['Pozvať používateľa', 'Tlačidlom pripraví pozvánku pre kolegu.', '#u-email'],
    ['Roly a prístup', 'Pred odoslaním skontroluje, čo môže pozvaný používateľ spravovať.', '.card']
  ]) },
  { id: 'pomoc', route: 'pomoc', nav: '.sidebar .nav-item[href="#/pomoc"]', title: 'Pomoc', what: 'Tu Lucia nájde návody a môže spustiť prehliadku znova.', steps: steps([
    ['Návody', 'Lucia vyhľadá postup podľa témy.', 'input[type="search"]'],
    ['Spustiť znova', 'Tlačidlo znovu otvorí celú prehliadku administrácie.', '#help-tour'],
    ['Kontakt', 'Pri otázke sa môže obrátiť na podporu.', 'a[href^="mailto:"]']
  ]) }
];

// Podrobnejšie, samostatné prehliadky aktívnej záložky produktu a objednávky.
export const PRODUCT_TAB_GUIDES = {
  zaklad: { title: 'Základné údaje', steps: steps([['Názov', 'Tu Lucia upraví názov, ktorý sa zobrazí v obchode.', '#p-title'], ['Stav', 'Koncept zostane skrytý, zverejnený produkt je viditeľný v obchode.', '#p-status'], ['Cena', 'Lucia skontroluje bežnú cenu a prípadnú akciovú cenu.', '#p-price']]) },
  popis: { title: 'Popis', steps: steps([['Text produktu', 'Lucia upraví popis produktu v editore.', '#p-desc'], ['Formátovanie', 'Text môže rozdeliť na odseky, nadpisy a zoznamy.', '#p-desc'], ['Uloženie', 'Zmeny sa uložia tlačidlom Uložiť zmeny.', '#p-save']]) },
  foto: { title: 'Fotografie', steps: steps([['Fotografie produktu', 'Tu Lucia skontroluje pridané obrázky.', '#p-imgs'], ['Nahrať obrázky', 'Vyberie JPG, PNG alebo WebP do 5 MB.', '#p-file'], ['Uložiť zmeny', 'Nahraté fotografie sa uložia spolu s produktom.', '#p-save']]) },
  predaj: { title: 'Kategórie a predaj', steps: steps([['Kategória', 'Lucia zaradí produkt do kategórie.', '#p-category'], ['Kód a doprava', 'Tu skontroluje SKU, hmotnosť a typ doručenia.', '#p-sku'], ['Predajný kanál', 'Produkt sa v obchode zobrazí v označených kanáloch.', '[data-ch]']]) },
  sklad: { title: 'Sklad', steps: steps([['Sledovanie zásob', 'Pri fyzickom tovare Lucia zapne sledovanie skladu.', '#p-inv'], ['Počet kusov', 'Tu upraví množstvo dostupné na predaj.', '[data-loc]'], ['Rezervované kusy', 'Rezervácie vznikajú z objednávok, ktoré ešte nie sú vybavené.', '.rc-fields']]) },
  obsah: { title: 'Zakúpený obsah', steps: steps([['Knižnica obsahu', 'Tu Lucia spravuje súbory sprístupnené po nákupe.', '#p-library'], ['Položky', 'V zozname vyberie lekciu alebo pracovný list.', '#p-library'], ['Uložiť zmeny', 'Zmeny potvrdí tlačidlom Uložiť zmeny.', '#p-save']]) }
};
export const ORDER_TAB_GUIDES = {
  p: { title: 'Prehľad objednávky', steps: steps([['Stav platby', 'Tu Lucia skontroluje, či zákazník zaplatil.', '.tabpane[data-pane="p"] .pill'], ['Doručenie', 'Skontroluje adresu a zvolený spôsob dopravy.', '.tabpane[data-pane="p"] .row'], ['Poznámka', 'Internú poznámku vidí len tím administrácie.', '#o-note']]) },
  i: { title: 'Položky objednávky', steps: steps([['Zoznam položiek', 'Tu sú produkty a služby z objednávky.', '.tabpane[data-pane="i"] .rc'], ['Počet kusov', 'Lucia skontroluje objednané množstvo.', '.tabpane[data-pane="i"] .rc-fields'], ['Doručený obsah', 'Stav ukazuje pripravené a odoslané kusy.', '.tabpane[data-pane="i"] .rc-fields']]) },
  o: { title: 'Odoslanie objednávky', steps: steps([['Pripraviť zásielku', 'Pri fyzickom tovare Lucia pripraví zásielku.', '#o-ful'], ['Číslo zásielky', 'Po odovzdaní dopravcovi doplní sledovacie údaje.', '[data-trk]'], ['Označiť odoslanú', 'Po odovzdaní zásielky označí ju ako odoslanú.', '[data-ship]']]) },
  pl: { title: 'Platby objednávky', steps: steps([['Stav úhrady', 'Tu Lucia skontroluje prijaté a vrátené sumy.', '.tabpane[data-pane="pl"] .task'], ['Prijať platbu', 'Platbu potvrdí až po overení úhrady.', '[data-cap]'], ['Vrátiť peniaze', 'Pred potvrdením skontroluje sumu a dôvod vrátenia.', '[data-ref]']]) }
};

export const GUIDE_GROUPS = [
  { id: 'start', label: 'Začíname' },
  { id: 'objednavky', label: 'Objednávky' },
  { id: 'produkty', label: 'Produkty' },
  { id: 'zakaznicky', label: 'Zákazníci a komunikácia' },
  { id: 'konzultacie', label: 'Konzultácie' },
  { id: 'poukazy', label: 'Poukazy a zľavy' },
  { id: 'nastavenia', label: 'Nastavenia' },
];

// Návody: why = prečo, steps = kroky, after = čo sa stane potom, careful = na čo si dať pozor,
// extra = voliteľný doplnkový zoznam. href/hrefLabel = odkaz na stránku administrácie.
export const GUIDES = [
  {
    id: 'prehlad', group: 'start', icon: 'home', href: '#/', hrefLabel: 'Otvoriť Prehľad',
    title: 'Čo vidíte na Prehľade',
    summary: 'Prvá stránka po prihlásení: čo dnes čaká na vás.',
    why: 'Prehľad zhromažďuje to podstatné z celého obchodu, aby ste nemuseli prechádzať každú agendu zvlášť.',
    steps: [
      'Hore vidíte čísla: objednávky na vybavenie, nové správy a dnešné konzultácie. Kliknutím na číslo prejdete na danú agendu.',
      'V časti Čomu sa venovať sú úlohy, ktoré práve čakajú. Každá má odkaz, kde ju vybavíte.',
      'V časti Dnes vás čaká sú dnešné potvrdené konzultácie s časom a menom zákazníci.',
      'Pod úlohami je Pripravenosť obchodu, kontrola toho, či sa dá v obchode nakupovať.',
    ],
    after: ['Čísla sa načítajú pri každom otvorení stránky. Najnovší stav uvidíte po obnovení stránky.'],
    careful: ['Ak sa niektoré číslo nedá načítať, radšej sa nezobrazí, než aby ukázalo nepresný údaj. Pomôže obnovenie stránky.'],
  },
  {
    id: 'pripravenost', group: 'start', icon: 'check', href: '#/', hrefLabel: 'Otvoriť Prehľad',
    title: 'Čo znamená Pripravenosť obchodu',
    summary: 'Kontrola, či má obchod všetko potrebné na predaj.',
    why: 'Systém kontroluje, či má obchod všetko, čo potrebuje na predaj. Odhalí napríklad zverejnený produkt bez ceny, ktorý by zákazník nemohol kúpiť.',
    steps: [
      'Na Prehľade nájdite kartu Pripravenosť obchodu. Vpravo hore vidíte, koľko kontrol je v poriadku.',
      'Body označené „bráni predaju“ riešte ako prvé. Kým platia, niečo sa v obchode nedá kúpiť.',
      'Body „odporúčame doplniť“ predaj nezastavia, ale zlepšia dojem, napríklad obrázok alebo kategória produktu.',
      'Kliknite na Vyriešiť a dostanete sa na stránku, kde vec opravíte.',
      'Po oprave sa vráťte na Prehľad. Kontrola sa načíta znova.',
    ],
    extra: { title: 'Čo sa kontroluje', items: [
      'predajný región v eurách a zapnutá platobná metóda (bránia predaju)',
      'obchodné podmienky a ochrana súkromia (bránia predaju)',
      'aspoň jeden zverejnený produkt, produkty s cenou v eurách a v predajnom kanáli (bránia predaju)',
      'spôsob dopravy a sklad (odporúčame)',
      'produkty s obrázkom a s kategóriou (odporúčame)',
    ] },
    after: ['Keď je všetko v poriadku, uvidíte „Obchod je pripravený na predaj“.'],
    careful: [
      '„Nedá sa overiť“ znamená, že kontrolu sa práve nepodarilo vykonať, nie že je všetko v poriadku. Skúste stránku obnoviť.',
      `Ak sa tu objaví bod k platbám alebo doprave, napíšte na ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    id: 'objednavka-vybavit', group: 'objednavky', icon: 'bag', href: '#/objednavky', hrefLabel: 'Otvoriť Objednávky',
    title: 'Ako vybaviť objednávku',
    summary: 'Od zaplateného nákupu po odoslaný balík v dvoch krokoch.',
    why: 'Vybavenie objednávky je cesta od zaplateného nákupu k balíku u zákazníka. Administrácia vás prevedie dvoma krokmi a zákazníka informuje e-mailom.',
    steps: [
      'Otvorte Objednávky a kliknite na objednávku, ktorá má v poli Vybavenie označenie nevybavená.',
      'V záložke Prehľad skontrolujte adresu doručenia, dopravu a platbu.',
      'Prejdite do záložky Odoslanie a kliknite na Pripraviť. Všetky nevybavené položky sa zaradia do zásielky.',
      'Keď balík odovzdáte dopravcovi, doplňte číslo zásielky a odkaz na sledovanie (nie sú povinné) a kliknite na Označiť ako odoslanú.',
      'Každú akciu potvrďte v okne, ktoré sa zobrazí.',
    ],
    after: [
      'Po označení odoslania dostane zákazník e-mail, že objednávka je na ceste, aj s číslom zásielky a odkazom na sledovanie, ak ste ich zadali.',
      'V e-maile má zákazník odkaz na svoju objednávku.',
      'Číslo pri položke Objednávky v bočnom paneli sa zníži.',
    ],
    careful: [
      'Odkaz na sledovanie musí začínať https://.',
      'Pri digitálnom obsahu (objednávka bez adresy doručenia) sa nič neposiela poštou. Prístup sa zákazníkovi pridelí automaticky po zaplatení.',
      'Kým nie je nič odoslané, objednávku sa dá zrušiť. Po odoslaní už tlačidlo Zrušiť objednávku nie je k dispozícii.',
    ],
  },
  {
    id: 'objednavka-platby', group: 'objednavky', icon: 'bag', href: '#/objednavky', hrefLabel: 'Otvoriť Objednávky',
    title: 'Ako prijať platbu alebo vrátiť peniaze',
    summary: 'Prijatie čakajúcej platby a celé alebo čiastočné vrátenie peňazí.',
    why: 'Niektoré platby sa najprv len autorizujú, peniaze sú vtedy zablokované na karte a treba ich prijať. Keď zákazník niečo vráti alebo nastane chyba, vrátite mu peniaze priamo z objednávky.',
    steps: [
      'Otvorte objednávku a prejdite do záložky Platby.',
      'Ak platba ešte nie je prijatá, uvidíte tlačidlo Prijať platbu. Kliknite naň a potvrďte.',
      'Pri vrátení peňazí skontrolujte pole Suma na vrátenie. Predvyplnená je celá suma, ktorú ešte možno vrátiť. Môžete ju znížiť a vrátiť len časť.',
      'Kliknite na Vrátiť peniaze a sumu potvrďte.',
    ],
    after: [
      'Peniaze sa vrátia cez platobnú bránu na pôvodný spôsob platby.',
      'Zákazník dostane e-mail o vrátení peňazí so sumou.',
      'Ak objednávka obsahovala digitálny obsah, systém sám upraví jeho prístupy.',
      'Po prijatí platby dostane zákazník e-mail o prijatí platby, ak jeho potvrdenie objednávky odišlo ešte ako nezaplatené.',
    ],
    careful: [
      'Vrátenie peňazí sa nedá vziať späť. Sumu si pred potvrdením skontrolujte.',
      'Viac, než bolo prijaté, vrátiť nejde. Systém to nedovolí.',
    ],
  },
  {
    id: 'objednavka-prevod-dobierka', group: 'objednavky', icon: 'bag', href: '#/objednavky', hrefLabel: 'Otvoriť Objednávky',
    title: 'Ako spárovať platbu prevodom a dobierku',
    summary: 'Objednávky zaplatené prevodom na účet alebo na dobierku potvrdíte ručne, keď peniaze prídu.',
    why: 'Prevod a dobierka nejdú cez platobnú bránu. Objednávka preto vznikne so stavom „čaká na platbu“ a digitálny obsah sa zákazníkovi sprístupní až potom, ako platbu prijmete. Doprava kuriérom stojí 6 €, od 60 € je zadarmo; dobierka je o 2 € drahšia a dá sa zvoliť len pri kuriérovi a fyzickom tovare.',
    steps: [
      'V Objednávkach otvorte objednávku so stavom platby „čaká na platbu (prevod)“ alebo „čaká na platbu (dobierka)“. Spôsob platby vidíte v Prehľade.',
      'Prevod: vo výpise z účtu vo VÚB banke (IBAN SK43 0200 0000 0052 3107 0754) nájdite platbu, ktorej variabilný symbol je číslo objednávky. Skontrolujte, že suma sedí s „Celkom“ v objednávke.',
      'Dobierka: tovar pripravte a odošlite kuriérom. Keď vám dopravca vyplatí vybranú sumu, nájdite objednávku podľa čísla na výpise od dopravcu.',
      'V záložke Platby kliknite na Prijať platbu a potvrďte.',
    ],
    after: [
      'Stav platby sa zmení na „zaplatená“.',
      'Zákazníkovi sa sprístupní zakúpený digitálny obsah a odíde mu e-mail o prijatí platby.',
      'Pri osobnom odbere (Sokolská 88, Zvolen) zákazník platí prevodom alebo kartou vopred; tovar odovzdajte až po prijatí platby.',
    ],
    careful: [
      'Platbu prijmite až vtedy, keď peniaze naozaj prišli na účet. Tlačidlo nič nesťahuje, len zaznamená úhradu.',
      'Ak suma alebo variabilný symbol nesedí, platbu neprijímajte a ozvite sa zákazníkovi.',
      'Pri vrátení peňazí za prevod alebo dobierku pošlite peniaze zákazníkovi sami prevodom; v objednávke sumu len zaznamenáte cez Vrátiť peniaze.',
      'Nezaplatenú objednávku, ktorá na platbu čaká priveľa dní, môžete zrušiť.',
    ],
  },
  {
    id: 'objednavka-zrusit', group: 'objednavky', icon: 'bag', href: '#/objednavky', hrefLabel: 'Otvoriť Objednávky',
    title: 'Ako zrušiť objednávku',
    summary: 'Zrušenie neodoslanej objednávky s automatickým vrátením peňazí.',
    why: 'Ak zákazník nákup zruší alebo objednávku nemôžete splniť, zrušením ho uzavriete a zaplatená suma sa vráti automaticky.',
    steps: [
      'Otvorte objednávku.',
      'Úplne dole kliknite na Zrušiť objednávku a potvrďte.',
    ],
    after: [
      'Zaplatená suma sa zákazníkovi automaticky vráti cez platobnú bránu.',
      'Zákazník dostane e-mail o zrušení objednávky.',
      'Ak bola v objednávke konzultácia, termín sa zruší a uvoľní pre ostatných zákazníkov. Zákazníkovi odíde aj e-mail o zrušení termínu.',
    ],
    careful: [
      'Zrušiť sa dá len objednávka, z ktorej ešte nič nebolo odoslané.',
      'Zrušenie sa nedá vrátiť späť.',
    ],
  },
  {
    id: 'produkt-pridat', group: 'produkty', icon: 'box', href: '#/produkty', hrefLabel: 'Otvoriť Produkty',
    title: 'Ako pridať nový produkt',
    summary: 'Nový tovar, digitálny obsah alebo služba v katalógu.',
    why: 'Každý produkt, ktorý chcete predávať, či je to fyzický tovar, digitálny obsah alebo služba, musí byť v katalógu.',
    steps: [
      'V Produktoch kliknite na + Pridať produkt.',
      'Zadajte názov a cenu v eurách.',
      'Kód produktu (SKU) sa vyplní sám podľa názvu, môžete ho zmeniť. Povolené sú veľké písmená bez diakritiky, číslice, bodka, pomlčka a podčiarknik.',
      'Vyberte typ produktu: fyzický tovar (doprava kuriérom) alebo digitálny produkt či službu (bez dopravy).',
      'Stav nechajte Koncept, ak chcete produkt ešte doplniť, a kliknite na Vytvoriť produkt.',
      'Otvorí sa úprava produktu, kde doplníte obrázky, popis, kategórie a sklad.',
    ],
    after: [
      'Produkt v stave Koncept zákazníci nevidia. Na webe bude až po zverejnení.',
      'Pri digitálnom produkte sa sklad nesleduje, takže sa dá kúpiť vždy.',
    ],
    careful: [
      'Kód produktu sa po pridelení už nedá zmeniť. Podľa neho systém produkt nacení.',
      'Zverejniť sa dá len produkt s cenou.',
      'Typ produktu je povinný. Bez neho sa produkt nedá doručiť ani objednať.',
    ],
  },
  {
    id: 'produkt-upravit', group: 'produkty', icon: 'box', href: '#/produkty', hrefLabel: 'Otvoriť Produkty',
    title: 'Ako upraviť produkt, cenu, obrázky a sklad',
    summary: 'Všetky údaje produktu na jednej stránke a kontrola pred zverejnením.',
    why: 'Údaje, fotografie, kategórie a sklad upravíte spolu na jednej stránke. Kontrola úplnosti vám ukáže, čo ešte chýba.',
    steps: [
      'V Produktoch kliknite na kartu produktu.',
      'Hore vidíte kontrolu úplnosti: ✓ je hotové, ✕ bráni zverejneniu, ! odporúčame doplniť.',
      'Základné: názov a stav (Zverejnený alebo Koncept).',
      'Cena a akcia: bežná cena v eurách a prípadná akciová cena.',
      'Obrázky: nahrajte JPG, PNG alebo WebP do 5 MB a zvoľte hlavný obrázok.',
      'Kategórie, Predaj (typ produktu a predajné kanály), Sklad (počet kusov po skladoch) a Popis (text s tučným písmom, kurzívou a zoznamami).',
      'Kliknite na Uložiť. Uložia sa zmeny na celej stránke naraz.',
    ],
    after: [
      'Zverejnený produkt sa zobrazí v obchode v označených predajných kanáloch.',
      'Novú cenu systém použije pri ďalšom nákupe. Konečnú sumu v košíku vždy prepočíta systém automaticky na serveri, takže zákazník zaplatí presne to, čo je v katalógu.',
      'Pri fyzickom tovare so sledovaním skladu systém nedovolí predať viac kusov, než je na sklade.',
    ],
    careful: [
      'Nahraté obrázky sa uložia až tlačidlom Uložiť.',
      'Ak sa cena medzitým zmenila (napríklad v inom okne), systém zmenu odmietne, aby ste neprepísali novší údaj. Obnovte stránku a skúste znova.',
      'Rezervované kusy sú tie, ktoré sú v objednávkach a ešte neboli vybavené.',
    ],
  },
  {
    id: 'produkt-akcia', group: 'produkty', icon: 'box', href: '#/produkty', hrefLabel: 'Otvoriť Produkty',
    title: 'Ako nastaviť akciovú cenu (výpredaj)',
    summary: 'Dočasne nižšia cena bez prepisovania bežnej ceny.',
    why: 'Akciou dočasne znížite cenu bez toho, aby ste prepisovali bežnú cenu. Zákazník vidí zľavu oproti bežnej cene.',
    steps: [
      'Otvorte produkt a nájdite časť Cena a akcia.',
      'Zaškrtnite Vo výpredaji / akcia.',
      'Zadajte akčnú cenu v eurách. Pole Platí do je voliteľné.',
      'Kliknite na Uložiť.',
      'Akciu ukončíte tak, že políčko odškrtnete a znova uložíte.',
    ],
    after: [
      'V zozname produktov sa pri produkte zobrazí akčná cena.',
      'Zákazník na webe zaplatí akčnú cenu. Bežná cena ostáva uložená na čas po akcii.',
    ],
    careful: ['Dátum Platí do je vaša pripomienka. Akcia sa k tomuto dňu sama nevypne, po skončení ju vypnite ručne.'],
  },
  {
    id: 'kategorie', group: 'produkty', icon: 'doc', href: '#/kategorie', hrefLabel: 'Otvoriť Kategórie',
    title: 'Ako spravovať kategórie',
    summary: 'Triedenie produktov, aby ich zákazníci ľahko našli.',
    why: 'Kategórie pomáhajú zákazníkom nájsť produkty v ponuke. Produkt bez kategórie sa hľadá ťažko.',
    steps: [
      'Otvorte stránku Kategórie (tlačidlo nižšie).',
      'Kliknite na + Nová kategória alebo na existujúcu kategóriu.',
      'Zadajte názov. Pole Handle (časť webovej adresy) môžete nechať prázdne.',
      'Zaškrtnite Aktívna, ak má byť kategória v ponuke, a kliknite na Uložiť.',
      'Produkt do kategórie zaradíte v úprave produktu v časti Kategórie.',
    ],
    after: ['Kategóriu hneď nájdete v úprave produktov a v nastavení darčekových poukazov, ak chcete obmedziť, kde sa dá poukaz použiť.'],
    careful: ['Kategóriu, ktorú dočasne nechcete ukazovať, radšej nastavte ako neaktívnu.'],
  },
  {
    id: 'zakaznicky', group: 'zakaznicky', icon: 'users', href: '#/zakaznicky', hrefLabel: 'Otvoriť Zákazníci',
    title: 'Ako nájsť zákazníka a skontrolovať jeho prístupy',
    summary: 'Údaje zákazníka, skupiny a prístupy k digitálnemu obsahu.',
    why: 'Na jednom mieste zistíte, kto u vás nakupuje, opravíte meno a skontrolujete, k akému obsahu má zákazník prístup.',
    steps: [
      'V Zákazníkch nájdite zákazníka. Pri dlhom zozname použite pole Hľadať.',
      'Na karte vidíte, či má registrovaný účet, alebo nakúpila ako hosť.',
      'Kliknite na ňu. V záložke Základné opravíte meno a priezvisko, v záložke Vernosť a skupiny nastavíte vernostnú úroveň a skupiny.',
      'Kliknite na Uložiť.',
      'V prepínači Prístupy a knižnica hore vidíte všetky digitálne prístupy: čo si kto kúpil a dokedy to platí.',
    ],
    after: ['Prístupy k digitálnemu obsahu sa pridelia automaticky po zaplatení a pri vrátení peňazí sa samy upravia.'],
    careful: [
      'E-mail zákazníka sa v administrácii nemení, je to jeho prihlasovací údaj.',
      'Odobratie prístupu v detaile prístupu sa prejaví hneď, bez ďalšieho potvrdenia. Zákazník stratí prístup k obsahu.',
    ],
  },
  {
    id: 'spravy', group: 'zakaznicky', icon: 'chat', href: '#/spravy', hrefLabel: 'Otvoriť Správy',
    title: 'Ako odpovedať zákazníkovi v správach',
    summary: 'Odpoveď, uzavretie konverzácie, stlmenie a blokovanie.',
    why: 'Zákazníci vám píšu zo svojho účtu na webe. Odpoveď z administrácie ostane v histórii konverzácie, takže sa k nej kedykoľvek vrátite.',
    steps: [
      'V Správach vidíte otvorené konverzácie. Neprečítané majú bodku a označenie neprečítaná.',
      'Kliknite na konverzáciu. Označí sa ako prečítaná.',
      'Dole napíšte odpoveď a kliknite na Odoslať.',
      'Keď je vec vybavená, kliknite na Uzavrieť konverzáciu. Neskôr ju môžete znova otvoriť.',
    ],
    extra: { title: 'Nová správa zákazníkovi (keď zákazník ešte neodpovedal)', items: [
      'V Správach kliknite na Nová správa. Vyhľadajte zákazníka podľa mena alebo e-mailu a vyberte ho.',
      'Napíšte správu. Môžete vložiť aj uloženú šablónu odpovede a doplniť tému (napr. „Objednávka #12 – doprava“).',
      'Kliknite na Odoslať správu – zákazníkovi príde e-mail a konverzácia sa vám otvorí.',
      'Rovnaké tlačidlo Napísať správu nájdete aj v detaile zákazníka (Zákazníci → klik na zákazníka); zákazník je vtedy už vybraný.',
    ] },
    after: [
      'Zákazník dostane e-mailové upozornenie, že má novú odpoveď. Ak predchádzajúce upozornenie ešte nečítal, ďalšie mu neposielame, aby nebol zahltený.',
      'Keď vám zákazníci napíšu, dostanete súhrnný e-mail o nových správach, najviac raz za hodinu.',
      'Pri konverzácii vidíte aj objednávku alebo konzultáciu, ktorej sa týka.',
    ],
    careful: [
      'Stlmiť upozornenia: konverzácia sa nebude počítať medzi nové správy a nebude v súhrnnom e-maile.',
      'Zablokovať chat zákazníka: zákazník vám nebude môcť písať nové správy. Dá sa to kedykoľvek vrátiť.',
    ],
  },
  {
    id: 'emaily', group: 'zakaznicky', icon: 'doc', href: '#/obsah', hrefLabel: 'Otvoriť Obsah a e-maily',
    title: 'Aké e-maily dostávajú zákazníci a kto odoberá newsletter',
    summary: 'Náhľady automatických e-mailov a prihlásenia na newsletter.',
    why: 'Obchod posiela e-maily automaticky pri dôležitých udalostiach. Nemusíte ich písať ani odosielať ručne. Tu si pozriete, ako vyzerajú.',
    steps: [
      'Otvorte Obsah a e-maily. Prepínač E-maily ukazuje všetky šablóny.',
      'Pri každej vidíte, komu je určená a či je zapnutá.',
      'Kliknite na šablónu a zobrazí sa náhľad e-mailu.',
      'Prepínač Newsletter ukazuje, kto sa prihlásil na odber, stav súhlasu a odkiaľ prihlásenie prišlo.',
    ],
    extra: { title: 'Kedy zákazníkovi odíde e-mail', items: [
      'potvrdenie objednávky',
      'prijatie platby, ak potvrdenie objednávky odišlo ako nezaplatené',
      'odoslanie zásielky',
      'vrátenie peňazí',
      'zrušenie objednávky a zrušenie termínu konzultácie',
      'nová odpoveď v správach',
      'uvítanie po registrácii',
      'darčekový poukaz podľa nastaveného doručenia',
    ] },
    after: [],
    careful: ['Ak chcete upraviť text niektorého e-mailu, napíšte nám. Zmenu pripravíme tak, aby sa nerozbil vzhľad e-mailu.'],
  },
  {
    id: 'konzultacie-rezervacie', group: 'konzultacie', icon: 'cal', href: '#/konzultacie', hrefLabel: 'Otvoriť Konzultácie',
    title: 'Ako spravovať rezervácie konzultácií',
    summary: 'Prehľad termínov a ich zrušenie.',
    why: 'Všetky rezervácie máte na jednom mieste, so stavom platby aj s objednávkou, ku ktorej patria.',
    steps: [
      'V Konzultáciách je prvý prepínač Rezervácie. Záložkami vyberiete Potvrdené, Čakajú na platbu, Prebehli alebo Zrušené.',
      'Kliknite na rezerváciu a uvidíte termín, typ konzultácie a objednávku.',
      'Termín, ktorý nie je súčasťou zaplatenej objednávky, zrušíte tlačidlom Zrušiť termín. Dôvod je voliteľný.',
      'Zaplatený termín v objednávke zrušíte zrušením objednávky. Odkaz na ňu je priamo v detaile rezervácie.',
    ],
    after: [
      'Pri zrušení potvrdeného termínu dostane zákazník e-mail o zrušení.',
      'Zrušený termín sa uvoľní pre ostatných zákazníkov.',
      'Pri zrušení objednávky sa zaplatená suma vráti automaticky.',
    ],
    careful: [
      '„Čaká na platbu“ znamená, že zákazník má termín v rozpracovanej pokladni. Ak nezaplatí, termín sa sám uvoľní.',
      'Ak potvrdený termín zrušíte samostatne, peniaze vráťte v detaile objednávky v záložke Platby.',
    ],
  },
  {
    id: 'konzultacie-nastavit', group: 'konzultacie', icon: 'cal', href: '#/konzultacie', hrefLabel: 'Otvoriť Konzultácie',
    title: 'Ako nastaviť typy konzultácií a voľné termíny',
    summary: 'Ponuka konzultácií a váš voľný čas, z ktorého web ponúkne termíny.',
    why: 'Web ponúka zákazníkom len termíny, ktoré vychádzajú z vašej dostupnosti a z dĺžky konzultácie. Preto treba nastaviť oboje.',
    steps: [
      'V Konzultáciách prepnite hore na Typy konzultácií a kliknite na Nový typ konzultácie.',
      'Zadajte názov, popis, cenu s DPH, formu (online alebo osobne), dĺžku a pauzu po konzultácii. Nechajte zaškrtnuté V ponuke na webe a kliknite na Vytvoriť.',
      'Prepnite na Dostupnosť. Pri každom dni pridajte úsek (+ Pridať úsek), kedy máte čas, napríklad 9:00 – 12:00. Deň bez úseku je zatvorený.',
      'Šípkami sa posúvate po týždňoch. Tlačidlo Prevziať z predchádzajúceho týždňa skopíruje úseky. Pred uložením ich skontrolujte.',
      'Kliknite na Uložiť týždeň.',
    ],
    after: [
      'Termíny na webe sa aktualizujú hneď po uložení.',
      'Web rozdelí váš čas na termíny podľa dĺžky a pauzy každého typu konzultácie.',
      'Zákazník si termín vyberie a zaplatí. Potom ho uvidíte v Rezerváciách aj na Prehľade.',
    ],
    careful: [
      'Časy sú v bratislavskom čase.',
      'Úsek, do ktorého zasahuje rezervácia, nejde odobrať ani skrátiť. Najprv zrušte rezerváciu.',
      'Minulý týždeň sa už nedá meniť.',
      'Zmena ceny platí pre nové rezervácie. Archivovaný typ zmizne z webu, existujúce termíny ostanú platné.',
    ],
  },
  {
    id: 'kupony', group: 'poukazy', icon: 'gift', href: '#/poukazy', hrefLabel: 'Otvoriť Poukazy a zľavy',
    title: 'Ako vytvoriť zľavový kupón',
    summary: 'Kód so zľavou v percentách alebo eurách na celý nákup.',
    why: 'Kupón je kód, ktorý zákazník zadá v košíku a dostane zľavu na celý nákup. Hodí sa na akcie, newsletter či sociálne siete.',
    steps: [
      'V Poukazoch a zľavách je prvý prepínač Kupóny a zľavy. Kliknite na + Nový kupón.',
      'Zadajte kód, napríklad JAR26.',
      'Vyberte typ zľavy (percentá alebo pevná suma v eurách) a hodnotu.',
      'Kliknite na Vytvoriť. Kupón je hneď aktívny.',
      'Kupón vypnete tak, že ho otvoríte, zmeníte stav na inactive a uložíte.',
    ],
    after: ['Zľavu systém prepočíta automaticky na serveri pri nákupe. Zákazník ju vidí v košíku.'],
    careful: [
      'Stavy: active znamená, že kupón platí, inactive je vypnutý, draft je rozpracovaný a neplatí.',
      'Pri existujúcom kupóne sa dá meniť len stav. Ak chcete inú zľavu, vytvorte nový kupón s novým kódom.',
      'Kód zverejnite až po vytvorení kupónu. Dovtedy ho obchod neprijme.',
    ],
  },
  {
    id: 'qr-kody', group: 'poukazy', icon: 'gift', href: '#/poukazy', hrefLabel: 'Otvoriť Poukazy a zľavy',
    title: 'Ako vytvoriť QR kód na leták alebo obal',
    summary: 'QR, ktorý zákazníka privedie k produktu so zľavou z kupónu.',
    why: 'QR kód vytlačený na letáku, vizitke či obale otvorí zákazníkovi produkt na webe a rovno uplatní zľavu z kupónu. Zákazník nemusí nič opisovať.',
    steps: [
      'Najprv si v prepínači Kupóny a zľavy vytvorte kupón (alebo použite existujúci).',
      'Prepnite na QR kódy a kliknite na Vytvoriť QR kód.',
      'Zadajte kód produktu (nájdete ho v detaile produktu), kód kupónu a počet kusov, ktoré sa vložia do košíka.',
      'Kliknite na Vytvoriť a uložiť.',
      'V detaile QR kódu kliknite na Stiahnuť SVG (pre tlačiareň) alebo Stiahnuť PNG (pre web a sociálne siete).',
    ],
    after: [
      'QR kód zostáva v zozname. Ak obrázok stratíte, stiahnete ho znova bez vytvárania nového kupónu.',
      'Cez Pridať staré odkazy si do zoznamu doplníte QR kódy, ktoré ste vytlačili pre starý web.',
    ],
    careful: [
      'QR kód novú zľavu nevytvára. Zľava sa riadi kupónom.',
      'Vypnutie kupónu v detaile QR kódu platí pre všetky QR kódy a odkazy s týmto kupónom.',
    ],
  },
  {
    id: 'darcekove-poukazy', group: 'poukazy', icon: 'gift', href: '#/poukazy', hrefLabel: 'Otvoriť Poukazy a zľavy',
    title: 'Ako nastaviť darčekové poukazy',
    summary: 'Hodnoty, platnosť, doručenie a kde sa dá poukaz použiť.',
    why: 'Darčekový poukaz si zákazník kúpi na webe ako darček. Obdarovaná ním potom zaplatí nákup. Zostatky stráži systém, takže sa nedá minúť viac, než je na poukaze.',
    steps: [
      'V Poukazoch a zľavách prepnite na Nastavenie poukazov.',
      'Zaškrtnite Poukazy sú v predaji na webe.',
      'Zadajte hodnoty v eurách oddelené medzerou, napríklad 50 100 200 (najviac 10 hodnôt).',
      'Nastavte platnosť v mesiacoch (1 až 60) a doručenie: e-mailom obdarovanej, PDF kupujúcej, alebo oboje.',
      'Vyberte, kde sa dá poukaz použiť (celý e-shop alebo vybrané kategórie) a či sa dá čerpať postupne.',
      'Kliknite na Uložiť nastavenie.',
    ],
    after: [
      'Ponuka poukazov na webe sa hneď aktualizuje.',
      'Po zaplatení systém poukaz vydá a doručí podľa nastavenia.',
    ],
    careful: ['Zmena platí len pre nové poukazy. Už predané poukazy si držia hodnotu, platnosť a pravidlá z dňa nákupu.'],
  },
  {
    id: 'poukazy-sprava', group: 'poukazy', icon: 'gift', href: '#/poukazy', hrefLabel: 'Otvoriť Poukazy a zľavy',
    title: 'Ako skontrolovať poukaz, zneplatniť ho alebo vrátiť peniaze na poukaz',
    summary: 'Zostatky, história použitia, zneplatnenie a vrátenie na poukaz.',
    why: 'Pri otázke zákazníka rýchlo zistíte, koľko mu na poukaze ostáva a kde ho použil. V prípade problému poukaz zneplatníte alebo mu peniaze vrátite späť na poukaz.',
    steps: [
      'V Poukazoch a zľavách prepnite na Darčekové poukazy. Vidíte zostatok, stav a platnosť. Kód poukazu je z bezpečnosti skrytý.',
      'Kliknutím na poukaz otvoríte jeho históriu: vydanie, použitia v objednávkach a vrátenia.',
      'Ak treba poukaz zneplatniť, napríklad pri podvodnej objednávke, uveďte dôvod a kliknite na Zneplatniť poukaz.',
      'Ak zákazník zaplatil objednávku poukazom a treba mu vrátiť peniaze, použite pod zoznamom poukazov formulár Vrátiť peniaze na poukaz: zadajte ID objednávky a sumu.',
    ],
    after: [
      'Pri vrátení na poukaz sa suma pripíše späť a uvidíte nový zostatok.',
      'Zneplatnený poukaz sa už nedá použiť.',
    ],
    careful: [
      'Zneplatnenie sa nedá vrátiť a zostatok prepadne.',
      'ID objednávky (začína sa order_) nájdete v histórii poukazu pri položke „použitý v objednávke“.',
      'Systém nedovolí vrátiť viac, než bolo poukazom zaplatené.',
    ],
  },
  {
    id: 'pouzivatelia', group: 'nastavenia', icon: 'users', href: '#/nastavenia', hrefLabel: 'Otvoriť Nastavenia',
    title: 'Ako pozvať ďalšieho správcu',
    summary: 'Pozvánka pre kolegyňu alebo kolegu do administrácie.',
    why: 'Ak vám s obchodom niekto pomáha, má mať vlastný účet. Nemusíte nikomu dávať svoje heslo.',
    steps: [
      'V Nastaveniach prepnite hore na Používatelia.',
      'V časti Pozvať ďalšieho správcu zadajte e-mail, kliknite na Vytvoriť pozvánku a potvrďte.',
      'Odkaz pozvánky sa skopíruje. Pošlite ho novému správcovi sami, e-mailom alebo správou.',
      'Nový správca otvorí odkaz, zadá e-mail, meno a heslo (aspoň 12 znakov) a rovno sa prihlási.',
    ],
    after: [
      'Po prijatí pozvánky sa nový správca zobrazí v zozname Správcovia.',
      'Kým pozvánka čaká, nájdete ju v časti Čakajúce pozvánky. Odkaz tam skopírujete znova, pozvánku obnovíte alebo zrušíte.',
    ],
    careful: [
      'Nový správca začína s plnými právami (je vlastník). Ak nepotrebuje meniť ceny, zľavy ani prístupy, prepnite mu v časti Zabezpečenie rolu na Asistent. Pozývajte len ľudí, ktorým dôverujete.',
      'Pozvánka sa sama e-mailom neodošle, odkaz treba poslať.',
      'Odkaz je jednorazový a má obmedzenú platnosť. Pri registrácii treba použiť e-mail, pre ktorý bola pozvánka vytvorená.',
    ],
  },
  {
    id: 'zabezpecenie', group: 'nastavenia', icon: 'check', href: '#/nastavenia', hrefLabel: 'Otvoriť Nastavenia',
    title: 'Ako zapnúť dvojfaktorové overenie a spravovať role',
    summary: 'Prihlasovanie kódom z telefónu a rozdelenie práv medzi správcami.',
    why: 'Heslo samotné stačí len na chvíľu. S dvojfaktorovým overením sa do administrácie dostane iba ten, kto má telefón s kódom (alebo jeden zo záložných kódov). Role zase hovoria, kto smie meniť ceny a prístupy.',
    steps: [
      'V Nastaveniach prepnite hore na Zabezpečenie (vidí ho len vlastník).',
      'V časti Dvojfaktorové overenie kliknite na Zapnúť dvojfaktorové overenie.',
      'Naskenujte QR kód v telefóne aplikáciou na overovanie (napr. Google Authenticator, 1Password, Aegis). Ak QR naskenovať neviete, vložte vypísaný tajný kód ručne do aplikácie.',
      'Vložte šesťmiestny kód, ktorý v aplikácii vidíte, a kliknite na Potvrdiť a zapnúť.',
      'Záložné kódy, ktoré sa zobrazia raz, si vytlačte alebo stiahnite a odložte na bezpečné miesto.',
      'V časti Administrátori a ich roly môžete ktorémukoľvek správcovi prepnúť rolu na Asistent. Rolu uložíte tlačidlom Uložiť rolu.',
    ],
    after: [
      'Od najdajšieho prihlásenia pýta administrácia heslo aj kód z aplikácie.',
      'Ak stratíte telefón, prihlásite sa jedným zo záložných kódov. Nové záložné kódy vygenerujete tlačidlom Vygenerovať nové záložné kódy (staré tým stratia platnosť).',
      'Vypnutie overenia vyžaduje platný kód z aplikácie – to je dôkaz, že ste naozaj prihlásený.',
    ],
    careful: [
      'Záložné kódy sa zobrazia iba raz. Bez nich sa do administrácie nedostanete, ak prídete o telefón.',
      'Vlastníka nemožno znížiť na asistenta, ak je posledný. Aby administrácia mala vlastníka vždy, musíte najprv pozvatť ďalšieho.',
      'Asistent nevidí ceny, zľavy, vernostné úrovne, pridávanie prístupov ani role. Dokonca ani vtedy, keď prejde na takúto stránku priamo – administrácia mu vysvetlí, že prístup nemá.',
    ],
  },
  {
    id: 'vzhlad', group: 'nastavenia', icon: 'cog', href: '#/nastavenia', hrefLabel: 'Otvoriť Nastavenia',
    title: 'Ako si zmeniť farby administrácie',
    summary: 'Vlastné farby bočného panela a akcentu.',
    why: 'Administráciu používate každý deň, preto si ju môžete prispôsobiť.',
    steps: [
      'V Nastaveniach je prvý prepínač Vzhľad.',
      'Zvoľte hlavnú farbu (bočný panel) a akcent.',
      'Kliknite na Uložiť motív. Pôvodné farby vrátite tlačidlom Obnoviť ANASTASIA.',
    ],
    after: [
      'Farby sa uložia k vášmu účtu, takže ich uvidíte na každom zariadení. Ostatní správcovia majú vlastné nastavenie.',
      'Web pre zákazníkov sa tým nemení.',
    ],
    careful: ['Vyberte farby s dostatočným kontrastom, aby bol text v bočnom paneli dobre čitateľný.'],
  },
  {
    id: 'doprava-platby', group: 'nastavenia', icon: 'cog', href: '#/nastavenia', hrefLabel: 'Otvoriť Nastavenia',
    title: 'Doprava, platby a sklady',
    summary: 'Kde skontrolujete, ako sa platí a doručuje.',
    why: 'Na jednom mieste vidíte, v akej mene a do akých krajín predávate, aké platby a doprava sú zapnuté a odkiaľ sa tovar posiela.',
    steps: [
      'V Nastaveniach prepnite na Doprava a platby.',
      'Predajné regióny a platby: mena, krajiny a zapnuté platobné metódy.',
      'Spôsoby dopravy: názov, cena a dopravca.',
      'Sklady: odkiaľ sa tovar posiela.',
    ],
    after: [],
    careful: [
      'Tu vidíte predajné krajiny, platobné metódy, spôsoby dopravy s cenami a sklad.',
      `Ak potrebujete zmenu, napíšte na ${SUPPORT_EMAIL}.`,
    ],
  },
];

// Krátka pomoc na stránke (tlačidlo „Ako to funguje“ pri nadpise). Kľúč = časť adresy (#/objednavky → 'objednavky').
export const PAGE_HELP = {
  '': {
    title: 'Ako funguje Prehľad',
    text: 'Prehľad ukazuje, čo dnes potrebuje vašu pozornosť: objednávky na vybavenie, nové správy, dnešné konzultácie a pripravenosť obchodu na predaj.',
    points: ['Kliknutím na číslo alebo úlohu prejdete tam, kde vec vybavíte.', 'Body „bráni predaju“ v Pripravenosti obchodu riešte ako prvé.'],
    guides: ['prehlad', 'pripravenost'], tour: true,
  },
  objednavky: {
    title: 'Ako fungujú Objednávky',
    text: 'Každá karta je jedna objednávka so stavom platby a vybavenia. Kliknutím otvoríte detail so záložkami Prehľad, Položky, Odoslanie a Platby.',
    points: ['Pripraviť a Označiť ako odoslanú nájdete v záložke Odoslanie. Zákazníkovi potom odíde e-mail.', 'Prijať platbu a Vrátiť peniaze nájdete v záložke Platby. Prevod a dobierku potvrdíte ručne, keď peniaze prídu.', 'Každú akciu pred vykonaním potvrdíte.'],
    guides: ['objednavka-vybavit', 'objednavka-platby', 'objednavka-prevod-dobierka', 'objednavka-zrusit'],
  },
  produkty: {
    title: 'Ako fungujú Produkty',
    text: 'Tu spravujete katalóg. Kliknutím na kartu produkt upravíte, tlačidlom Pridať produkt založíte nový.',
    points: ['Produkt sa dá zverejniť, až keď má cenu, predajný kanál, typ produktu a kód.', 'Konečnú cenu v košíku prepočíta systém automaticky na serveri.', 'Názvy a poradie videí či nahrávok upravíte v časti Zakúpený obsah; pôvodné súbory aj prístupy zostávajú zachované.', 'Zmeny na celej stránke uložíte jedným tlačidlom Uložiť.'],
    guides: ['produkt-pridat', 'produkt-upravit', 'produkt-akcia', 'kategorie'],
  },
  kategorie: {
    title: 'Ako fungujú Kategórie',
    text: 'Kategórie triedia produkty v ponuke. Kliknutím na kategóriu ju upravíte, tlačidlom Nová kategória pridáte ďalšiu.',
    points: ['Produkt do kategórie zaradíte v úprave produktu.', 'Neaktívnu kategóriu zákazníka v ponuke nevidia.'],
    guides: ['kategorie'],
  },
  zakaznicky: {
    title: 'Ako fungujú Zákazníci',
    text: 'Zoznam zákazníkov s registrovaným účtom aj tých, ktoré nakúpili ako hosť. Prepínačom Prístupy a knižnica uvidíte ich digitálne prístupy.',
    points: ['V detaile opravíte meno a zaradenie do skupiny.', 'Prístupy sa pridelia automaticky po zaplatení.'],
    guides: ['zakaznicky'],
  },
  konzultacie: {
    title: 'Ako fungujú Konzultácie',
    text: 'Tri prepínače: Rezervácie (termíny zákazníkov), Typy konzultácií (čo ponúkate a za koľko) a Dostupnosť (kedy máte čas).',
    points: ['Web ponúkne termíny len z vašej dostupnosti, podľa dĺžky a pauzy typu konzultácie.', 'Pri zrušení potvrdeného termínu dostane zákazník e-mail.'],
    guides: ['konzultacie-rezervacie', 'konzultacie-nastavit'],
  },
  spravy: {
    title: 'Ako fungujú Správy',
    text: 'Konverzácie so zákazníkmi. Otvorením sa konverzácia označí ako prečítaná, odpoveď napíšete dole.',
    points: ['Zákazníkovi po odpovedi príde e-mailové upozornenie.', 'Vybavenú konverzáciu uzavrite, dá sa znova otvoriť.', 'Tlačidlom Nová správa napíšete zákazníkovi, ktorý vám ešte neodpovedal – vyhľadáte ho podľa mena alebo e-mailu.'],
    guides: ['spravy'],
  },
  poukazy: {
    title: 'Ako fungujú Poukazy a zľavy',
    text: 'Tri prepínače: Kupóny a zľavy (kódy so zľavou), Darčekové poukazy (predané poukazy a ich zostatky) a Nastavenie poukazov (čo sa predáva na webe).',
    points: ['Kupón platí na celý nákup, zľavu prepočíta systém pri nákupe.', 'Zmena nastavenia poukazov platí len pre nové poukazy.'],
    guides: ['kupony', 'darcekove-poukazy', 'poukazy-sprava'],
  },
  obsah: {
    title: 'Ako funguje Obsah a e-maily',
    text: 'V prepínači E-maily si pozriete náhľad každého e-mailu, ktorý obchod posiela automaticky. V prepínači Newsletter vidíte prihlásenia na odber.',
    points: ['E-maily nemusíte posielať ručne, odchádzajú samy.', 'Úpravu textu e-mailu pre vás pripravíme, stačí napísať.',
      'V prepínači Stránky a texty upravíte texty na webe. Ak medzitým zmení text niekto iný, administrácia vás na to upozorní a ponúkne obnoviť stránku.',
      'Do textu sa dajú vložiť len jednoduché značky (odseky, tučné písmo, odrážky, nadpisy a odkazy) – skripty a nebezpečné odkazy sa odstránia automaticky.'],
    guides: ['emaily'],
  },
  nastavenia: {
    title: 'Ako fungujú Nastavenia',
    text: 'Vzhľad administrácie, prehľad dopravy, platieb a skladov, správa používateľov s pozvánkami a zabezpečenie prístupu.',
    points: ['V časti Doprava a platby vidíte platobné metódy a spôsoby dopravy s cenami.', 'V časti Zabezpečenie zapnete dvojfaktorové overenie a spravujete role správcov (vlastník a asistent).', 'Asistent nevidí ceny, zľavy, vernostné úrovne, pridávanie prístupov ani role.'],
    guides: ['pouzivatelia', 'zabezpecenie', 'vzhlad', 'doprava-platby'],
  },
};
