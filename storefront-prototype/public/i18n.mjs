// Běhová vícejazyčnost storefrontu (SK / EN / RU).
//
// Jazyk se rozhoduje v tomto pořadí:
//   1) ruční volba uživatele (localStorage) — má vždy přednost,
//   2) jazyk prohlížeče (navigator.languages / Accept-Language): sk|cs → SK, ru|uk|be → RU,
//   3) poloha návštěvníka (země z edge: Cloudflare `request.cf.country` / hlavička CF-IPCountry):
//      SK|CZ → SK, RU|UA|BY|KZ → RU, jinak EN,
//   4) fallback SK.
//
// Země se do stránky dostává přes `window.__ANA_COUNTRY__`, které vpisuje edge vrstva
// (viz edge/worker.mjs) nebo lokální náhled (serve.mjs, hlavička CF-IPCountry).
//
// SK je ZDRŽJELÝ zdroj. EN/RU jsou zatím strojové překlady označené jako NEKONTROLOVANÉ.
// Překládají se jen řetězce, které jsou v DICT (přesná shoda textového uzlu po trimu)
// a atributy alt / aria-label / title / placeholder. Obsah bez schváleného překladu je
// označen `data-sk-only` a v EN/RU se nad ním zobrazí poznámka v daném jazyce —
// smíchat jazyky se nesmí.

export const LANGS = ['sk', 'en', 'ru'];
export const LANG_KEY = 'ana-lang-manual';

