import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DICT} from '../public/i18n.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('registrácia je dostupná z účtu, menu, košíka, pokladne a stránky výhod',async()=>{
  const [pages,app]=await Promise.all([read('../src/pages.mjs'),read('../public/app.mjs')]);
  assert.match(pages,/id="tab-login"[^]*?Prihlásenie/);
  assert.match(pages,/id="tab-register"[^]*?Registrácia/);
  assert.match(pages,/id="registration-form"[^]*?name="first_name"[^]*?name="last_name"[^]*?name="email"[^]*?name="terms"[^]*?name="privacy"[^]*?name="newsletter"/);
  assert.match(pages,/href="\/nova-registracia\?mode=register"[^]*?Vytvoriť účet/);
  assert.match(pages,/registrationBenefits[^]*?Zaregistrovať sa/);
  assert.match(app,/data-register-link/);
  assert.match(app,/requestRegistrationLink/);
  for(const text of ['Registrácia','Zaregistrovať sa','Vytvoriť účet','Meno','Priezvisko','Súhlasím so zasielaním noviniek e-mailom'])assert.equal(DICT[text]?.length,2,`SK/EN/RU dictionary entries exist for ${text}`);
});
