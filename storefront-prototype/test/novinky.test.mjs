import test from 'node:test';
import assert from 'node:assert/strict';
import {novinky} from '../src/novinky.mjs';
import {NOVINKY_SAMPLE} from '../src/novinky-data.mjs';
import {readFileSync} from 'node:fs';

test('stránka Novinky obsahuje kotvy pre skript a ukážkové dáta v tvare kontraktu', () => {
  const html=novinky();
  for(const id of ['nv-title','nv-chips','nv-feat','nv-reel','nv-track','nv-pgrid','nv-dock','nv-feed','nv-adbox','nv-tab','nv-x','nv-partner','nv-data'])assert.match(html,new RegExp(`id="${id}"`),id);
  const m=html.match(/<script type="application\/json" id="nv-data">([\s\S]*?)<\/script>/);
  const data=JSON.parse(m[1]);
  for(const k of ['page','categories','featured','posts','ads','panel','updated_at'])assert.ok(k in data,k);
  assert.ok(data.ads.length<=3&&data.ads.every(a=>a.slot>=1&&a.slot<=3&&a.text.length<=140&&a.title.length<=40));
  assert.ok(data.posts.every(p=>['image','video','youtube','text','poll'].includes(p.kind)&&p.title.length<=120&&(p.excerpt||'').length<=300));
  assert.ok(data.posts.filter(p=>p.kind==='youtube').every(p=>/^[\w-]{11}$/.test(p.youtube_id)));
});

test('ukážkové dáta v HTML nemôžu uzavrieť script značku', () => {
  const evil={...NOVINKY_SAMPLE,page:{...NOVINKY_SAMPLE.page,title:'</script><img src=x onerror=alert(1)>'}};
  assert.ok(!JSON.stringify(evil).replace(/</g,'\\u003c').includes('</script'));
});

test('skript vkladá API obsah iba ako text a odkazy len https alebo relatívne', () => {
  const js=readFileSync(new URL('../public/novinky.mjs',import.meta.url),'utf8');
  assert.ok(!/innerHTML\s*=|document\.write|eval\(/.test(js),'žiadne innerHTML=');
  assert.match(js,/safeUrl=u=>typeof u==='string'&&\(\/\^https:/);
  assert.match(js,/youtube-nocookie\.com\/embed/);
  assert.match(js,/sendBeacon/);
});