export const DICT = {
  'Administrácia': ['Administration', 'Администрирование'],
  'Nakúpiť môžete aj bez registrácie.': ['You can shop without registering.', 'Покупать можно и без регистрации.'],
  'OBCHOD': ['SHOP', 'МАГАЗИН'],
  'ANASTASIA / KONTAKT': ['ANASTASIA / CONTACT', 'ANASTASIA / КОНТАКТЫ'],
  // r17: preklady pre /eshop, /reset-40, /kontakt a záložky účtu (doplnené o chýbajúce texty).
  'Veci, ktoré majú zmysel.': ['Things that make sense.', 'Вещи, которые имеют смысл.'],
  'Malé každodenné rituály. Objavte produkty a programy sveta ANASTASIA.': ['Small everyday rituals. Discover the products and programmes of the ANASTASIA world.', 'Небольшие ежедневные ритуалы. Откройте для себя продукты и программы мира ANASTASIA.'],
  'Hľadať produkt': ['Search product', 'Поиск товара'],
  'Kategória': ['Category', 'Категория'],
  'Výber': ['Selection', 'Подборка'],
  'Zostaňme v kontakte.': ['Let’s stay in touch.', 'Давайте останемся на связи.'],
  'Nová kapitola sa začína vami.': ['A new chapter starts with you.', 'Новая глава начинается с вас.'],
  'Priestor zastaviť sa. A začať znova.': ['A space to stop. And start again.', 'Место, чтобы остановиться. И начать заново.'],
  'Jednorazový vzdelávací program. Vlastné tempo. Šestnásť tematických týždňov.': ['A one-time educational programme. Your own pace. Sixteen thematic weeks.', 'Разовая обучающая программа. Ваш темп. Шестнадцать тематических недель.'],
  'Pozrieť úplný obsah programu →': ['See the full programme content →', 'Посмотреть всё содержимое программы →'],
  'Sme tu pre vás.': ['We are here for you.', 'Мы здесь для вас.'],
  'Prevádzkovateľ': ['Operator', 'Оператор'],
  'Zanechajte nám správu': ['Leave us a message', 'Оставьте нам сообщение'],
  'Vaše meno': ['Your name', 'Ваше имя'],
  'E-mail': ['Email', 'Электронная почта'],
  'Telefón': ['Phone', 'Телефон'],
  'O čom nám chcete napísať?': ['What would you like to write to us about?', 'О чём вы хотите нам написать?'],
  'Vaša správa': ['Your message', 'Ваше сообщение'],
  'Prečítal som si': ['I have read', 'Я прочитал'],
  'Prehľad': ['Overview', 'Обзор'],
  'Moje programy': ['My programmes', 'Мои программы'],
  'Chat s Luciou': ['Chat with Lucia', 'Чат с Люцией'],
  'Objednávky': ['Orders', 'Заказы'],
  'Materiály': ['Materials', 'Материалы'],
  'Môj profil': ['My profile', 'Мой профиль'],
  'Pre zobrazenie účtu sa prihláste.': ['Please sign in to view your account.', 'Войдите, чтобы увидеть свой аккаунт.'],
  'Prihlásiť sa': ['Sign in', 'Войти'],
  'Môj svet': ['My world', 'Мой мир'],
  'Vitajte vo svojom priestore.': ['Welcome to your space.', 'Добро пожаловать в ваше пространство.'],
  'Všetko vaše na jednom mieste. Programy, konzultácie, objednávky a správy.': ['Everything of yours in one place. Programmes, consultations, orders and messages.', 'Всё ваше в одном месте. Программы, консультации, заказы и сообщения.'],
  'Napísať Lucii': ['Write to Lucia', 'Написать Люции'],
  'Vlastné tempo. Vlastný priestor.': ['Your own pace. Your own space.', 'Свой темп. Своё пространство.'],
  'Celý program': ['The whole programme', 'Вся программа'],
  'O programe': ['About the programme', 'О программе'],
  'Najbližšia konzultácia': ['The nearest consultation', 'Ближайшая консультация'],
  'Zobraziť detail': ['Show details', 'Показать подробности'],
  'Posledná objednávka': ['The last order', 'Последний заказ'],
  'Moje objednávky': ['My orders', 'Мои заказы'],
  'Astrologický profil': ['Astrological profile', 'Астрологический профиль'],
  'Váš priestor pre súvislosti.': ['Your space for connections.', 'Ваше пространство для связей.'],
  'Farba priestoru': ['Colour of the space', 'Цвет пространства'],
  'Potrebujete pomoc?': ['Need help?', 'Нужна помощь?'],
  'Odhlásiť sa →': ['Sign out →', 'Выйти →'],
  // --- Navigace, hlavička, lišta, menu -----------------------------------
  'Obchod': ['Shop', 'Магазин'],
  'Všetky produkty': ['All products', 'Все товары'],
  'Kategórie': ['Categories', 'Категории'],
  'Vyhľadať': ['Search', 'Поиск'],
  'Navigácia obchodu': ['Shop navigation', 'Навигация магазина'],
  'Darčekový poukaz': ['Gift voucher', 'Подарочный сертификат'],
  'Novinky': ['New', 'Новинки'],
  'Bestsellery': ['Bestsellers', 'Хиты продаж'],
  'Kozmetika': ['Cosmetics', 'Косметика'],
  'Výživa': ['Nutrition', 'Питание'],
  'Domov': ['Home', 'Дом'],
  'Ľan': ['Linen', 'Лён'],
  'Programy': ['Programs', 'Программы'],
  'RESET 40+': ['RESET 40+', 'RESET 40+'],
  'Výuka': ['Learning', 'Обучение'],
  'Klub': ['Club', 'Клуб'],
  'Moja knižnica': ['My library', 'Моя библиотека'],
  'Moja knižnica.': ['My library.', 'Моя библиотека.'],
  'Údaje o narodení': ['Birth details', 'Данные о рождении'],
  'Späť': ['Back', 'Назад'],
  'Hodnota poukazu': ['Voucher value', 'Номинал сертификата'],
  'Vyberte variant produktu.': ['Choose a product option.', 'Выберите вариант товара.'],
  'Služby': ['Services', 'Услуги'],
  'Služby a miesta': ['Services and places', 'Услуги и места'],
  'Konzultácie': ['Consultations', 'Консультации'],
  'Supervízia': ['Supervision', 'Супервизия'],
  'Pre odborníkov': ['For professionals', 'Для специалистов'],
  'Astrológia': ['Astrology', 'Астрология'],
  'AI ANASTASIA': ['AI ANASTASIA', 'AI ANASTASIA'],
  'Zdravý svet': ['Healthy world', 'Здоровый мир'],
  'Aktuality': ['News', 'Новости'],
  'O Lucii': ['About Lucia', 'О Луции'],
  'Kontakt': ['Contact', 'Контакт'],
  'Menu': ['Navigation', 'Меню'],
  'Close': ['Dismiss', 'Закрыть'],
  'Zavrieť': ['Close', 'Закрыть'],
  'Zavrieť menu': ['Close menu', 'Закрыть меню'],
  'Hlavné menu': ['Main menu', 'Главное меню'],
  'Jazyk, menu a kontakt': ['Language, menu and contact', 'Язык, меню и контакты'],
  'Svet': ['World', 'Мир'],
  'Svet ANASTASIA': ['ANASTASIA world', 'Мир ANASTASIA'],
  'Informácie': ['Information', 'Информация'],
  'Zdravá lekáreň': ['Healthy pharmacy', 'Аптека здоровья'],
  'Denný stacionár Vyšná Slaná': ['Day centre Vysna Slana', 'Дневной стационар Вышна Слана'],
  'Online zdravotná konzultácia': ['Online health consultation', 'Онлайн-консультация по вопросам здоровья'],
  'KONZULTÁCIE': ['CONSULTATIONS', 'КОНСУЛЬТАЦИИ'],
  'Vyberte si termín.': ['Choose a time.', 'Выберите время.'],
  'Online konzultácie, supervízia, astrologický profil a personifikované protokoly.': ['Online consultations, supervision, an astrology profile and personalised protocols.', 'Онлайн-консультации, супервизия, астрологический профиль и персональные протоколы.'],
  'Podrobnosti a podmienky nájdete v detaile produktu.': ['See the product page for details and terms.', 'Подробности и условия указаны на странице продукта.'],
  'Astrologický profil zdravia a vitality': ['Astrology profile for health and vitality', 'Астрологический профиль здоровья и жизненной силы'],
  'Denný stacionár': ['Day centre', 'Дневной стационар'],
  'Vyšná Slaná': ['Vysna Slana', 'Вышна Слана'],
  'Každý deň má zmysel, keď ho žijeme spolu.': ['Every day matters when we live it together.', 'Каждый день имеет смысл, когда мы проживаем его вместе.'],
  'Spoločnosť, aktivitu, dôstojnosť a pokračovanie života, nie iba starostlivosť.': ['Companionship, activity, dignity and a life that continues, not care alone.', 'Общение, активность, достоинство и продолжающаяся жизнь, а не только уход.'],
  'Na úvod': ['Home', 'На главную'],
  'Aktuálne dianie v stacionári': ['What is happening at the day centre', 'Новости дневного стационара'],
  'Aktuálne dianie v stacionári ↗': ['What is happening at the day centre ↗', 'Новости дневного стационара ↗'],
  'Spoločenský priestor denného stacionára vo Vyšnej Slanej': ['Community room at the Vysna Slana day centre', 'Общественное пространство дневного стационара в Вышна-Слане'],
  'Poradenská miestnosť denného stacionára': ['Consultation room at the day centre', 'Консультационный кабинет дневного стационара'],
  'Oddychová časť denného stacionára': ['Lounge area at the day centre', 'Зона отдыха дневного стационара'],
  '← Na úvod': ['← Home', '← На главную'],
  'Rogožanová.': ['Rogozanova.', 'Рогожанова.'],
  'Mgr. Lucia Rogožanová, MBA': ['Lucia Rogozanova, Mgr., MBA', 'Луция Рогожанова, магистр делового администрирования'],
  'Zakladateľka ANASTASIA': ['Founder of ANASTASIA', 'Основательница ANASTASIA'],
  'FARMACEUTKA': ['PHARMACIST', 'ФАРМАЦЕВТ'],
  'Viac ako 30 rokov s ľuďmi': ['More than 30 years working with people', 'Более 30 лет рядом с людьми'],
  'Individuálny': ['Individual', 'Индивидуальный'],
  'prístup': ['approach', 'подход'],
  'Prevencia': ['Prevention', 'Профилактика'],
  'a vitalita': ['and vitality', 'и жизненная сила'],
  'Odbornosť': ['Expertise', 'Профессионализм'],
  'a dôvera': ['and trust', 'и доверие'],
  'O MNE': ['ABOUT ME', 'ОБО МНЕ'],
  'Volám sa Lucia Rogožanová.': ['My name is Lucia Rogozanova.', 'Меня зовут Луция Рогожанова.'],
  'Som farmaceutka, podnikateľka, tvorca projektu AI ANASTASIA a predovšetkým človek, ktorý verí, že zdravie sa nedá oddeliť od života ako celku.': ['I am a pharmacist, entrepreneur and creator of the AI ANASTASIA project. Above all, I believe health cannot be separated from life as a whole.', 'Я фармацевт, предприниматель и создатель проекта AI ANASTASIA. Прежде всего я верю, что здоровье нельзя отделить от жизни в целом.'],
  'Viac ako tridsať rokov pracujem s ľuďmi, ich príbehmi, obavami, nádejami a každodennými zdravotnými otázkami. Počas tejto cesty som pochopila jednu dôležitú vec:': ['For more than thirty years, I have worked with people, their stories, concerns, hopes and everyday health questions. Along the way I have understood one important thing:', 'Более тридцати лет я работаю с людьми, их историями, тревогами, надеждами и повседневными вопросами о здоровье. За это время я поняла одну важную вещь:'],
  'Mnohí ľudia nehľadajú ďalší liek. Hľadajú porozumenie.': ['Many people are not looking for another medicine. They are looking to be understood.', 'Многие люди ищут не очередное лекарство. Они ищут понимание.'],
  'Hľadajú niekoho, kto im pomôže zorientovať sa v množstve informácií, vysvetlí súvislosti a ukáže možné cesty bez strašenia, manipulácie alebo zbytočných sľubov.': ['They are looking for someone to help them navigate information, explain how things connect and show possible paths without fear, pressure or empty promises.', 'Они ищут того, кто поможет разобраться в информации, объяснит взаимосвязи и покажет возможные пути без запугивания, манипуляций и пустых обещаний.'],
  'Práve preto vznikla AI ANASTASIA.': ['That is why AI ANASTASIA was created.', 'Именно поэтому появился проект AI ANASTASIA.'],
  'Je to projekt, v ktorom spájam odborné farmaceutické vedomosti, moderné technológie umelej inteligencie, celoživotný záujem o zdravý životný štýl, prevenciu a zdravé starnutie.': ['This project brings together my pharmaceutical expertise, modern artificial intelligence, and a lifelong interest in healthy living, prevention and healthy ageing.', 'В этом проекте я объединяю фармацевтические знания, современные технологии искусственного интеллекта и давний интерес к здоровому образу жизни, профилактике и здоровому старению.'],
  'Verím, že budúcnosť zdravotníctva nebude stáť na výbere medzi človekom a umelou inteligenciou. Bude stáť na ich spolupráci.': ['I believe the future of healthcare will not depend on choosing between people and artificial intelligence. It will depend on their working together.', 'Я верю, что будущее здравоохранения будет строиться не на выборе между человеком и искусственным интеллектом, а на их сотрудничестве.'],
  'Umelá inteligencia dokáže spracovať obrovské množstvo informácií. Človek dokáže pochopiť súvislosti, životný príbeh a jedinečnosť každého jednotlivca.': ['Artificial intelligence can process vast amounts of information. People can understand context, life stories and each person’s individuality.', 'Искусственный интеллект умеет обрабатывать огромные объёмы информации. Человек способен понять контекст, историю жизни и неповторимость каждого.'],
  'Práve v tom vidím zmysel AI ANASTASIA.': ['That is where I see the purpose of AI ANASTASIA.', 'В этом я вижу смысл AI ANASTASIA.'],
  'AI JE NÁSTROJ.  ·  ODBORNOSŤ ZOSTÁVA ĽUDSKÁ.': ['AI IS A TOOL.  ·  EXPERTISE REMAINS HUMAN.', 'ИИ — ЭТО ИНСТРУМЕНТ.  ·  ЭКСПЕРТИЗА ОСТАЁТСЯ ЧЕЛОВЕЧЕСКОЙ.'],
  'TÉMY': ['AREAS OF INTEREST', 'ТЕМЫ'],
  'Okrem práce farmaceutky sa dlhodobo venujem témam:': ['Alongside my work as a pharmacist, I have a long-standing interest in:', 'Помимо работы фармацевтом, я давно занимаюсь темами:'],
  'zdravého starnutia a longevity': ['healthy ageing and longevity', 'здорового старения и долголетия'],
  'prevencie civilizačných ochorení': ['prevention of lifestyle-related disease', 'профилактики заболеваний образа жизни'],
  'práce so stresom a životnou rovnováhou': ['stress management and life balance', 'работы со стрессом и жизненного баланса'],
  'prírodných podporných postupov': ['natural supportive approaches', 'естественных поддерживающих методов'],
  'aromaterapie': ['aromatherapy', 'ароматерапии'],
  'homeopatie': ['homeopathy', 'гомеопатии'],
  'osobného rozvoja': ['personal development', 'личностного развития'],
  'vzťahu medzi telom, psychikou a životným štýlom': ['the relationship between body, mind and lifestyle', 'связи тела, психики и образа жизни'],
  'Som presvedčená, že zdravie nevzniká v ordinácii ani v lekárni.': ['I believe health is not created in a doctor’s office or a pharmacy.', 'Я убеждена, что здоровье создаётся не в кабинете врача и не в аптеке.'],
  'Vzniká každý deň v našich rozhodnutiach, návykoch, vzťahoch a postoji k sebe samým.': ['It is created every day through our choices, habits, relationships and how we treat ourselves.', 'Оно создаётся каждый день нашими решениями, привычками, отношениями и отношением к себе.'],
  'VYŠNÁ SLANÁ': ['VYSNA SLANA', 'ВЫШНА-СЛАНА'],
  'Žijem a pracujem vo Vyšnej Slanej, kde budujem nielen lekáreň ANASTASIA, ale aj projekty zamerané na podporu zdravia, vzdelávania a kvalitného života v každom veku.': ['I live and work in Vysna Slana, where I am building both the ANASTASIA pharmacy and projects that support health, learning and a good quality of life at every age.', 'Я живу и работаю в Вышна-Слане, где создаю аптеку ANASTASIA и проекты для поддержки здоровья, образования и достойной жизни в любом возрасте.'],
  'VÍZIA': ['VISION', 'ВИДЕНИЕ'],
  'Mojou víziou je vytvoriť priestor, kde sa odborné poznatky, moderné technológie a ľudskosť navzájom dopĺňajú.': ['My vision is to create a space where expertise, modern technology and humanity complement one another.', 'Моё видение — создать пространство, в котором знания, современные технологии и человечность дополняют друг друга.'],
  'Priestor, kde sa človek necíti ako diagnóza, ale ako jedinečná bytosť so svojím vlastným príbehom.': ['A space where people are not treated as a diagnosis, but as individuals with their own stories.', 'Пространство, где человек ощущает себя не диагнозом, а уникальной личностью со своей историей.'],
  'Ak ste sa rozhodli zveriť mi svoju dôveru, ďakujem.': ['If you have chosen to place your trust in me, thank you.', 'Спасибо, что решили доверить мне своё здоровье.'],
  'Budem sa snažiť, aby čas, ktorý spolu strávime, priniesol viac jasnosti, pochopenia a praktických krokov na vašej ceste k zdraviu a vitalite.': ['I will do my best to make our time together bring more clarity, understanding and practical steps on your path to health and vitality.', 'Я постараюсь, чтобы наше время вместе принесло ясность, понимание и практические шаги на пути к здоровью и жизненной силе.'],
  'Čím môžem pomôcť.': ['How I can help.', 'Чем я могу помочь.'],
  'ZISTIŤ VIAC': ['FIND OUT MORE', 'УЗНАТЬ БОЛЬШЕ'],
  'Zistiť viac': ['Find out more', 'Узнать больше'],
  'Lucia': ['Lucia', 'Луция'],
  'Farmaceutka': ['Pharmacist', 'Фармацевт'],
  'O mne': ['About me', 'Обо мне'],
  'Mnohí ľudia nehľadajú ďalší liek.': ['Many people are not looking for another medicine.', 'Многие люди ищут не очередное лекарство.'],
  'Hľadajú porozumenie.': ['They are looking to be understood.', 'Они ищут понимание.'],
  'Verím, že budúcnosť zdravotníctva nebude stáť na výbere medzi človekom a umelou inteligenciou.': ['I believe the future of healthcare will not depend on choosing between people and artificial intelligence.', 'Я верю, что будущее здравоохранения будет строиться не на выборе между человеком и искусственным интеллектом.'],
  'Bude stáť na ich spolupráci.': ['It will depend on their working together.', 'Оно будет строиться на их сотрудничестве.'],
  'je nástroj.  ·  Odbornosť zostáva ľudská.': ['is a tool.  ·  Expertise remains human.', '— это инструмент.  ·  Экспертиза остаётся человеческой.'],
  'AI je nástroj.  ·  Odbornosť zostáva ľudská.': ['AI is a tool.  ·  Expertise remains human.', 'Искусственный интеллект — это инструмент.  ·  Экспертиза остаётся человеческой.'],
  'Témy': ['Areas of interest', 'Темы'],
  'Vízia': ['Vision', 'Видение'],
  'Osobne a vo Vyšnej Slanej': ['In person in Vysna Slana', 'Лично в Вышна-Слане'],
  'Lucia Rogožanová v priestoroch': ['Lucia Rogozanova at the', 'Луция Рогожанова в пространстве'],
  'Lucia Rogožanová v priestoroch ANASTASIA': ['Lucia Rogozanova at ANASTASIA', 'Луция Рогожанова в пространстве ANASTASIA'],
  'Svetlý interiér lekárne': ['Bright pharmacy interior', 'Светлый интерьер аптеки'],
  'Svetlý interiér lekárne ANASTASIA': ['Bright ANASTASIA pharmacy interior', 'Светлый интерьер аптеки ANASTASIA'],
  'Denný stacionár  Vyšná Slaná': ['Day centre Vysna Slana', 'Дневной стационар Вышна-Слана'],
  'Programy a služby': ['Programs and services', 'Программы и услуги'],
  'Sprevádzanie': ['Accompanying', 'Сопровождение'],
  'Pharmanews': ['Pharmanews', 'Pharmanews'],
  'Recenzie produktov': ['Product reviews', 'Отзывы о товарах'],
  'Recenzie zákazníkov': ['Customer reviews', 'Отзывы клиентов'],
  'Cookies': ['Cookies', 'Файлы cookie'],
  'Všetky kategórie': ['All categories', 'Все категории'],
  'Názov produktu…': ['Product name…', 'Название товара…'],
  'Personifikovaný zdravotný protokol': ['Personalised health protocol', 'Персонализированный протокол здоровья'],
  'Astrologický profil zdravia a osobných predispozícií': ['Astrological health and personal predisposition profile', 'Астрологический профиль здоровья и личных предрасположенностей'],
  'AI ANASTASIA RESET 40+': ['AI ANASTASIA RESET 40+', 'AI ANASTASIA RESET 40+'],
  'Výuka vedomého vnímania': ['Conscious perception course', 'Курс осознанного восприятия'],
  'Tvoj pleťový krém': ['Your face cream', 'Ваш крем для лица'],
  'Tvoja pleťová voda': ['Your facial toner', 'Ваш тоник для лица'],
  'CHRÍPKOVÝ PRÁŠOK': ['FLU POWDER', 'ПОРОШОК ОТ ГРИППА'],
  'Nič nemusíš': ['You do not have to do anything', 'Тебе ничего не нужно делать'],
  'Tvoj sprcháč': ['Your shower gel', 'Ваш гель для душа'],
  'JANČOVA antibiotická zmes': ['JANCA ANTIBIOTIC SPICE BLEND', 'АНТИБАКТЕРИАЛЬНАЯ СМЕСЬ ЯНЧА'],
  'Tvoja pleťová voda osviežujúca': ['Your refreshing facial toner', 'Ваш освежающий тоник для лица'],
  'Nevyhnutné cookies používame na fungovanie webu a nákupu. Voliteľné cookies použijeme iba s vaším súhlasom. Voľbu môžete kedykoľvek zmeniť v Nastaveniach cookies. Podrobnosti nájdete v informáciách o cookies a ochrane osobných údajov.': ['We use essential cookies to run the website and process purchases. We use optional cookies only with your consent. You can change your choice at any time in Cookie settings. See our cookie and privacy information for details.', 'Необходимые файлы cookie нужны для работы сайта и покупок. Необязательные файлы cookie используются только с вашего согласия. Вы можете изменить свой выбор в любое время в настройках файлов cookie. Подробнее — в информации о файлах cookie и защите персональных данных.'],
  'Odmietnuť voliteľné': ['Reject optional', 'Отклонить необязательные'],
  'Nastaviť': ['Settings', 'Настроить'],
  'Prijať všetky': ['Accept all', 'Принять все'],
  'Uložiť nastavenia': ['Save settings', 'Сохранить настройки'],
  'Nevyhnutné': ['Essential', 'Необходимые'],
  'Analytické': ['Analytics', 'Аналитические'],
  'Marketingové': ['Marketing', 'Маркетинговые'],
  'Podrobnosti nájdete v': ['For details, see', 'Подробнее см. в разделе'],
  'informáciách o cookies a ochrane osobných údajov': ['cookie and privacy information', 'информации о файлах cookie и защите персональных данных'],
  'Nevyhnutné technológie sa používajú len v rozsahu potrebnom na prenos komunikácie alebo na službu, ktorú si výslovne vyžiadate, napríklad zachovanie košíka, prihlásenie a uloženie voľby súhlasu.': ['Essential technologies are used only as needed to transmit communications or provide a service you explicitly request, such as keeping your cart, signing in and saving your consent choice.', 'Необходимые технологии используются только для передачи сообщений или оказания запрошенной вами услуги, например сохранения корзины, входа в систему и сохранения выбора согласия.'],
  'Nastavenia cookies': ['Cookie settings', 'Настройки Cookies'],
  'Odstúpenie od zmluvy': ['Withdrawal of contract', 'Расторжение договора'],
  'EN / RU už čoskoro': ['EN / RU coming soon', 'EN / RU скоро'],
  'Košík (': ['Cart (', 'Корзина ('],
  'AI ANASTASIA Academy': ['AI ANASTASIA Academy', 'AI ANASTASIA Academy'],
  'Biokozmetika': ['Biocometics', 'Биокосметика'],
  // Texty úvodu 1:1 podľa pôvodného webu.
  'Táto časť webu patrí projektu ANASTASIA. Nie ako ponuka riešení, ale ako priestor, kde veci nemusia byť tlačené, vysvetľované ani riadené. Zdravý svet nie je ideál, ku ktorému sa treba dopracovať. Nie je to cieľ, ktorý treba dosiahnuť prácou na sebe. Je to možnosť, ktorá sa objavuje vtedy, keď prestaneme mať pocit, že so sebou musíme niečo robiť.': ['This part of the website belongs to the ANASTASIA project. It is not an offer of solutions, but a space where things do not have to be hurried, explained or managed. A healthy world is not an ideal to work towards. It is not a goal to be achieved by working on yourself. It is a possibility that appears when we stop feeling that we must do something with ourselves.', 'Эта часть сайта принадлежит проекту ANASTASIA. Это не предложение решений, а пространство, где ничто не нужно форсировать, объяснять или контролировать. Здоровый мир — не идеал, к которому нужно стремиться. Это не цель, которую нужно достигать работой над собой. Это возможность, которая появляется, когда мы перестаём чувствовать, что обязаны что-то с собой делать.'],
  'Priestor pre zdravie, poznanie a vedomý život.': ['A space for health, knowledge and conscious living.', 'Пространство для здоровья, знания и осознанной жизни.'],
  'Kolekcia': ['Collection', 'Коллекция'],
  'AI ANASTASIA Longevity Academy': ['AI ANASTASIA Longevity Academy', 'AI ANASTASIA Longevity Academy'],
  'Čo môžeme spolu riešiť?': ['What can we work on together?', 'Что мы можем решать вместе?'],
  'Čo získate?': ['What do you gain?', 'Что вы получаете?'],
  'Môžeš tu nájsť audio záznamy, texty, priestory bez vysvetlenia.': ['You will find audio recordings, texts and spaces without explanation here.', 'Здесь найдёте аудиозаписи, тексты, пространства без объяснений.'],
  '16 týždňov, ktoré môžu zmeniť váš pohľad na zdravie, energiu a starnutie.': ['16 weeks that can change the way you look at health, energy and ageing.', '16 недель, которые могут изменить ваш взгляд на здоровье, энергию и старение.'],
  'Kde veci nemusia byť urýchľované, vysvetľované ani riadené.': ['Where things do not have to be hurried, explained or managed.', 'Где ничто не нужно форсировать, объяснять или контролировать.'],
  'Otázka k produktu, programu alebo konzultácii? Tu je priestor pre vás.': ['A question about a product, a programme or a consultation? Here is space for you.', 'Вопрос о продукте, программе или консультации? Здесь есть место для вас.'],
  'AI ANASTASIA ACADEMY': ['AI ANASTASIA ACADEMY', 'AI ANASTASIA ACADEMY'],
  'ACADEMY': ['ACADEMY', 'ACADEMY'],
  'BIOKOZMETIKA': ['BIOCOSMETICS', 'БИОКОСМЕТИКА'],
  'Zdravé doplnky výživy': ['Healthy nutrition supplements', 'Здоровые пищевые добавки'],
  'Môj účet': ['My account', 'Мой аккаунт'],
  'Účet': ['Account', 'Аккаунт'],
  'Košík': ['Cart', 'Корзина'],
  'Zavrieť': ['Close', 'Закрыть'],
  'Spolu': ['Total', 'Итого'],
  'Zobraziť košík': ['View cart', 'Открыть корзину'],
  'Pokračovať k pokladni': ['Continue to checkout', 'Перейти к оформлению'],
  'Košík je prázdny.': ['Your cart is empty.', 'Корзина пуста.'],
  'Znížiť množstvo': ['Decrease quantity', 'Уменьшить количество'],
  'Zvýšiť množstvo': ['Increase quantity', 'Увеличить количество'],
  'Odstrániť': ['Remove', 'Удалить'],
  'Preskočiť na obsah': ['Skip to content', 'Перейти к содержимому'],
  'Počet kusov': ['Number of items', 'Количество товаров'],
  'ANASTASIA — domov': ['ANASTASIA — home', 'ANASTASIA — главная'],
  'ANASTASIA OZ': ['ANASTASIA OZ', 'ANASTASIA OZ'],
  'ANASTASIA.ACADEMY': ['ANASTASIA.ACADEMY', 'ANASTASIA.ACADEMY'],
  'ANASTASIA OZ — Light for the Future': ['ANASTASIA OZ — Light for the Future', 'ANASTASIA OZ — Light for the Future'],
  'ANASTASIA — Light for the Future': ['ANASTASIA — Light for the Future', 'ANASTASIA — Light for the Future'],
  'ANASTASIA ACADEMY': ['ANASTASIA ACADEMY', 'ANASTASIA ACADEMY'],
  'Zavolať ANASTASIA': ['Call ANASTASIA', 'Позвонить в ANASTASIA'],
  'Facebook': ['Facebook', 'Facebook'],
  'YouTube': ['YouTube', 'YouTube'],
  'Už čoskoro': ['Coming soon', 'Скоро'],
  'Obchodné podmienky': ['Terms of business', 'Условия продажи'],
  'Súkromie a GDPR': ['Privacy and GDPR', 'Конфиденциальность и GDPR'],
  'Reklamácie': ['Complaints', 'Жалобы'],
  '© 2026 ANASTASIA · Light for the Future': ['© 2026 ANASTASIA · Light for the Future', '© 2026 ANASTASIA · Light for the Future'],

  // --- Úvod --------------------------------------------------------------
  'Kozmetika na mieru': ['Cosmetics made to measure', 'Косметика на заказ'],
  'Bylinky Hildegardy': ['Hildegard’s herbs', 'Травы Хильдегарды'],
  'Vstúpte': ['Enter', 'Войти'],
  'alebo posuňte': ['or scroll', 'или прокрутите'],
  'Posuňte nadol': ['Scroll', 'Прокрутите'],
  'Prejsť ďalej': ['Continue', 'Продолжить'],
  'Vitajte.': ['Welcome.', 'Добро пожаловать.'],
  'Táto časť webu patrí projektu ANASTASIA. Nie ako ponuka riešení, ale ako priestor, kde veci nemusia byť tlačené, vysvetľované ani riadené.': ['This part of the site belongs to the ANASTASIA project. Not as an offer of solutions, but as a space where things do not have to be pushed, explained or managed.', 'Эта часть сайта принадлежит проекту ANASTASIA. Не как предложение решений, а как пространство, где ничто не нужно форсировать, объяснять или контролировать.'],
  'Zdravý svet nie je ideál, ku ktorému sa treba dopracovať.': ['The healthy world is not an ideal to work towards.', 'Здоровый мир — не идеал, к которому нужно стремиться.'],
  'Vstúpte do zdravého sveta': ['Enter the healthy world', 'Войдите в здоровый мир'],
  'Zvuk vypnutý': ['Sound off', 'Звук выключен'],
  'Spustiť zvuk': ['Play sound', 'Включить звук'],
  'Klub a kontakt': ['Club and contact', 'Клуб и контакты'],
  'Lucia Rogožanová · Light for the Future': ['Lucia Rogozanova · Light for the Future', 'Луция Рогожанова · Light for the Future'],
  'Lucia Rogožanová ·': ['Lucia Rogozanova ·', 'Луция Рогожанова ·'],
  'Prehrať video': ['Play video', 'Воспроизвести видео'],
  'Pozastaviť zvuk': ['Pause sound', 'Приостановить звук'],
  'Vypnúť zvuk': ['Mute sound', 'Выключить звук'],
  'Zvuk zapnutý': ['Sound on', 'Звук включён'],
  'Zapnúť zvuk': ['Turn on sound', 'Включить звук'],
  'Pozastaviť video': ['Pause video', 'Пауза видео'],
  'Ďalšia skladba': ['Next track', 'Следующий трек'],
  'Ovládanie videa a zvuku': ['Video and sound controls', 'Управление видео и звуком'],
  'Nočná obloha nad tmavou krajinou': ['Night sky over a dark landscape', 'Ночное небо над тёмным пейзажем'],
  'Strom v krajine': ['Tree in the landscape', 'Дерево в пейзаже'],
  'Světlo v lese': ['Light in the forest', 'Свет в лесу'],
  'Mgr. Lucia Rogožanová, zakladateľka ANASTASIA': ['Mgr. Lucia Rogozanova, founder of ANASTASIA', 'Магистр. Луция Рогожанова, основательница ANASTASIA'],

  // --- Patička a newsletter ------------------------------------------------
  'Zostaňme v\u00a0kontakte.': ['Stay in\u00a0touch.', 'Оставайтесь на\u00a0связи.'],
  'Odoberať': ['Subscribe', 'Подписаться'],
  'Občasný list o nových programoch, rituáloch a kolekciách. Bez zhonu.': ['An occasional letter about new programs, rituals and collections. No rush.', 'Изредка письмо о новых программах, ритуалах и коллекциях. Без спешки.'],
  'Váš e-mail': ['Your email', 'Ваш адрес электронной почты'],

  // --- Tlačítka a akce ------------------------------------------------------
  'Do košíka': ['Add to cart', 'В корзину'],
  'Pridať do košíka': ['Add to cart', 'В корзину'],
  'Kúpiť program': ['Buy program', 'Купить программу'],
  'Spoznajte program': ['Discover the program', 'Узнать о программе'],
  'Pokračovať na objednávku': ['Continue to checkout', 'Перейти к оформлению'],
  'Objednať': ['Order', 'Заказать'],
  'Odoslať správu': ['Send message', 'Отправить сообщение'],
  'Celý obchod': ['Whole shop', 'Весь магазин'],
  'Prihlásenie': ['Sign in', 'Вход'],
  'Registrácia': ['Registration', 'Регистрация'],
  'Zaregistrovať sa': ['Create an account', 'Зарегистрироваться'],
  'Vytvoriť účet': ['Create an account', 'Создать аккаунт'],
  'Meno': ['First name', 'Имя'],
  'Priezvisko': ['Last name', 'Фамилия'],
  'Súhlasím s': ['I agree to the', 'Я соглашаюсь с'],
  'VOP': ['terms and conditions', 'условиями продажи'],
  'ochranu osobných údajov': ['privacy policy', 'политикой конфиденциальности'],
  'Beriem na vedomie': ['I acknowledge the', 'Я ознакомился с'],
  'Súhlasím so zasielaním noviniek e-mailom': ['I agree to receive email newsletters', 'Я согласен получать новости по электронной почте'],
  'Vytvoriť účet →': ['Create an account →', 'Создать аккаунт →'],
  'Poslať prihlasovací odkaz →': ['Send sign-in link →', 'Отправить ссылку для входа →'],
  'Objaviť Zdravý svet': ['Discover Healthy world', 'Открыть Здоровый мир'],
  'Pozrieť konzultácie': ['View consultations', 'Смотреть консультации'],
  'Pozrieť produkt': ['View product', 'Смотреть товарь'],
  'Napíšte nám': ['Write to us', 'Напишите нам'],
  'Kontaktujte nás': ['Contact us', 'Свяжитесь с нами'],
  'Objavte svet ANASTASIA': ['Discover the ANASTASIA world', 'Откройте мир ANASTASIA'],

  'Light for the Future': ['A light for the future', 'Свет для будущего'],
  'Kto je Lucia': ['Who is Lucia', 'Кто такая Луция'],
  'Mgr. Lucia Rogožanová, MBA': ['Mgr. Lucia Rogozanova, MBA', 'Магистр делового администрирования Луция Рогожанова'],
  'Farmaceutka a zakladateľka ANASTASIA': ['Pharmacist and founder of ANASTASIA', 'Фармацевт и основатель ANASTASIA'],
  'Čo vzniká z rozhovoru': ['What a conversation can shape', 'Что рождается в разговоре'],
  'Lekárenské poznatky a kozmetika namiešaná podľa vašej pleti.': ['Pharmacy knowledge and cosmetics blended for your skin.', 'Фармацевтические знания и косметика, приготовленная с учётом вашей кожи.'],
  'Kozmetika namiešaná na mieru po rozhovore': ['Cosmetics prepared to order after a conversation', 'Косметика по индивидуальному заказу после беседы'],
  'Bez syntetickej parfumácie': ['Without synthetic fragrance', 'Без синтетической отдушки'],
  'Odborné farmaceutické poznatky': ['Professional pharmaceutical knowledge', 'Профессиональные фармацевтические знания'],
  'Individuálna konzultácia': ['One-to-one consultation', 'Индивидуальная консультация'],
  'Pozrieť bio kozmetiku': ['Browse biocosmetics', 'Посмотреть биокосметику'],
  'Štyri oblasti práce': ['Four areas of work', 'Четыре направления'],
  'Aktívne kategórie a ich produkty z obchodu ANASTASIA.': ['Active categories and their products from the ANASTASIA shop.', 'Активные категории и товары магазина ANASTASIA.'],
  'Produkty z ANASTASIA': ['Products from ANASTASIA', 'Товары ANASTASIA'],
  'Aktuálne produkty a ceny z obchodu.': ['Current products and prices from the shop.', 'Актуальные товары и цены магазина.'],
  'Šestnásť týždňov v členskej zóne, pracovné listy a Zrkadielko na vlastné pozorovania a sebareflexiu. Súčasťou je 117 PDF materiálov.': ['Sixteen weeks in the member area, worksheets and a Mirror for personal observations and reflection. Includes 117 PDF resources.', 'Шестнадцать недель в личном кабинете, рабочие листы и «Зеркало» для наблюдений и самоанализа. Включает 117 материалов в формате ПДФ.'],
  'Spoznajte program': ['Explore the programme', 'Узнать о программе'],
  'Program Nič nemusíš nájdete v aktuálnej ponuke ANASTASIA.': ['The Nothing Is Required programme is available in the current ANASTASIA selection.', 'Программа «Ничего не нужно» доступна в текущем каталоге ANASTASIA.'],
  'Pozrieť program': ['View the programme', 'Посмотреть программу'],
  'Lekáreň ANASTASIA': ['ANASTASIA Pharmacy', 'Аптека ANASTASIA'],
  'Otázka k produktu, programu alebo konzultácii? Zavolajte alebo napíšte.': ['A question about a product, programme or consultation? Call or email us.', 'Есть вопрос о товаре, программе или консультации? Позвоните или напишите.'],
  'a denný stacionár': ['and day centre', 'и дневной центр'],
  'Denný stacionár vo Vyšnej Slanej · plánované otvorenie jeseň 2026.': ['Day centre in Vysna Slana · scheduled to open in autumn 2026.', 'Дневной центр в Вышна-Слане · планируемое открытие осенью 2026 года.'],
  'Osobný odber sa uskutočňuje po potvrdení pripravenosti a v oznámenom čase.': ['Collection is available after readiness is confirmed, at the notified time.', 'Самовывоз возможен после подтверждения готовности, в согласованное время.'],
  'Otvoriť mapu': ['Open map', 'Открыть карту'],
  'Priestor denného stacionára': ['Day centre space', 'Пространство дневного центра'],
  'Oddychová časť': ['Rest area', 'Зона отдыха'],
  'Poradenská miestnosť': ['Consultation room', 'Кабинет консультаций'],
  'Konzultáciu vedie farmaceutka s dlhoročnou praxou, ktorá prepája odborné farmaceutické poznatky s celostným pohľadom na človeka.': ['The consultation is led by an experienced pharmacist who combines pharmaceutical expertise with a holistic view of each person.', 'Консультацию проводит фармацевт с большим опытом, объединяющий фармацевтические знания с целостным взглядом на человека.'],

  'Viac ako tridsať rokov pracujem s ľuďmi, ich príbehmi, obavami, nádejami a každodennými zdravotnými otázkami. Mnohí ľudia nehľadajú ďalší liek. Hľadajú porozumenie.': ['For more than thirty years I have worked with people, their stories, concerns, hopes and everyday health questions. Many people are not looking for another medicine. They are looking to be understood.', 'Более тридцати лет я работаю с людьми, их историями, тревогами, надеждами и повседневными вопросами о здоровье. Многие ищут не очередное лекарство. Они ищут понимания.'],
  'ANASTASIA · LEKÁREŇ': ['ANASTASIA · PHARMACY', 'ANASTASIA · АПТЕКА'],
  'Vyšná Slaná 259': ['Vysna Slana 259', 'Вышна-Слана 259'],
  '049 26 Vyšná Slaná': ['049 26 Vysna Slana', '049 26 Вышна-Слана'],
  'VÁŠ ÚČET ANASTASIA': ['YOUR ANASTASIA ACCOUNT', 'ВАШ АККАУНТ ANASTASIA'],
  'Registrácia a novinky': ['Registration and updates', 'Регистрация и новости'],
  'V účte nájdete svoje objednávky a zakúpené programy. Novinky posielame iba po samostatnom súhlase.': ['Your account keeps your orders and purchased programmes. We send updates only with separate consent.', 'В аккаунте доступны ваши заказы и купленные программы. Новости отправляем только с отдельного согласия.'],
  'ANASTASIA · V PONUKE': ['ANASTASIA · IN THE SHOP', 'ANASTASIA · В КАТАЛОГЕ'],
  'AI ANASTASIA · PROGRAM': ['AI ANASTASIA · PROGRAMME', 'AI ANASTASIA · ПРОГРАММА'],
  'ONLINE · 60 MINÚT': ['ONLINE · 60 MINUTES', 'ОНЛАЙН · 60 МИНУТ'],
  'VYBRANÉ Z PONUKY': ['SELECTED FROM THE SHOP', 'ВЫБРАННОЕ ИЗ КАТАЛОГА'],
  'od': ['from', 'от'],
  'AI ANASTASIA · LEKÁREŇ': ['ANASTASIA · PHARMACY', 'ANASTASIA · АПТЕКА'],
  'AI ANASTASIA · V PONUKE': ['ANASTASIA · IN THE SHOP', 'ANASTASIA · В КАТАЛОГЕ'],
  'Rezervovať konzultáciu': ['Book a consultation', 'Записаться на консультацию'],
  'Súhlasím so zasielaním noviniek e-mailom.': ['I agree to receive email newsletters.', 'Я согласен получать новости по электронной почте.'],
  // Úvod webu (koncept)
  "Priestor pre zdravie,": ["A space for health,", "Пространство для здоровья,"],
  "poznanie a vedomý život.": ["knowledge and mindful living.", "знаний и осознанной жизни."],
  "Bylinky, kozmetika, doplnky": ["Herbs, cosmetics, supplements", "Травы, косметика, добавки"],
  "Online aj osobne s Luciou": ["Online or in person with Lucia", "Онлайн или лично с Люцией"],
  "16 týždňov pre telo aj myseľ": ["16 weeks for body and mind", "16 недель для тела и разума"],
  "rokov s ľuďmi": ["years with people", "лет с людьми"],
  "lekáreň vo Vyšnej Slanej": ["pharmacy in Vysna Slana", "аптека в Вышней Сланой"],
  "týždňov RESET 40+": ["weeks of RESET 40+", "недель RESET 40+"],
  "Vitajte v zdravom svete. Kde veci nemusia byť urýchľované, vysvetľované ani riadené.": ["Welcome to a healthy world. Where nothing has to be rushed, explained or managed.", "Добро пожаловать в здоровый мир. Где ничего не нужно торопить, объяснять или контролировать."],
  "vstúpte": ["enter", "войдите"],
  "vitajte.": ["welcome.", "добро пожаловать."],
  "Táto časť webu patrí projektu ANASTASIA. Nie ako ponuka riešení, ale ako priestor, kde veci nemusia byť tlačené, vysvetľované ani riadené. Nie je to cieľ, ktorý treba dosiahnuť prácou na sebe. Je to možnosť, ktorá sa objavuje vtedy, keď prestaneme mať pocit, že so sebou musíme niečo robiť.": ["This part of the site belongs to the ANASTASIA project. Not as an offer of solutions, but as a space where nothing has to be pushed, explained or managed. It is not a goal to reach by working on yourself. It is a possibility that appears once we stop feeling that we have to do something with ourselves.", "Эта часть сайта принадлежит проекту ANASTASIA. Не как предложение решений, а как пространство, где ничего не нужно подталкивать, объяснять или контролировать. Это не цель, которой нужно достичь работой над собой. Это возможность, которая появляется, когда мы перестаём чувствовать, что должны что-то с собой делать."],
  "čo tu": ["what you", "что вы"],
  "nájdete.": ["will find.", "здесь найдёте."],
  "Lekáreň a projekty vo Vyšnej Slanej": ["Pharmacy and projects in Vysna Slana", "Аптека и проекты в Вышней Сланой"],
  "Každý deň má zmysel, keď ho žijeme spolu. Spoločnosť, aktivitu, dôstojnosť a pokračovanie života, nie iba starostlivosť.": ["Every day has meaning when we live it together. Company, activity, dignity and a life that goes on, not just care.", "Каждый день имеет смысл, когда мы проживаем его вместе. Общение, активность, достоинство и продолжение жизни, а не только уход."],
  "AI je nástroj.": ["AI is a tool.", "AI — это инструмент."],
  "zostáva ľudská.": ["stays human.", "остаётся человеческой."],
  "Odbornosť zostáva ľudská.": ["Expertise stays human.", "Экспертиза остаётся человеческой."],
  "Mgr. Lucia Rogožanová, MBA · Farmaceutka": ["Lucia Rogozanova, Mgr., MBA · Pharmacist", "Магистр Люция Рогожанова, МВА · фармацевт"],
  "kto za tým stojí.": ["who is behind it.", "кто за этим стоит."],
  "Volám sa": ["My name is", "Меня зовут"],
  "Lucia Rogožanová.": ["Lucia Rogozanova.", "Люция Рогожанова."],
  "viac ako 30 rokov s ľuďmi.": ["more than 30 years with people.", "более 30 лет с людьми."],
  "Individuálny prístup": ["Individual approach", "Индивидуальный подход"],
  "Prevencia a vitalita": ["Prevention and vitality", "Профилактика и жизненная сила"],
  "Zdravie vzniká každý deň v našich rozhodnutiach, návykoch, vzťahoch a postoji k sebe samým.": ["Health is created every day in our decisions, habits, relationships and in how we treat ourselves.", "Здоровье рождается каждый день в наших решениях, привычках, отношениях и отношении к самим себе."],
  "niečo pre každého.": ["something for everyone.", "что-то для каждого."],
  "Čo môžeme": ["What can we", "Что мы можем"],
  "spolu": ["work on", "решить"],
  "riešiť?": ["together?", "вместе?"],
  "Objavte produkty a programy sveta ANASTASIA.": ["Discover the products and programmes of the ANASTASIA world.", "Откройте продукты и программы мира ANASTASIA."],
  "Veci, ktoré majú zmysel. Malé každodenné rituály.": ["Things that make sense. Small everyday rituals.", "Вещи, в которых есть смысл. Маленькие ежедневные ритуалы."],
  "darček.": ["a gift.", "подарок."],
  "Darčekový": ["Gift", "Подарочный"],
  "poukaz": ["voucher", "сертификат"],
  "Darujte priestor pre vlastný výber.": ["Give them the space to choose for themselves.", "Подарите свободу собственного выбора."],
  "Meno a e-mail príjemcu": ["Recipient's name and email", "Имя и электронная почта получателя"],
  "Odkaz pre príjemcu": ["Message for the recipient", "Послание для получателя"],
  "pre vašich blízkych": ["for your loved ones", "для ваших близких"],
  "Kód poukazu": ["Voucher code", "Код сертификата"],
};

