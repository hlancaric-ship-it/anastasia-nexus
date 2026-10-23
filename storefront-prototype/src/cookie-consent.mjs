// Lišta cookies a panel nastavení: texty prebrané 1:1 z časti E právnych textov klientky (/cookies).
// Nič sa nevymýšľa – keď v dokumente chýba údaj, ostáva viditeľný placeholder z dokumentu.
//
// Zdroj textu (storefront-prototype/src/legacy-content.json → /cookies):
//   - „Text prvej vrstvy lišty“ → text lišty a názvy tlačidiel,
//   - „Informácia pre návštevníkov“ → odkaz „Nastavenia cookies“ v pätičke a popis nevyhnutných technológií.
import { escape as e } from './components.mjs';
import content from './legacy-content.json' with { type: 'json' };

const blocks = content['/cookies']?.blocks ?? [];

/** Odstavce za nadpisom h2 (za prvým h2 sa text preruší). */
const section = title => {
  const index = blocks.findIndex(b => b.type === 'h2' && b.text === title);
  if (index < 0) throw new Error(`cookies: chýba oddiel „${title}“`);
  const out = [];
  for (const block of blocks.slice(index + 1)) {
    if (block.type === 'h2') break;
    if (block.type === 'p') out.push(block.text);
  }
  return out;
};

const bannerSection = section('Text prvej vrstvy lišty');
const infoSection = section('Informácia pre návštevníkov');

// Text prvej vrstvy lišty (prvý odstavec oddielu) – doslovne z dokumentu klientky.
const bannerText = bannerSection[0];
if (!bannerText) throw new Error('cookies: chýba text prvej vrstvy lišty');

// Tlačidlá: „Odmietnuť voliteľné“ | „Nastaviť“ | „Prijať všetky“ – názvy berieme z dokumentu, poradie tiež.
const buttonLine = bannerSection.find(text => text.startsWith('Tlačidlá:')) ?? '';
const buttonLabels = [...buttonLine.matchAll(/„([^“]+)“/g)].map(match => match[1]);
if (buttonLabels.length !== 3) throw new Error('cookies: nenašli sa tri názvy tlačidiel v dokumente klientky');
const [labelReject, labelSettings, labelAccept] = buttonLabels;

// Odkaz „Nastavenia cookies“ v pätičke – názov je v dokumente klientky doslovne.
const settingsLinkLabel = infoSection.find(text => text.includes('„Nastavenia cookies“'))?.match(/„([^“]+)“/)?.[1];
if (!settingsLinkLabel) throw new Error('cookies: chýba odkaz „Nastavenia cookies“');

// Popis nevyhnutných technológií (prvá veta z oddielu „Informácia pre návštevníkov“).
const necessarySentence = infoSection.find(text => text.includes('Nevyhnutné technológie sa používajú len v rozsahu potrebnom'));
if (!necessarySentence) throw new Error('cookies: chýba popis nevyhnutných technológií');
const necessaryText = necessarySentence.split(/(?<=\.)\s/)[0];

// Záverečná veta prvej vrstvy s odkazom na informácie o cookies.
const plainBanner = bannerText.replace(/^„/, '').replace(/[“”]\s*$/, '');
const detailMatch = plainBanner.match(/^(.*\b)(Podrobnosti nájdete v )([^.]+)\.$/);
if (!detailMatch) throw new Error('cookies: chýba odkaz na podrobnosti v texte lišty');
const detailPrefix = detailMatch[2];
// r20/3 + 4: v lište sa text zobrazuje bez úvodzoviek a bez zástupného úseku
// („ na [doplní prevádzkovateľ]“) – zvyšok vety ostáva doslovne.
const bannerBody = plainBanner.replace(' na [doplní prevádzkovateľ]', '');
const detailLink = detailMatch[3];

// Kategórie: nevyhnutné sú vždy, voliteľné vypnuté, kým zákazník nevyberie.
// r20/4: v lište ani v paneli sa zástupný text klientky neukazuje – pri popise
// kategórií ostáva prázdny popis (právna stránka /cookies ostáva beze zmeny).
const CATEGORIES = [
  { id: 'necessary', label: 'Nevyhnutné', description: necessaryText, locked: true },
  { id: 'analytics', label: 'Analytické', description: '', locked: false },
  { id: 'marketing', label: 'Marketingové', description: '', locked: false },
];

const button = (action, label) => `<button type="button" class="cookie-btn" data-consent="${action}">${e(label)}</button>`;

/** Odkaz v pätičke: otvorí panel nastavení (bez JavaScriptu vedie na stránku o cookies). */
export const cookieSettingsLink = () =>
  `<a href="/cookies" data-cookie-settings>${e(settingsLinkLabel)}</a>`;

/** Lišta prvej vrstvy + panel nastavení. markup je v statickom HTML, skript iba spravuje viditeľnosť. */
export const cookieConsent = () => `
<div class="cookie-banner" id="cookie-banner" role="region" aria-label="${e(settingsLinkLabel)}" hidden>
  <div class="cookie-banner-inner">
    <p class="cookie-banner-text">${e(bannerBody)}</p>
    <div class="cookie-banner-actions">
      ${button('none', labelReject)}
      ${button('settings', labelSettings)}
      ${button('all', labelAccept)}
    </div>
  </div>
</div>
<div class="cookie-settings" id="cookie-settings" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title" hidden>
  <div class="cookie-settings-inner">
    <h2 id="cookie-settings-title">${e(settingsLinkLabel)}</h2>
    <ul class="cookie-categories">
      ${CATEGORIES.map(category => `<li><label class="cookie-category"><input type="checkbox" data-consent-category="${category.id}"${category.locked ? ' checked disabled' : ''}><span><strong>${e(category.label)}</strong>${category.description ? `<small>${e(category.description)}</small>` : ''}</span></label></li>`).join('\n      ')}
    </ul>
    <p class="cookie-settings-detail">${e(detailPrefix)}<a href="/cookies">${e(detailLink)}</a>.</p>
    <div class="cookie-banner-actions">
      ${button('none', labelReject)}
      <button type="button" class="cookie-btn" data-consent="save">Uložiť nastavenia</button>
    </div>
    <button type="button" class="cookie-settings-close" data-consent="close">Zavrieť</button>
  </div>
</div>`;
