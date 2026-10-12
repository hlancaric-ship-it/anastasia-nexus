import { mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
const root=dirname(fileURLToPath(import.meta.url));
const source=resolve(process.argv[2]||join(homedir(),'Documents/anastasia-hero-video'));
const dest=join(root,'public/media');
await mkdir(dest,{recursive:true});
for(const name of ['hero-1080p.mp4','hero-720p.mp4','hero-480p.mp4','hero-1080p.webm','poster.jpg','nature-ambient.mp3']){await access(join(source,name));await copyFile(join(source,name),join(dest,name));}
const legacy=join(homedir(),'Downloads/anozeu/dufeksoft.ecommerce.web/dufeksoft.ecommerce.web');
for(const [from,to] of [['Media/00qdnkts/vyuka-vedomeho-vnimania.jpg','learning.jpg'],['Media/01flv1eo/vs-pohľad-z-ulice-2_2023.jpg','centre.jpg']]) {
  try {await copyFile(join(legacy,from),join(dest,to));}catch{await copyFile(join(source,'poster.jpg'),join(dest,to));}
}
console.log('Prepared 6 supplied hero assets and 2 public legacy images in ignored public/media/.');