// Poznámka nad obsahem, který zatím nemá schválený překlad.
export const SK_ONLY_NOTE = {
  sk: 'Tento obsah je zatím dostupný len v slovenčine.',
  en: 'This content is available in Slovak only.',
  ru: 'Это содержимое доступно только на словацком языке.',
};

const idx = { en: 0, ru: 1 };
const original = new WeakMap(); // uzel -> původní slovenský text
const originalAttr = new WeakMap(); // uzel -> {atribut: původní hodnota}

export function normalizeLang(value) {
  return LANGS.includes(value) ? value : 'sk';
}

// 1) ruční volba — vždy má přednost.
export function storedLang() {
  try { const value = localStorage.getItem(LANG_KEY); return LANGS.includes(value) ? value : null; } catch { return null; }
}

// 2) jazyk prohlížeče.
export function browserLang() {
  const list = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length) ? navigator.languages : [(typeof navigator !== 'undefined' && navigator.language) || ''];
  for (const raw of list) {
    const code = String(raw || '').toLowerCase().split('-')[0];
    if (code === 'sk' || code === 'cs') return 'sk';
    if (code === 'ru' || code === 'uk' || code === 'be') return 'ru';
  }
  return null;
}

// 3) poloha — země z edge (Cloudflare).
export function countryLang() {
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="ana-country"]') : null;
  const code = String((meta && meta.getAttribute('content')) || (typeof window !== 'undefined' && window.__ANA_COUNTRY__) || '').toUpperCase();
  if (!code) return null;
  if (code === 'SK' || code === 'CZ') return 'sk';
  if (code === 'RU' || code === 'UA' || code === 'BY' || code === 'KZ') return 'ru';
  return 'en';
}

