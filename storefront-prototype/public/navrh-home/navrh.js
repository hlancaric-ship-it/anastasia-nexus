// Návrh úvodu: menu, karusel a jemný parallax (respektuje prefers-reduced-motion).
const menuBtn=document.querySelector('.nh-menu-btn');
const menu=document.getElementById('nh-menu');
menuBtn?.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;menuBtn.setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu&&!menu.hidden){menu.hidden=true;menuBtn.setAttribute('aria-expanded','false');menuBtn.focus();}});

const track=document.querySelector('[data-track]');
document.querySelector('[data-next]')?.addEventListener('click',()=>{
  if(!track)return;
  const slide=track.querySelector('.nh-slide');if(!slide)return;
  const step=slide.getBoundingClientRect().width+10;
  const atEnd=track.scrollLeft+track.clientWidth>=track.scrollWidth-4;
  track.scrollTo({left:atEnd?0:track.scrollLeft+step,behavior:'smooth'});
});

const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const layers=[...document.querySelectorAll('[data-parallax]')];
if(!reduce&&layers.length){
  let ticking=false;
  const update=()=>{
    ticking=false;
    const vh=window.innerHeight;
    for(const img of layers){
      const r=img.parentElement.getBoundingClientRect();
      if(r.bottom<0||r.top>vh)continue;
      const progress=(r.top+r.height/2-vh/2)/(vh+r.height);
      img.style.transform=`translate3d(0,${(progress*-12).toFixed(2)}%,0)`;
    }
  };
  window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}},{passive:true});
  update();
}
