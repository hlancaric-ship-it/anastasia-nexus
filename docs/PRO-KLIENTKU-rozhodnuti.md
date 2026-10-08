# ANASTASIA — proč současné řešení neudržet a kudy dál

**Pro:** Lucia Rogožanová (LUCRAT s.r.o.) · **Od:** L-Code Dynamics · **7. 10. 2026**
**Účel:** abyste se mohla rozhodnout s plnými informacemi. Žádné strašení, žádný prodej na sílu — jen co jsme našli a co z toho poctivě plyne.

---

## 1. Co dnes reálně máte (aktuální řešení)

Tři weby, které vypadají jako jedna značka, ale uvnitř jsou **tři oddělené systémy různého původu, které spolu technicky nekomunikují**:

| Web | Role | Postavené na | Stav technologie |
|---|---|---|---|
| **anastasiaoz.eu** | e-shop (prodej, platby, sklad) | Umbraco 8 + .NET (řešení na míru) | **po konci podpory** (od 2/2025 bez bezpečnostních záplat) |
| **anastasia.academy** | vzdělávací web | AI generátor atoms.dev (šablona) | moderní, ale **zabezpečení od výroby vypnuté** |
| **aianastasia.com** | AI lékový poradce | tentýž AI generátor | moderní, **stejná vypnutá ochrana** |

**Jednou větou:** jeden e-shop na mrtvé technologii + dvě „dvojčata" postavená z šablony, která se nikdy nedodělala do bezpečného stavu.

---

## 2. Pohled na současnou strukturu (proč je to problém sám o sobě)

- **Není společný základ.** Každý web řeší přihlašování, data a logiku po svém. Nic se nesdílí. Každá změna se musí dělat třikrát, každá chyba existuje na více místech.
- **Dvojí závislost na cizím.** E-shop je svázaný s jedním dodavatelem a knihovnou, kterou máme jen jako „černou skříňku". Dvojčata jsou svázaná s platformou atoms.dev — **nejste pánem vlastního systému.**
- **Vše pod jedním účtem.** Domény, e-maily i správa všech tří webů visí na jednom účtu. Kdo se k němu dostane, má všechno.
- **Žádná obchodní logika navíc.** V kódu není ochrana marže, věrnostní program, velkoobchodní ceny ani sledování ambasadorských odkazů — tedy nic z toho, co by byznys reálně posunulo. Je to „holý web", ne systém pro růst.

---

## 3. Cesta do pekel — proč současné řešení neudržet

Toto není o tom, že „je tam pár chyb, opravíme a jede se dál". Problém je **systémový** a čas pracuje proti vám:

1. **Mrtvá platforma u e-shopu.** Umbraco 8 už nikdy nedostane bezpečnostní aktualizaci. Každý další měsíc = víc známých děr, které nikdo nezáplatuje. To se **nedá spravit opravou**, jen výměnou základu.
2. **Díry, které stojí peníze hned teď.** Systém umí označit objednávku jako zaplacenou bez skutečné platby a jdou obejít ceny a slevy. Čím déle to běží, tím víc tržby tiše uniká.
3. **Tikající právní riziko.** Osobní údaje zákazníků (u lékárny i kontakty lidí řešících zdraví) jsou přístupné nepovolaným. To není „kdyby" — je to GDPR průšvih čekající na okamžik, kdy si toho někdo všimne.
4. **Odpovědnost u lékárny.** Bezpečnostní pravidla AI poradce nejsou vynucená na serveru. Dá se z něj vymámit neomezená rada o lécích pod vaší hlavičkou — a náklady jdou na váš účet.
5. **Stavíte na písku.** Každá nová funkce přidaná na tento základ zdědí jeho vady a prohloubí závislost. Investice do rozvoje současného řešení se **nevrací** — jen odkládá a zdražuje nevyhnutelné.

**Shrnutí:** opravovat a rozvíjet současné řešení = platit za údržbu základu, který stejně budete muset vyměnit. To je ta cesta do pekel — draho, pomalu a pořád dokola.

---

## 4. Proč tomu řešení nedůvěřujeme (a není to dojem)

Nejde o jednu nešťastnou chybu. Jde o **vzorec**, který prozrazuje, jak se to stavělo:

- E-shop **neověřuje platby** podpisem ani částkou — základní věc, která se u prodeje nevynechává.
- Moderní weby mají **správně postavené přihlašování, ale nepoužívají ho** — ochrana je zapnutá „na oko" v prohlížeči, server nehlídá nic.
- **Hesla a tajné klíče jsou uložené čitelně** přímo v projektu.
- Administrace e-shopu je **volně dostupná z internetu** a web běží i **bez šifrování** — ověřeno naživo, ne jen z kódu.