export function detectLang() {
  return storedLang() || browserLang() || countryLang() || 'sk';
}

export function getLang() {
  return storedLang() || detectLang();
}

function walkTextNodes(root, fn) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let n; while ((n = walker.nextNode())) fn(n);
}

// Atributy, které nesou viditelný text (a musí být v jednom jazyku).
const TEXT_ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
const isLanguageCode = value => ['SK', 'EN', 'RU'].includes(value.trim().toUpperCase());

function translateValue(value, target) {
  const trimmed = value.trim();
  if (!trimmed || isLanguageCode(trimmed)) return value;
  const entry = DICT[trimmed];
  if (!entry) return value;
  const translated = entry[idx[target]];
  return translated ? value.replace(trimmed, translated) : value;
}

// Přeloží jen přesné shody (po trimu), zachová okolní mezery. SK = obnoví zdroj.
// Text uzlu nastavený překladem — odliší naši změnu od změny skriptem stránky.
const lastSet = new WeakMap();
let currentLang = 'sk';

function translateNode(node, target) {
  if (!original.has(node) || (lastSet.has(node) && lastSet.get(node) !== node.nodeValue)) original.set(node, node.nodeValue);
  const src = original.get(node);
  const trimmed = src.trim();
  let next = src;
  if (target !== 'sk') {
    const entry = DICT[trimmed];
    if (entry && entry[idx[target]]) next = src.replace(trimmed, entry[idx[target]]); // nenalezené zůstává slovensky (patří do data-sk-only)
  }
  if (node.nodeValue !== next) node.nodeValue = next;
  lastSet.set(node, next);
}

