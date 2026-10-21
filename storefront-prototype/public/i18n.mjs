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
export const LANG_KEY = 'ana-lang';

export const DICT = {
  // --- Navigace, hlavička, lišta, menu -----------------------------------
  'Obchod': ['Shop', 'Магазин'],
  'Všetky produkty': ['All products', 'Все товары'],
  'Kategórie': ['Categories', 'Категории'],
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
  'Menu': ['Menu', 'Меню'],
  'Close': ['Close', 'Закрыть'],
  'Zavrieť': ['Close', 'Закрыть'],
  'Zavrieť menu': ['Close menu', 'Закрыть меню'],
  'Hlavné menu': ['Main menu', 'Главное меню'],
  'Jazyk, menu a kontakt': ['Language, menu and contact', 'Язык, меню и контакты'],
  'Svet': ['World', 'Мир'],
  'Svet ANASTASIA': ['ANASTASIA world', 'Мир ANASTASIA'],
  'Informácie': ['Information', 'Информация'],
  'Zdravá lekáreň': ['Healthy pharmacy', 'Аптека здоровья'],
  'Denný stacionár Vyšná Slaná': ['Daily sanatorium Vysna Slana', 'Дневной санаторий Вышна Слана'],
  'Programy a služby': ['Programs and services', 'Программы и услуги'],
  'Sprevádzanie': ['Accompanying', 'Сопровождение'],
  'Pharmanews': ['Pharmanews', 'Pharmanews'],
  'Recenzie produktov': ['Product reviews', 'Отзывы о товарах'],
  'Recenzie zákazníkov': ['Customer reviews', 'Отзывы клиентов'],
  'Cookies': ['Cookies', 'Cookies'],
  'AI ANASTASIA ACADEMY': ['AI ANASTASIA ACADEMY', 'AI ANASTASIA ACADEMY'],
  'ACADEMY': ['ACADEMY', 'ACADEMY'],
  'BIOKOZMETIKA': ['BIOCOSMETICS', 'БИОКОСМЕТИКА'],
  'Zdravé doplnky výživy': ['Healthy nutrition supplements', 'Здоровые пищевые добавки'],
  'Môj účet': ['My account', 'Мой аккаунт'],
  'Účet': ['Account', 'Аккаунт'],
  'Košík': ['Cart', 'Корзина'],
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
  'Priestor pre zdravie, poznanie a vedomý život.': ['A space for health, knowledge and conscious living.', 'Пространство для здоровья, знания и осознанной жизни.'],
  'Občasný list o nových programoch, rituáloch a kolekciách. Bez zhonu.': ['An occasional letter about new programs, rituals and collections. No rush.', 'Изредка письмо о новых программах, ритуалах и коллекциях. Без спешки.'],
  'Váš e-mail': ['Your e-mail', 'Ваш e-mail'],

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
  'Objaviť Zdravý svet': ['Discover Healthy world', 'Открыть Здоровый мир'],
  'Pozrieť konzultácie': ['View consultations', 'Смотреть консультации'],
  'Pozrieť produkt': ['View product', 'Смотреть товарь'],
  'Napíšte nám': ['Write to us', 'Напишите нам'],
  'Kontaktujte nás': ['Contact us', 'Свяжитесь с нами'],
  'Objavte svet ANASTASIA': ['Discover the ANASTASIA world', 'Откройте мир ANASTASIA'],
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
export function apply(lang) {
  const target = normalizeLang(lang);
  walkTextNodes(document.body, (node) => {
    if (!original.has(node)) original.set(node, node.nodeValue);
    const src = original.get(node);
    const trimmed = src.trim();
    if (target === 'sk') { node.nodeValue = src; return; }
    const entry = DICT[trimmed];
    if (entry && entry[idx[target]]) node.nodeValue = src.replace(trimmed, entry[idx[target]]);
    else node.nodeValue = src; // nenalezené zůstává slovensky (patří do data-sk-only)
  });
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
      const code = switchCode(el);
      el.title = { SK: 'Slovenčina', EN: 'English', RU: 'Русский' }[code] || el.title;
      el.dataset.i18nSwitch = '1';
      const go = (e) => { e.preventDefault(); setLang(code.toLowerCase()); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
    apply(detectLang());
  } catch {}
  try { window.anaSetLang = setLang; } catch {}
}