Když takhle vypadají základy, nelze věřit, že „zbytek je v pořádku". **Standard, který tohle vyprodukoval, je ten důvod, proč nedoporučujeme na něm stavět dál.** A nejsme autorem ani jednoho z těch webů — nemáme důvod to nafukovat ani zakrývat. Každé tvrzení máme podložené konkrétním místem v kódu a klíčové věci ověřené na živém webu.

---

## 5. Proč rozhodnout pro nás

- **Nezávislý, doložený audit.** Prošli jsme všechny tři weby do hloubky + ověřili naživo. Dostáváte důkazy, ne dojmy — a férově i to, co je v pořádku.
- **Stavíme bezpečnost a správnost na první místo**, ne jako dodatek. To, co u současného řešení chybí (ověřování plateb, ochrana dat, kontrola kdo-co-smí), je u nás výchozí stav.
- **Vlastní prověřené nástroje.** Cenotvorbu řeší náš **Pricing Engine** (slevy, marže, kupóny deterministicky a bez obcházení), rizikové objednávky náš **SafeOrder**. Nemusíme to vymýšlet znovu — máme to odzkoušené.
- **Moderní, udržovaný základ** bez závislosti na jednom autorovi nebo jedné uzavřené platformě. Systém, který je **váš** a dá se na něm růst.
- **Myslíme na náklady.** Nestavíme nic zbytečného. Co umí existující nástroje a platformy nativně, nepřeprogramováváme.

---

## 6. Co navrhujeme

1. **E-shop:** postavit nově na moderním základu (Medusa.js), s naší cenotvorbou a ochranou objednávek. Do spuštění **okamžitě podepřít nejhorší díry** (platby, administrace, šifrování), aby mezitím netekly peníze a data.
2. **Academy + lékárna:** **opravit na místě** — jsou moderní, stačí doplnit chybějící zabezpečení (u obou najednou) a u lékárny přesunout pravidla AI na server. Zvážit sloučení pod jeden společný základ.
3. **Společně:** zabezpečit hlavní účet, vyměnit kompromitovaná hesla, sjednotit správu a konečně dát ekosystému **společné jádro**, na kterém se dá stavět růst.

**Co od vás potřebujeme k dotažení:** přístup k serverům a záloze dat, Google Search Console a vaši představu, kam chcete byznys posunout (velkoobchod? věrnost? ambasadoři?). Pak navrhneme přesný plán a cenu.

---

*Podrobné technické podklady (nálezy po webech s místy v kódu, infrastruktura, struktura dat) jsou k dispozici jako přílohy. Rádi vše projdeme osobně.*

---

## Dodatek — co ukázal živý přístup do systému (7. 10. 2026)

Se souhlasem a vaší součinností jsme se podívali přímo do administrace e-shopu. To, co jsme našli za pár minut, podtrhuje všechno výše — a zároveň jsme to hned zabezpečili:

**Kdo měl klíče od vašeho e-shopu:**
- 🔴 **Neznámý administrátor s plnými právy, naposledy přihlášený v dubnu 2022.** Cizí e-mailová adresa, čtyři roky „spící" účet s plným přístupem. Nikdo nevěděl, že tam je. To je přesně ten typ zapomenutého vstupu, přes který se přebírají weby.
- 🔴 **Dodavatel měl stále plný administrátorský přístup.**
- 🟠 **Vy — majitelka — jste měla jen roli „editor"**, tedy méně práv než dodavatel i než ten neznámý účet. To je obráceně, než má být.

**Co jsme s tím hned udělali (s vaším svolením):**
- ✅ neznámý i dodavatelský účet **deaktivovány**,
- ✅ vy povýšena na **plného administrátora**.
- Výsledek: klíče od webu drží už jen **vy a my**. Hotovo během pár minut — a zadarmo, ještě před jakoukoli migrací.

**Co to říká o současném stavu:**
- **Systém nikdo pořádně nehlídal.** Zapomenutý admin ze „2022" znamená, že správa přístupů roky nikoho nezajímala.
- **Nemáte kde si e-shop spravovat.** V administraci **není žádná sekce pro objednávky, produkty ani zákazníky** — ty existují jen „v databázi". Prakticky to znamená, že bez programátora si katalog ani objednávky sama nespravíte. (To je přesně to, co nový systém mění — viz dokument o vizi.)
- **Data byla v ohrožení i mimo web.** Kompletní export databáze e-shopu (včetně zašifrovaných hesel administrátorů a osobních údajů zákazníků) se nacházel volně v předávacím balíku. Takový soubor nepatří nikam, kde ho může někdo jen tak otevřít.

**Proč to zmiňujeme:** ne abychom strašili, ale protože to ukazuje rozdíl. Dostali jsme přístup — a místo „ano, funguje to" jsme během chvíle našli a zavřeli reálnou díru, kterou tam nechal někdo jiný. Takhle vypadá, když se o systém někdo stará.
