import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pageKeyOf} from '../public/content.mjs';

// Seed z backendu (backend/src/lib/content/seed.json) – kopia pre test, aby sa dal
// overiť, že kľúče v HTML sedia s tými, ktoré vidí administrácia.
const seed = JSON.parse(await readFile(new URL('fixtures/content-seed.json', import.meta.url), 'utf8'));
const seedKeys = new Set(seed.pages.flatMap(p => p.sections.flatMap(s => s.fields.map(f => f.key))));
const dist = new URL('../dist/', import.meta.url);
const routes = JSON.parse(await readFile(new URL('routes.json', dist), 'utf8'));

const htmlFiles = async () => routes.map(path => ({
  prefix: path === '/' ? '' : path.slice(1) + '/',
  url: new URL((path === '/' ? '' : path.slice(1) + '/') + 'index.html', dist),
}));

test('the page key follows the backend slug', () => {
  assert.equal(pageKeyOf('/'), 'home');
  assert.equal(pageKeyOf('/kontakt'), 'kontakt');
  assert.equal(pageKeyOf('/ai-anastasia/recenzie-zakaznikov'), 'ai-anastasia-recenzie-zakaznikov');
  assert.equal(pageKeyOf('/denny-stacionar-vysna-slana/'), 'denny-stacionar-vysna-slana');
});

test('every content key in the built pages exists in the admin seed', async () => {
  const files = await htmlFiles();
  const unknown = [];
  const seen = new Set();
  for (const file of files) {
    const html = await readFile(file.url, 'utf8');
    for (const match of html.matchAll(/data-content="([^"]+)"/g)) {
      const key = match[1];
      seen.add(key);
      if (!seedKeys.has(key)) unknown.push(`${file.prefix}: ${key}`);
    }
  }
  assert.deepEqual(unknown.slice(0, 10), [], 'keys unknown to the admin seed');
  assert.ok(seen.size > 10, `only ${seen.size} content keys found`);
});

test('the seed keys for the shop and the menu are present in the pages', async () => {
  const html = await readFile(new URL('konzultacie/index.html', dist), 'utf8');
  assert.match(html, /data-content="konzultacie__konzultacie-1__0-text"/);
  const home = await readFile(new URL('index.html', dist), 'utf8');
  assert.match(home, /data-content="global__video__0-video"/);
  assert.match(home, /data-content="global__menu-obchod__0-text"/);
});
