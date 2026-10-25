import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dist=new URL('../dist/',import.meta.url);
const routes=JSON.parse(await readFile(new URL('routes.json',dist),'utf8'));
const expected=new Map(Object.entries({
 'Obchod':'/eshop','Programy a služby':'/eshop?category=sebarozvoj','Biokozmetika':'/eshop?category=bio-kozmetika-bez-chemie','Zdravé doplnky výživy':'/eshop?category=zdrave-doplnky-vyzivy',
 'Konzultácie':'/konzultacie','Zdravá lekáreň':'/zdrava-lekaren','Denný stacionár Vyšná Slaná':'/denny-stacionar-vysna-slana',
 'Zdravý svet':'/zdravy-svet','O Lucii':'/o-lucii','Recenzie zákazníkov':'/ai-anastasia/recenzie-zakaznikov-ai-anastasia-com/',
 'AI ANASTASIA':'https://www.aianastasia.com/','ANASTASIA Academy':'https://www.anastasia.academy/',
 'Kontakt':'/kontakt','Môj účet':'/ucet','Košík':'/kosik','Darčekové poukazy':'/eshop?category=darcekove-poukazy',
}));
const optional=new Set(['Zdravá lekáreň']);
// Riadok značiek s logami (data-menu-brand) vedie len na úvod a weby značiek.
const brandTargets=new Set(['/','https://www.anastasia.academy/','https://www.aianastasia.com/']);
const htmlFor=path=>readFile(new URL((path==='/'?'':path.slice(1)+'/')+'index.html',dist),'utf8');
const attribute=(text,name)=>text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const textOf=html=>html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().replace(/\s*Už čoskoro$/,'');
test('both menus on every route link to the page promised by their labels',async()=>{
 for(const path of routes){
  const html=await htmlFor(path);
  for(const id of ['dc-side-menu','dc-top-menu']){
   const menu=html.match(new RegExp(`<aside\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/aside>`))?.[1];assert.ok(menu,`${path}: ${id} exists`);
   const labels=new Set();const occurrences=new Map();
   for(const [,attrs,inner] of menu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)){
    if(/\bdata-menu-brand\b/.test(attrs)){assert.ok(brandTargets.has(attribute(attrs,'href')),`${path} ${id}: brand link`);continue;}
    const label=attribute(attrs,'aria-label')||textOf(inner),href=attribute(attrs,'href');
    assert.ok(expected.has(label),`${path} ${id}: unmapped menu label ${label}`);
    assert.equal(href,expected.get(label),`${path} ${id}: ${label} destination`);
    if(!/^https?:/.test(href)){const targetPath=new URL(href,'http://local').pathname;assert.ok(routes.includes(targetPath==='/'?'/':targetPath.replace(/\/$/,'')),`${path} ${id}: target exists`);}labels.add(label);occurrences.set(label,(occurrences.get(label)||0)+1);
   }
   for(const label of expected.keys()){if(!optional.has(label))assert.ok(labels.has(label),`${path} ${id}: ${label} available`);if(labels.has(label)&&label!=='Môj účet')assert.equal(occurrences.get(label),1,`${path} ${id}: ${label} not duplicated`);}
  }
 }
});
test('all internal menu and header links resolve, including their fragment targets',async()=>{
 const pages=new Map(await Promise.all(routes.map(async path=>[path,await htmlFor(path)])));
 for(const [path,html] of pages){
  const sections=[...html.matchAll(/<(?:header|aside)\b[^>]*>([\s\S]*?)<\/(?:header|aside)>/g)];
  for(const [,section] of sections)for(const [,attrs] of section.matchAll(/<a\b([^>]*)>/g)){
   if(attribute(attrs,'aria-disabled')==='true')continue;
   const href=attribute(attrs,'href');if(!href||/^(https?:|tel:|mailto:)/.test(href))continue;
   assert.notEqual(href,'#',`${path}: empty navigation target`);
   const url=new URL(href,'http://local'+path),target=pages.get(url.pathname==='/'?'/':url.pathname.replace(/\/$/,''));assert.ok(target,`${path}: missing ${href}`);
   if(url.hash)assert.ok(target.includes(`id="${url.hash.slice(1)}"`),`${path}: missing anchor ${href}`);
  }
 }
});
