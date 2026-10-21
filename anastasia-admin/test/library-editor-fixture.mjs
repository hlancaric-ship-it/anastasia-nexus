// Synthetic DOM fixtures only; this script never reaches Medusa or R2.
import {mountLibraryEditor} from '../library-editor.mjs';
let checks=0;
const assert=(ok,message)=>{if(!ok)throw Error(message);checks++};
const host=document.querySelector('#library'),result=document.querySelector('#result');
const rows=Array.from({length:7},(_,i)=>({key:`synthetic/${i}.mp4`,title:i===0?'<img src=x onerror=alert(1)>':`Video ${i+1} ${'dlhší názov '.repeat(6)}`,kind:'video'}));
let store={revision:'a'.repeat(64),media:structuredClone(rows)},last=null,failSave=false,failLoad=false,writes=0,purchases=0;
let uploads=0,attached=[],removed=[],confirmed=[];
const api=async(path,options={})=>{
  if(path.startsWith('/admin/entitlements'))return {entitlements:[],count:purchases};
  assert(path.startsWith('/admin/products/prod_fixture/protected-media'),'Only product-local endpoint');
  if(path.endsWith('/upload-url')){
    uploads++;const name=options.body.filename;
    return {key:`synthetic/${name.toLowerCase().replace(/[^a-z0-9.]+/g,'-')}-a1b2c3.mp4`,url:'https://storage.test/object',method:'PUT',headers:{'content-type':'video/mp4'},suggested_title:name.replace(/\.[^.]+$/,''),kind:'video',max_bytes:1024};
  }
  if(path.endsWith('/attach')){
    attached.push(options.body);store={revision:'c'.repeat(64),media:[...store.media,{key:options.body.key,title:options.body.title,kind:'video'}]};return structuredClone(store);
  }
  if(options.method==='DELETE'){
    const key=decodeURIComponent(path.split('/').pop());removed.push(key);
    store={revision:'d'.repeat(64),media:store.media.filter(m=>m.key!==key)};return structuredClone(store);
  }
  if(!options.method){if(failLoad)throw Error('Load failed');return structuredClone(store)}
  if(failSave)throw Error('Obsah už niekto upravil v inom okne.');
  writes++;last=structuredClone(options.body);store={revision:'b'.repeat(64),media:options.body.media.map(m=>({...m,kind:'video'}))};return structuredClone(store);
};
// Nahrávanie do úložiška sa v tomto teste simuluje: žiadny sieťový dotaz, len priebeh.
class FakeXHR{
  constructor(){this.upload={};this.status=0}
  open(method,url){this.method=method;this.url=url}
  setRequestHeader(){}
  send(file){
    assert(this.method==='PUT','Upload uses PUT');
    assert(String(this.url).startsWith('https://storage.test/'),'Upload goes to the presigned URL');
    setTimeout(()=>this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10}),0);
    setTimeout(()=>{this.upload.onprogress?.({lengthComputable:true,loaded:10,total:10});this.status=200;this.onload?.();},5);
  }
}
window.XMLHttpRequest=FakeXHR;
const type=(i,value)=>{const input=host.querySelector(`#library-title-${i}`);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))};
const tick=()=>new Promise(r=>setTimeout(r,0));
const fileList=(name,type,size=10)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(size)],name,{type}));return dt.files};
try {
  const editor=await mountLibraryEditor(host,{api,productId:'prod_fixture'});
  assert(host.querySelectorAll('[data-library-title]').length===5,'Compact page has five files');
  assert(!host.querySelector('img'),'Titles are escaped');
  for(const input of host.querySelectorAll('[data-library-title]'))assert(!!host.querySelector(`label[for="${input.id}"]`),'Associated label');
  assert(host.querySelector('[data-library-move="0"][data-direction="-1"]').disabled,'First file cannot move above start');
  assert(document.documentElement.scrollWidth<=innerWidth,'No horizontal overflow');
  assert(!!host.querySelector('#library-drop')&&!!host.querySelector('#library-file'),'Upload area is available');
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

  // Nahrávanie: vybraný súbor sa nahrá, pripojí a dostane automatický názov aj druh obsahu.
  const input=host.querySelector('#library-file');
  Object.defineProperty(input,'files',{value:fileList('Moja nahrávka.mp3','audio/mpeg'),configurable:true});
  input.dispatchEvent(new Event('change',{bubbles:true}));
  let sawProgress=false;
  for(let i=0;i<100&&!attached.length;i++){if(host.querySelector('.library-upload-list'))sawProgress=true;await tick();}
  assert(sawProgress,'Upload progress is shown');
  assert(uploads===1,'One upload URL was requested');
  assert(attached.length===1&&attached[0].title==='Moja nahrávka','File is attached with an automatic name');
  assert(host.textContent.includes('nahraté')&&host.textContent.includes('pripojené'),'Upload result is reported');
  assert(host.textContent.includes('Video'),'Existing files show their type');

  // Pretiahnutie súboru do zóny nahráva rovnako ako výber zo zariadenia.
  const drop=host.querySelector('#library-drop');
  const dt=new DataTransfer();
  dt.items.add(new File([new Uint8Array(10)],'Nahrávka po pretiahnutí.mp3',{type:'audio/mpeg'}));
  const ev=new Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(ev,'dataTransfer',{value:dt});
  drop.dispatchEvent(ev);
  for(let i=0;i<100&&attached.length<2;i++)await tick();
  assert(attached.length===2&&attached[1].title==='Nahrávka po pretiahnutí','Dropped file is uploaded too');

  // Nepovolený typ sa ani nezačne nahrávať.
  const before=uploads;
  const input2=host.querySelector('#library-file');
  Object.defineProperty(input2,'files',{value:fileList('balik.zip','application/zip'),configurable:true});
  input2.dispatchEvent(new Event('change',{bubbles:true}));
  for(let i=0;i<20;i++)await tick();
  assert(uploads===before,'Unsupported type is rejected before upload');
  assert(host.textContent.includes('povolené sú MP4, MP3, M4A a PDF'),'Rejection explains allowed types');

  // Odoberanie: pri zakúpenom produkte sa pýta na potvrdenie so zákazníčkami.
  purchases=3;
  window.confirm=(message)=>{confirmed.push(String(message));return true};
  host.querySelector('[data-library-remove="0"]').click();
  for(let i=0;i<20&&!removed.length;i++)await tick();
  assert(removed.length===1,'File is detached');
  assert(confirmed[0].includes('zákazníčiek'),'Detaching a bought product warns about customers');
  assert(!host.textContent.includes('Zamknutá'),'Library stays usable');

  await mountLibraryEditor(host,{api:async()=>({revision:'c'.repeat(64),media:[]}),productId:'prod_fixture'});
  assert(host.textContent.includes('zatiaľ nemá priradené'),'Honest empty state');
  await mountLibraryEditor(host,{api:async()=>{throw Error('Unavailable')},productId:'prod_fixture'});
  assert(host.textContent.includes('nepodarilo načítať')&&!host.querySelector('[data-library-title]'),'Failure is not fabricated empty content');
  result.textContent=JSON.stringify({status:'PASS',width:innerWidth,checks});
} catch(error){result.textContent=JSON.stringify({status:'FAIL',width:innerWidth,checks,error:error.message})}
