// Purchased files come only from the authenticated backend catalogue. No placeholder lessons.
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
export async function mountLibrary(target,api){
  let active=null,renewal=null,hls=null;
  const stop=()=>{clearTimeout(renewal);hls?.destroy();hls=null;if(active){active.pause();active.removeAttribute('src');active.load();active=null;}};
  const fail='Obsah sa teraz nepodarilo otvoriť. Skúste to znova o chvíľu.';
  let data;try{data=await api.getEntitlements();}catch{target.replaceChildren(node('p',fail,'form-status'));return stop;}
  if(data.ok===false){target.replaceChildren(node('p','Prístupy sa teraz nepodarilo načítať. Obnovte stránku.','form-status'));return stop;}
  if(!data.active){const box=node('div',null,'empty-state locked-library');box.append(node('p','ZAMKNUTÁ KNIŽNICA','eyebrow'),node('h2','Tento priestor čaká na vás.'),node('p','Zakúpené programy a súbory sa zobrazia po prihlásení.'));const link=node('a','Prihlásiť sa','button');link.href='/prihlasenie';box.append(link);target.replaceChildren(box);return stop;}
  const products=new Map();for(const access of data.entitlements||[])if(access.product?.id&&!products.has(access.product.id))products.set(access.product.id,access.product);
  const grid=node('div',null,'library-products');target.replaceChildren(grid);
  if(!products.size)grid.append(node('p','Prístup je evidovaný. Súbory zatiaľ nie sú sprístupnené.','form-status'));
  for(const product of products.values()){
    const card=node('article',null,'library-product'),status=node('p','','form-status'),playerBox=node('div',null,'library-player');status.setAttribute('role','status');
    card.append(node('h2',product.title),node('p','Váš zakúpený obsah','eyebrow'));
    if(!product.media?.length)card.append(node('p','Prístup je evidovaný. Obsah zatiaľ nie je sprístupnený v novom webe.','form-status'));
    for(const media of product.media||[]){
      const row=node('div',null,'library-file'),label=node('span',media.title),open=node('button',media.kind==='document'?'Otvoriť dokument':media.kind==='audio'?'Prehrať zvuk':'Prehrať video','button outline');open.type='button';row.append(label,open);card.append(row);
      open.addEventListener('click',async()=>{
        if(open.disabled)return;open.disabled=true;status.textContent='Overujem váš prístup…';
        // Open the document window during the click to avoid async popup blocking.
        const popup=media.kind==='document'?window.open('about:blank','_blank'):null;if(popup)popup.opener=null;
        try{
          const access=await api.getMediaAccess({product_id:product.id,media_key:media.key});
          if(!access.ok)throw Error(access.message||fail);
          const url=new URL(access.url,location.origin);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error(fail);
          status.textContent='';
          if(media.kind==='document'){if(popup)popup.location.replace(url.href);else{const link=node('a','Otvoriť pripravený dokument','text-link');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';status.replaceChildren(link);}return;}
          stop();const player=document.createElement(media.kind==='audio'?'audio':'video');player.controls=true;player.preload='metadata';player.crossOrigin='anonymous';player.setAttribute('controlsList','nodownload');player.dataset.libraryPlayer='';playerBox.replaceChildren(player);active=player;
          const watermark=node('p',access.watermark||'','library-watermark');playerBox.append(watermark);
          if(media.key.toLowerCase().endsWith('.m3u8')&&!player.canPlayType('application/vnd.apple.mpegurl')){
            const {default:Hls}=await import('/vendor/hls.min.mjs');if(!Hls.isSupported())throw Error('Tento prehliadač nepodporuje prehrávanie videa. Skúste aktuálny Chrome, Firefox alebo Safari.');
            hls=new Hls({enableWorker:false});hls.loadSource(url.href);hls.attachMedia(player);
            hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal){stop();status.textContent=fail;}});
          }else player.src=url.href;
          player.addEventListener('error',()=>{status.textContent=fail;});
          player.play().catch(()=>{status.textContent='Prehrávanie spustíte tlačidlom na prehrávači.';});
          const renew=async()=>{if(active!==player)return;try{const next=await api.getMediaAccess({product_id:product.id,media_key:media.key});if(!next.ok)throw Error();const nextUrl=new URL(next.url,location.origin);if(nextUrl.origin!==url.origin)throw Error();const time=player.currentTime,paused=player.paused;if(hls)hls.loadSource(nextUrl.href);else player.src=nextUrl.href;player.addEventListener('loadedmetadata',()=>{player.currentTime=time;if(!paused)player.play().catch(()=>{});},{once:true});schedule(next.expires_at);}catch{stop();status.textContent='Prístup sa nepodarilo obnoviť. Otvorte obsah znova.';}};
          const schedule=expires=>{const at=Date.parse(expires);if(Number.isFinite(at))renewal=setTimeout(renew,Math.max(1000,at-Date.now()-30000));};schedule(access.expires_at);
        }catch(error){popup?.close();stop();status.textContent=error.message||fail;}finally{open.disabled=false;}
      });
    }
    card.append(status,playerBox);grid.append(card);
  }
  return stop;
}
