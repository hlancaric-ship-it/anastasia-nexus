import test from 'node:test';
import assert from 'node:assert/strict';
import {card, shopCard, imageSrc} from '../src/components.mjs';
const base={slug:'krem',name:'Krém',category:'Biokozmetika',priceLabel:'9,90 €',description:'Popis',code:'var_1'};
test('product cards never render a catalogue image URL that breaks out of the attribute or leaves the site',()=>{
 for(const evil of ['x" onerror="alert(1)','javascript:alert(1)','//evil.test/a.jpg','/\\evil.test/a.jpg','data:image/svg+xml,<svg onload=alert(1)>']){
  for(const html of [card({...base,image:evil}),shopCard({...base,image:evil},0)]){
   assert.doesNotMatch(html,/onerror|javascript:|evil\.test|data:image/,evil);
   assert.match(html,/src="\/assets\/product-placeholder\.svg"/);
  }
 }
});
test('valid https and relative images stay, with attribute escaping',()=>{
 assert.equal(imageSrc('https://media.test/a.jpg?x=1&y=2'),'https://media.test/a.jpg?x=1&amp;y=2');
 assert.equal(imageSrc('/assets/a.webp'),'/assets/a.webp');
 assert.match(card({...base,image:'https://media.test/a.jpg'}),/src="https:\/\/media\.test\/a\.jpg"/);
});
