// Odkazy na účet (hlavička, menu, prihlásenie) podľa prihlásenia zákazníka
// a bočný panel účtu na desktope – odhlásenie musí byť viditeľné bez scrollu stránky.
//
// Čisté funkcie z public/account-links.mjs sa testujú cez `node --test`,
// HTML a CSS sa kontrolujú v zabudovanom výstupe (dist/) aj v zdrojoch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setAccountLink,setAccountVisibility,ACCOUNT_HREF,ACCOUNT_LABEL} from '../public/account-links.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

// Odkaz: len rozhranie, ktoré používa public/account-links.mjs.
const link = (text = '') => ({
  href: '', hidden: false, textContent: text, attrs: {},
  setAttribute(name, value) { this.attrs[name] = value; },
  getAttribute(name) { return this.attrs[name] ?? null; },
});

// Vyberie bloky @media(...){...} (aj vnorené zátvorky).
const mediaBlocks = (css, query) => {
  const out = [];
  const re = new RegExp('@media\\(' + query + '\\)\\{', 'g');
  let match;
  while ((match = re.exec(css))) {
    let i = match.index + match[0].length, depth = 1;
    while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    out.push(css.slice(match.index, i));
  }
  return out;
};

test('prihlásený zákazník: odkaz na účet ide do účtu', () => {
  const icon = link();
  setAccountLink(icon, true);
  assert.equal(icon.href, ACCOUNT_HREF.in);
  assert.equal(icon.href, '/ucet');
  assert.equal(icon.getAttribute('aria-label'), ACCOUNT_LABEL.in);
  assert.equal(icon.getAttribute('title'), 'Môj účet');
});

test('neprihlásený zákazník: odkaz na účet ide na prihlásenie', () => {
  const icon = link();
  setAccountLink(icon, false);
  assert.equal(icon.href, ACCOUNT_HREF.out);
  assert.equal(icon.href, '/prihlasenie');
  assert.equal(icon.getAttribute('aria-label'), 'Prihlásiť sa');
  assert.equal(icon.getAttribute('title'), 'Prihlásiť sa');
});

test('položka účtu v menu zmení text aj cestu', () => {
  const item = link('Môj účet');
  setAccountLink(item, false);
  assert.equal(item.textContent, 'Prihlásiť sa');
  assert.equal(item.href, '/prihlasenie');
  setAccountLink(item, true);
  assert.equal(item.textContent, 'Môj účet');
  assert.equal(item.href, '/ucet');
});

test('ikona účtu v hlavičke má len SVG – text sa nemení a nič sa nestratí', () => {
  const icon = link(''); // ikona nemá text, len SVG
  setAccountLink(icon, true);
  assert.equal(icon.textContent, '');
  assert.equal(icon.href, '/ucet');
  assert.equal(icon.getAttribute('aria-label'), 'Môj účet');
  assert.equal(icon.getAttribute('title'), 'Môj účet');
});

test('odkaz na účet na prihlásení vidí len prihlásený zákazník', () => {
  const account = link('Môj účet');
  setAccountVisibility(account, false);
  assert.equal(account.hidden, true);
  setAccountVisibility(account, true);
  assert.equal(account.hidden, false);
});

test('aplikácia rozhoduje o odkazoch podľa tokenu zákazníka (JWT_KEY)', async () => {
  const app = await read('../public/app.mjs');
  assert.match(app, /import \{JWT_KEY\} from '\/lib\/api\/http\.mjs'/, 'kľúč tokenu je z API adaptéra');
  assert.match(app, /getItem\(JWT_KEY\)/, 'token zákazníka sa hľadá v prehliadači');
  assert.match(app, /\[data-global-account\],\[data-menu-account\]/, 'hlavička aj menu sa prepínajú podľa prihlásenia');
  assert.match(app, /setAccountVisibility\(link,customerLogged\(\)\)/, 'odkaz na účet na prihlásení sa skrýva');
  assert.ok(!/querySelector\('span'\)/.test(app), 'odkaz účtu nemá <span> – nesmie sa naň spieťať');
});

test('menu aj prihlásenie sú v HTML označené pre prepínanie podľa prihlásenia', async () => {
  const home = await read('../dist/index.html');
  assert.ok((home.match(/data-menu-account/g) || []).length >= 2, 'menu má označenú položku účtu');
  assert.match(home, /data-menu-account[^>]*>Môj účet</, 'položka účtu v menu je označená');
  const login = await read('../dist/prihlasenie/index.html');
  assert.match(login, /data-my-account/, 'prihlásenie má označený odkaz na účet');
  assert.match(login, /data-my-account[^>]*>Môj účet/, 'odkaz na účet na prihlásení smeruje do účtu');
});

test('bočný panel účtu na desktope neprekračuje výhľad a odhlásenie je lepké dole', async () => {
  for (const file of ['../public/styles.css', '../dist/styles.css']) {
    const css = await read(file);
    const desktop = mediaBlocks(css, 'min-width:1000px');
    assert.ok(desktop.length > 0, file + ': existujú pravidlá pre desktop');
    const panel = desktop.filter(block => /\.center-sidebar\{[^}]*max-height:calc\(100vh - 76px - 16px\)/.test(block));
    assert.equal(panel.length, 1, file + ': panel účtu je najviac vysoký ako výhľad');
    assert.match(panel[0], /overflow-y:auto/, file + ': panel účtu sa rol sám, nie stránka');
    const signOut = desktop.filter(block => /\.center-sidebar>a\[data-sign-out\]\{[^}]*position:sticky[^}]*bottom:0/.test(block));
    assert.equal(signOut.length, 1, file + ': odhlásenie je lepké na spodok panelu');
  }
});

test('mobil: bočný panel účtu sa nemení (rol a lepenie len na desktope)', async () => {
  for (const file of ['../public/styles.css', '../dist/styles.css']) {
    const css = await read(file);
    const mobile = mediaBlocks(css, 'max-width:999\\.98px');
    assert.ok(mobile.length > 0, file + ': mobilné pravidlá existujú');
    assert.equal(mobile.filter(block => /\.center-sidebar\{[^}]*overflow-y:auto/.test(block)).length, 0, file + ': mobil sa nemení');
    assert.equal(mobile.filter(block => /\.center-sidebar>a\[data-sign-out\]\{[^}]*position:sticky/.test(block)).length, 0, file + ': mobil sa nemení');
  }
});
