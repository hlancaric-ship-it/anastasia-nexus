import test from 'node:test';
import assert from 'node:assert/strict';
import {productFlags, flagBadges} from '../src/lib/product-flags.mjs';
import {card, shopCard} from '../src/components.mjs';

test('accepts only known flags in fixed order', () => {
  assert.deepEqual(productFlags({flags: ['bestseller', '<script>', 'novinka', 'novinka']}), ['novinka', 'bestseller']);
  assert.deepEqual(productFlags({flags: 'novinka'}), []);
  assert.deepEqual(productFlags(null), []);
});

test('renders leaf badges only for true flags', () => {
  const html = flagBadges({isNew: true, isRecommended: true, onSale: 'yes'});
  assert.match(html, /product-flag--isNew">Novinka</);
  assert.match(html, /product-flag--isRecommended">Odporúčame</);
  assert.doesNotMatch(html, /Akcia/);
  assert.equal(flagBadges({}), '');
});

test('product cards show flags', () => {
  const p = {slug: 'a', code: 'a', name: 'A', category: 'Kozmetika', priceLabel: '1 €', description: '', image: '/assets/x.webp', isBestseller: true, onSale: true};
  assert.match(card(p), /Akcia<\/span><span class="product-flag product-flag--isBestseller">Bestseller/);
  assert.match(shopCard(p, 0), /product-flags--over/);
});
