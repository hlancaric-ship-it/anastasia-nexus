import { mkdir, copyFile, access, rm, readFile, rename } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {execFileSync} from 'node:child_process';
import { homedir } from 'node:os';
const root=dirname(fileURLToPath(import.meta.url));
const source=resolve(process.argv[2]||join(homedir(),'Documents/anastasia-hero-video'));
const dest=join(root,'public/media');
await mkdir(dest,{recursive:true});
for(const name of ['hero-1080p.mp4','hero-720p.mp4','hero-480p.mp4','hero-1080p.webm','poster.jpg','nature-ambient.mp3']){
  try{await access(join(source,name));}catch(error){if(error.code!=='ENOENT')throw error;await access(join(dest,name));continue;}
  await copyFile(join(source,name),join(dest,name));
}
const legacy=join(homedir(),'Downloads/anozeu/dufeksoft.ecommerce.web/dufeksoft.ecommerce.web');
for(const [from,to] of [['Media/00qdnkts/vyuka-vedomeho-vnimania.jpg','learning.jpg']]) {
  try {await copyFile(join(legacy,from),join(dest,to));}catch{await copyFile(join(dest,'poster.jpg'),join(dest,to));}
}
await rm(join(dest,'centre.jpg'),{force:true});
await rm(join(root,'dist/media/centre.jpg'),{force:true});
console.log('Prepared 6 supplied hero assets and 1 public legacy image in ignored public/media/.');

const legacyContent=JSON.parse(await readFile(join(root,'src/legacy-content.json'),'utf8'));
const originals=new Map(Object.values(legacyContent).flatMap(page=>page.blocks.filter(block=>block.type==='image').map(block=>[block.src,block.originalSrc])));
for(const [local,original] of originals){
  if(!local.startsWith('/media/legacy-')||!original.startsWith('/media/'))throw new Error('Unexpected original media path');
  const file=join(dest,local.slice('/media/'.length));
  try{await access(file);}catch{
    const temporary=file+'.download';
    try{execFileSync('curl',['-fSL','--max-time','30','--silent','--show-error','https://anastasiaoz.eu'+original,'-o',temporary],{stdio:'inherit'});await rename(temporary,file);}finally{await rm(temporary,{force:true});}
  }
}
console.log(`Prepared ${originals.size} original public images; construction photos excluded.`);
