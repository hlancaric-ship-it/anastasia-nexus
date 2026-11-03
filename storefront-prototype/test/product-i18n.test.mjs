// Překlady produktů (EN/RU) z metadata.translations: normalizace, slovník pro i18n, fallback na slovenštinu.
import test from 'node:test';
import assert from 'node:assert/strict';
import {htmlToText,normalizeTranslations,dictEntries,longTextFor} from '../src/lib/product-i18n.mjs';

const meta={translations:{en:{title:'Flu powder',subtitle:'',description:'<p>One &amp; two</p>\n<p>Three<br>four</p>'},ru:{title:'Противопростудный порошок'}}};

test('htmlToText drží odstavce a dekóduje entity',()=>{
  assert.equal(htmlToText('<p>One &amp; two</p>\n<p>Three<br>four&nbsp;x</p>'),'One & two\n\nThree\nfour x');
});

test('normalizeTranslations vynechá prázdné a neplatné jazyky',()=>{
  assert.deepEqual(Object.keys(normalizeTranslations(meta)),['en','ru']);
  assert.deepEqual(normalizeTranslations({translations:{en:{title:' '},ru:5}}),{});
  assert.deepEqual(normalizeTranslations(null),{});
});

test('dictEntries mapuje slovenský název a popis na EN/RU, prázdný překlad nepřidá',()=>{
  const product={name:'Chrípkový prášok',description:'Slovenský popis',translations:normalizeTranslations(meta)};
  const entries=dictEntries(product);
  assert.deepEqual(entries['Chrípkový prášok'],['Flu powder','Противопростудный порошок']);
  assert.equal(entries['Slovenský popis'][0],'One & two\n\nThree\nfour');
  assert.equal(entries['Slovenský popis'][1],'');
  assert.deepEqual(dictEntries({name:'Bez prekladu',description:'x',translations:{}}),{});
});

test('longTextFor vrací null bez překladu (fallback na slovenštinu)',()=>{
  const product={translations:normalizeTranslations(meta)};
  assert.equal(longTextFor(product,'en'),'One & two\n\nThree\nfour');
  assert.equal(longTextFor(product,'ru'),null);
  assert.equal(longTextFor({translations:{}},'en'),null);
});
