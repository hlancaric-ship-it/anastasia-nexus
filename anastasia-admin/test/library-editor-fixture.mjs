// Synthetic DOM fixtures only; this script never reaches Medusa or R2.
import {mountLibraryEditor} from '../library-editor.mjs';
let checks=0;
const assert=(ok,message)=>{if(!ok)throw Error(message);checks++};
const host=document.querySelector('#library'),result=document.querySelector('#result');
const rows=Array.from({length:7},(_,i)=>({key:`synthetic/${i}.mp4`,title:i===0?'<img src=x onerror=alert(1)>':`Video ${i+1} ${'dlhší názov '.repeat(6)}`,kind:'video'}));
let store={revision:'a'.repeat(64),media:structuredClone(rows)},last=null,failSave=false,failLoad=false,writes=0;
const api=async(path,options={})=>{
 assert(path==='/admin/products/prod_fixture/protected-media','Only product-local endpoint');
 if(!options.method){if(failLoad)throw Error('Load failed');return structuredClone(store)}
 if(failSave)throw Error('Obsah už niekto upravil v inom okne.');
 writes++;last=structuredClone(options.body);store={revision:'b'.repeat(64),media:options.body.media.map(m=>({...m,kind:'video'}))};return structuredClone(store);
};
const type=(i,value)=>{const input=host.querySelector(`#library-title-${i}`);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))};
const tick=()=>new Promise(r=>setTimeout(r,0));
try {
 const editor=await mountLibraryEditor(host,{api,productId:'prod_fixture'});
 assert(host.querySelectorAll('[data-library-title]').length===5,'Compact page has five files');
 assert(!host.querySelector('img'),'Titles are escaped');
 for(const input of host.querySelectorAll('[data-library-title]'))assert(!!host.querySelector(`label[for="${input.id}"]`),'Associated label');
 assert(host.querySelector('[data-library-move="0"][data-direction="-1"]').disabled,'First file cannot move above start');
 assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
 type(0,'');
 let invalid=false;try{editor.validate()}catch{invalid=true}
 assert(invalid&&document.activeElement.id==='library-title-0','Invalid name is focused');
 type(0,'Upravené video');
 host.querySelector('[data-library-move="0"][data-direction="1"]').click();
 assert(document.activeElement.id==='library-title-1','Focus follows moved file');
 assert(host.querySelector('#library-title-1').value==='Upravené video','Title follows original file');
 host.querySelector('[data-library-page="1"]').click();
 assert(host.querySelectorAll('[data-library-title]').length===2,'Second page contains remaining files');
 assert(host.querySelector('[data-library-move="6"][data-direction="1"]').disabled,'Last file cannot move below end');
 host.querySelector('[data-library-move="5"][data-direction="-1"]').click();
 assert(!!host.querySelector('#library-title-4'),'Cross-page move follows file');
 await editor.save();
 assert(writes===1&&last.revision==='a'.repeat(64),'One write uses loaded revision');
 assert(last.media.length===7&&last.media[1].key==='synthetic/0.mp4'&&last.media[1].title==='Upravené video','Preserves exact keys and changed order');
 assert(last.media.every(m=>Object.keys(m).sort().join(',')==='key,title'),'No customer access, price or kind payload');
 await editor.save();assert(writes===1,'Unchanged save does not write');
 type(0,'Neuložený názov');failSave=true;
 let conflict=false;try{await editor.save()}catch{conflict=true}
 assert(conflict&&host.querySelector('#library-title-0').value==='Neuložený názov','Save error keeps edits');
 failLoad=true;window.confirm=()=>true;host.querySelector('[data-library-reload]').click();await tick();
 assert(host.querySelector('#library-title-0').value==='Neuložený názov','Failed refresh keeps edits');
 failLoad=false;window.confirm=()=>false;host.querySelector('[data-library-reload]').click();await tick();
 assert(host.querySelector('#library-title-0').value==='Neuložený názov','Dismiss refresh keeps edits');
 window.confirm=()=>true;host.querySelector('[data-library-reload]').click();await tick();
 assert(host.querySelector('#library-title-0').value===store.media[0].title,'Confirmed refresh reads saved content');
 await mountLibraryEditor(host,{api:async()=>({revision:'c'.repeat(64),media:[]}),productId:'prod_fixture'});
 assert(host.textContent.includes('zatiaľ nemá priradené'),'Honest empty state');
 await mountLibraryEditor(host,{api:async()=>{throw Error('Unavailable')},productId:'prod_fixture'});
 assert(host.textContent.includes('nepodarilo načítať')&&!host.querySelector('[data-library-title]'),'Failure is not fabricated empty content');
 result.textContent=JSON.stringify({status:'PASS',width:innerWidth,checks});
} catch(error){result.textContent=JSON.stringify({status:'FAIL',width:innerWidth,checks,error:error.message})}
