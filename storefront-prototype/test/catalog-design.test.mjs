import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../dist/eshop/index.html',import.meta.url),'utf8');
const styles=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8').catch(()=>readFile(new URL('../dist/base.css',import.meta.url),'utf8'));
const headers=await readFile(new URL('../dist/_headers',import.meta.url),'utf8');

test('shop catalogue renders the editorial masthead and keeps the real catalogue controls',()=>{
 assert.match(page,/class="catalog-masthead"/);
 assert.match(page,/src="\/assets\/zdravy-svet-luka\.jpg"/);
 assert.match(page,/id="catalog-results"/);
 assert.match(page,/name="search"/);
 assert.match(page,/name="category"/);
 assert.match(page,/name="filter"/);
 assert.ok((page.match(/class="catalog-nav-tile"/g)||[]).length>=4);
 assert.ok((page.match(/class="product-card"/g)||[]).length>=4);
});

test('catalogue uses a two-column mobile product grid and visible purchase actions',()=>{
 assert.match(styles,/\.catalog-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(styles,/\.catalog-grid \.product-info\{[^}]*opacity:1;visibility:visible/);
 assert.match(page,/data-add=/);
 assert.match(styles,/\.catalog-grid \.product-info p\{[^}]*-webkit-line-clamp:3/);
 assert.match(headers,/img-src 'self' https:\/\/anastasia-test-api\.l-code-dynamics\.com/);
 assert.doesNotMatch(page,/src="\/backend-media\/static\//);
});
