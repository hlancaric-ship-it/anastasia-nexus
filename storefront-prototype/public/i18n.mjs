// Běhová vícejazyčnost storefrontu (SK výchozí, EN/RU). SK je ZDROJ; EN/RU jsou zatím
// strojové/placeholder překlady označené jako NEKONTROLOVANÉ — finální překlady dodá jádro
// (admin správa překladů, Codex). Překládají se jen řetězce, které jsou v DICT (přesná shoda
// textového uzlu po trimu); cokoli nenalezené zůstane ve slovenštině, takže se nic „nerozbije".
// Formát klíčů: klíč = přesný slovenský text. Viz I18N-README.md.
// Dokud nejsou schválené překlady, EN/RU je náhled; nenahrazuje profesionální korekturu.

export const LANGS = ['sk', 'en', 'ru'];
export const LANG_KEY = 'ana-lang';

// Slovník UI (navigace, tlačítka, patička, běžné popisky). Hodnota [en, ru].
// Placeholder / strojové — k nahrazení schválenými překlady z jádra.
export const DICT = {
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
  'Konzultácie': ['Consultations', 'Консультации'],
  'Supervízia': ['Supervision', 'Супервизия'],
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
  'Do košíka': ['Add to cart', 'В корзину'],
  'Pridať do košíka': ['Add to cart', 'В корзину'],
  'Kúpiť program': ['Buy program', 'Купить программу'],
  'Spoznajte program': ['Discover the program', 'Узнать о программе'],
  'Pokračovať na objednávku': ['Continue to checkout', 'Перейти к оформлению'],
  'Objednať': ['Order', 'Заказать'],
  'Odoslať správu': ['Send message', 'Отправить сообщение'],
  'Celý obchod': ['Whole shop', 'Весь магазин'],
  'Prihlásenie': ['Sign in', 'Вход'],
  'Môj účet': ['My account', 'Мой аккаунт'],
  'Košík': ['Cart', 'Корзина'],
  'Objaviť Zdravý svet': ['Discover Healthy world', 'Открыть Здоровый мир'],
  'Pozrieť konzultácie': ['View consultations', 'Смотреть консультации'],
  'Pozrieť produkt': ['View product', 'Смотреть товар'],
  'Napíšte nám': ['Write to us', 'Напишите нам'],
  'Kontaktujte nás': ['Contact us', 'Свяжитесь с нами'],
};

const idx = { en: 0, ru: 1 };
const original = new WeakMap(); // uzel -> původní slovenský text

export function normalizeLang(value) {
  return LANGS.includes(value) ? value : 'sk';
}

export function getLang() {
  try { return normalizeLang(localStorage.getItem(LANG_KEY)); } catch { return 'sk'; }
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
    else node.nodeValue = src; // nenalezené zůstává slovensky
  });
  document.documentElement.lang = target;
  markSwitch(target);
}

export function setLang(lang) {
  const target = normalizeLang(lang);
  try { localStorage.setItem(LANG_KEY, target); } catch {}
  apply(target);
}

// Zvýrazní aktivní jazyk ve všech přepínačích.
function markSwitch(target) {
  for (const el of switchEls()) {
    const code = el.textContent.trim().toLowerCase();
    const on = code === target;
    el.setAttribute('aria-current', on ? 'true' : 'false');
    el.style.opacity = on ? '1' : '0.5';
  }
}

// Najde prvky přepínače jazyka: listové a/span/button s textem přesně SK/EN/RU.
function switchEls() {
  return [...document.querySelectorAll('a, span, button')].filter((el) => {
    const t = el.textContent.trim().toUpperCase();
    return (t === 'SK' || t === 'EN' || t === 'RU') && el.children.length === 0;
  });
}

// Zapojí přepínače (i dekorativní <span> z návrhu) a aplikuje uloženou volbu.
export function init() {
  try {
    for (const el of switchEls()) {
      el.removeAttribute('disabled');
      el.style.cursor = 'pointer';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.title = { SK: 'Slovenčina', EN: 'English (náhľad)', RU: 'Русский (предпросмотр)' }[el.textContent.trim().toUpperCase()] || el.title;
      const go = (e) => { e.preventDefault(); setLang(el.textContent.trim().toLowerCase()); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
    apply(getLang());
  } catch {}
  try { window.anaSetLang = setLang; } catch {}
}