// Texty, které skripty mění až po načtení (zvuk, video, animace), se přeloží hned po změně.
let observer = null;
function watchDynamicText() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((mutations) => {
    if (currentLang === 'sk') return;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const node = m.target;
        if (lastSet.get(node) !== node.nodeValue && node.nodeValue.trim()) translateNode(node, currentLang);
      } else {
        for (const added of m.addedNodes) {
          if (added.nodeType === 3) { if (added.nodeValue.trim()) translateNode(added, currentLang); }
          else if (added.nodeType === 1) walkTextNodes(added, (n) => translateNode(n, currentLang));
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function apply(lang) {
  const target = normalizeLang(lang);
  currentLang = target;
  walkTextNodes(document.body, (node) => translateNode(node, target));
  for (const el of document.querySelectorAll('[alt],[aria-label],[title],[placeholder]')) {
    if (!originalAttr.has(el)) {
      const values = {};
      for (const name of TEXT_ATTRS) if (el.hasAttribute(name)) values[name] = el.getAttribute(name);
      originalAttr.set(el, values);
    }
    const values = originalAttr.get(el);
    for (const name of TEXT_ATTRS) {
      if (!el.hasAttribute(name)) continue;
      const source = values[name];
      el.setAttribute(name, target === 'sk' ? source : translateValue(source, target));
    }
  }
  applySkOnly(target);
  document.documentElement.lang = target;
  markSwitch(target);
  document.dispatchEvent(new CustomEvent('anastasia:lang', {detail: target}));
}

// Obsah bez schváleného překladu: v EN/RU dostane vlastní poznámku, text zůstane slovenský.
function applySkOnly(target) {
  for (const block of document.querySelectorAll('[data-sk-only]')) {
    let note = block.querySelector(':scope > [data-sk-only-note]');
    if (target === 'sk') { if (note) note.remove(); continue; }
    if (!note) {
      note = document.createElement('p');
      note.setAttribute('data-sk-only-note', '');
      note.className = 'sk-only-note';
      block.prepend(note);
    }
    note.textContent = SK_ONLY_NOTE[target];
  }
}

export function setLang(lang) {
  const target = normalizeLang(lang);
  try { localStorage.setItem(LANG_KEY, target); } catch {}
  apply(target);
}

// Zvýrazní aktivní jazyk ve všech přepínačích.
function markSwitch(target) {
  for (const el of switchEls()) {
    const on = switchCode(el).toLowerCase() === target;
    el.setAttribute('aria-current', on ? 'true' : 'false');
    el.style.opacity = on ? '1' : '0.5';
  }
}

// Najde prvky přepínače jazyka: podle aria-label (lišta) nebo podle textu SK/EN/RU (menu).
// Text v liště je zabalený v animaci přejezdu, proto se řídíme i atributem.
function switchEls() {
  return [...document.querySelectorAll('a, span, button')].filter((el) => {
    const label = (el.getAttribute('aria-label') || '').trim().toUpperCase();
    if (label === 'SK' || label === 'EN' || label === 'RU') return true;
    const t = el.textContent.trim().toUpperCase();
    return t === 'SK' || t === 'EN' || t === 'RU';
  });
}

function switchCode(el) {
  const label = (el.getAttribute('aria-label') || '').trim().toUpperCase();
  if (label === 'SK' || label === 'EN' || label === 'RU') return label;
  return el.textContent.trim().toUpperCase();
}

// Zapojí přepínače a aplikuje jazyk (ruční volba, jinak automatické určení).
export function init() {
  try {
    for (const el of switchEls()) {
      el.style.cursor = 'pointer';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.removeAttribute('disabled');
      el.removeAttribute('aria-disabled');
      const code = switchCode(el);
      el.title = { SK: 'Slovenčina', EN: 'English', RU: 'Русский' }[code] || el.title;
      el.dataset.i18nSwitch = '1';
      const go = (e) => { e.preventDefault(); setLang(code.toLowerCase()); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
    apply(detectLang());
    watchDynamicText();
  } catch {}
  try { window.anaSetLang = setLang; } catch {}
}
