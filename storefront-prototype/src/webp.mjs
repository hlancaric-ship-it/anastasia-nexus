// WebP varianty obrázkov (zostavenie): src/media → public/img/*.webp.
//
// V prehliadači sa zobrazí <picture> s WebP a náhradou (JPG/PNG). Keď WebP
// variant neexistuje, vráti sa pôvodný <img> – vzhled je 1:1.
import {existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {escape as e} from './components.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pattern = /^\/(assets|media)\/(.+)\.(jpg|jpeg|png)$/i;

export function webpFor(src) {
  const match = pattern.exec(String(src || ''));
  if (!match) return null;
  const file = join(root, 'public', 'img', `${match[2]}.webp`);
  if (!existsSync(file)) return null;
  // WebP používame len vtedy, keď je naozaj menší (pri nevhodnom source by bol väčší).
  const original = join(root, 'public', match[1], `${match[2]}.${match[3].toLowerCase()}`);
  if (existsSync(original) && statSync(file).size >= statSync(original).size) return null;
  return `/img/${match[2]}.webp`;
}

export function picture(src, alt, attrs = '') {
  const webp = webpFor(src);
  // WebP je v src, aby prehliadač netahal naraz dva súbory (scanner stiahne img
  // ešte pred spracovaním <source>). JPG ostáva v <noscript> ako záloha.
  if (!webp) return `<img src="${e(src)}" alt="${e(alt)}" ${attrs}>`;
  return `<picture><source srcset="${e(webp)}" type="image/webp"><img src="${e(webp)}" alt="${e(alt)}" ${attrs}><noscript><img src="${e(src)}" alt="${e(alt)}" ${attrs}></noscript></picture>`;
}
