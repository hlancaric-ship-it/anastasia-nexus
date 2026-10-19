import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dist=new URL('../dist/',import.meta.url);
const routes=JSON.parse(await readFile(new URL('routes.json',dist),'utf8'));
const expected=new Map(Object.entries({
 'Obchod':'/eshop','Všetky produkty':'/eshop','Darčekový poukaz':'/darcekovy-poukaz','Kategórie':'/eshop/kategorie',
 'Kozmetika':'/eshop?category=Kozmetika','Bylinky a výživa':'/eshop?category=Bylinky%20a%20v%C3%BD%C5%BEiva','Programy a služby':'/eshop?category=Programy%20a%20slu%C5%BEby',
 'Novinky':'/eshop?filter=novinky','Bestsellery':'/eshop?filter=bestsellery',
 'Programy':'/reset-40','RESET 40+':'/reset-40','Výuka':'/eshop/produkt/vyuka-vedomeho-vnimania','Klub':'/klub','Moja knižnica':'/ucet',
 'Služby':'/konzultacie','Konzultácie':'/konzultacie','Supervízia':'/konzultacie/supervizia','Astrológia':'/konzultacie/astrologicky-profil-zdravia-a-vitality','AI ANASTASIA':'/ai-anastasia',
 'Zdravý svet':'/zdravy-svet','Aktuality':'/zdrava-lekaren','O Lucii':'/o-lucii','Kontakt':'/kontakt','Môj účet':'/ucet','Košík':'/kosik',
}));
const htmlFor=path=>readFile(new URL((path==='/'?'':path.slice(1)+'/')+'index.html',dist),'utf8');
const attribute=(text,name)=>text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const textOf=html=>html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim().replace(/\s*Už čoskoro$/,'');
test('both menus on every route link to the page promised by their labels',async()=>{
 for(const path of routes){
  const html=await htmlFor(path);
  for(const id of ['dc-side-menu','dc-top-menu']){
   const menu=html.match(new RegExp(`<aside\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/aside>`))?.[1];assert.ok(menu,`${path}: ${id} exists`);
   const labels=new Set();
   for(const [,attrs,inner] of menu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)){
    const label=attribute(attrs,'aria-label')||textOf(inner),href=attribute(attrs,'href');
    assert.ok(expected.has(label),`${path} ${id}: unmapped menu label ${label}`);
    assert.equal(href,expected.get(label),`${path} ${id}: ${label} destination`);
    assert.ok(routes.includes(new URL(href,'http://local').pathname),`${path} ${id}: target exists`);labels.add(label);
   }
   for(const label of expected.keys())assert.ok(labels.has(label),`${path} ${id}: ${label} available`);
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
   const url=new URL(href,'http://local'+path),target=pages.get(url.pathname);assert.ok(target,`${path}: missing ${href}`);
   if(url.hash)assert.ok(target.includes(`id="${url.hash.slice(1)}"`),`${path}: missing anchor ${href}`);
  }
 }
});
