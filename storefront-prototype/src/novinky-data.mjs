// Ukázková data Novinek přesně v tvaru GET /store/novinky (kontrakt s adminem). Používá je stránka, dokud API neodpoví.
export const NOVINKY_SAMPLE={
 page:{eyebrow:'vitajte.',title:'Čo je nové v ANASTASII',title_script:'nové',intro:'Tipy pre každodenný pokoj, pozvánky na stretnutia a ankety, v ktorých rozhodujete o tom, čo prinesieme ďalej.',partner_label:'Chcem sa stať partnerom',partner_url:'/kontakt'},
 categories:[{key:'novinka',label:'Novinky'},{key:'tip',label:'Tipy'},{key:'pozvanka',label:'Pozvánky'},{key:'anketa',label:'Ankety'}],
 featured:{id:'f1',category:'novinka',kind:'image',title:'Kráľovna svojho života',excerpt:'Jemná pleťová voda, ktorá podporuje prirodzenú rovnováhu pleti a prináša sviežosť každý deň.\nVznikla s rešpektom k prírode, vode a ženám, ktoré sa starajú o seba vedome.',image_url:'/img/novinky/kralovna-ukazka.png',image_alt:'Pleťová voda Kráľovna svojho života',video_url:null,poster_url:null,youtube_id:null,link_url:'/eshop',link_label:'Viac o produkte',published_at:'2026-10-28T08:00:00Z',poll:null},
 posts:[
  {id:'p2',category:'tip',kind:'image',title:'Ako si upraviť ranný rituál',excerpt:'Tri jednoduché kroky, ktoré do dňa prinesú pokoj.',image_url:'/img/atmosphere/lavender.webp',image_alt:'Levanduľa',video_url:null,poster_url:null,youtube_id:null,link_url:null,link_label:'',published_at:'2026-10-27T08:00:00Z',poll:null},
  {id:'p3',category:'tip',kind:'video',title:'Dychové cvičenie na 5 minút',excerpt:'Krátke video, ktoré môžete spraviť kdekoľvek.',image_url:null,image_alt:'',video_url:null,poster_url:'/img/hero-forest.webp',youtube_id:null,link_url:null,link_label:'',published_at:'2026-10-26T08:00:00Z',poll:null},
  {id:'p4',category:'pozvanka',kind:'image',title:'Online konzultácie',excerpt:'Individuálny prístup, osobné protokoly a podpora na vašej ceste k zdravšiemu a harmonickejšiemu životu.',image_url:'/img/atmosphere/pharmacy-glass.webp',image_alt:'',video_url:null,poster_url:null,youtube_id:null,link_url:'/konzultacie/rezervacia',link_label:'Rezervovať termín',published_at:'2026-10-25T08:00:00Z',poll:null},
  {id:'p5',category:'anketa',kind:'poll',title:'Čo by Vás zaujímalo?',excerpt:'Hlasujte a povedzte nám, o čom máme písať.',image_url:null,image_alt:'',video_url:null,poster_url:null,youtube_id:null,link_url:null,link_label:'',published_at:'2026-10-24T08:00:00Z',poll:{question:'O čom máme písať?',options:[{id:'o1',label:'Spánok a oddych',votes:12},{id:'o2',label:'Bylinky a výživa',votes:9},{id:'o3',label:'Pohyb po štyridsiatke',votes:7}],total:28}},
  {id:'p6',category:'novinka',kind:'youtube',title:'Z nášho kanála: Jesenná rovnováha',excerpt:'Vložené video z YouTube priamo medzi príspevkami.',image_url:'/img/atmosphere/olive-branch.webp',image_alt:'',video_url:null,poster_url:null,youtube_id:'dQw4w9WgXcQ',link_url:null,link_label:'',published_at:'2026-10-23T08:00:00Z',poll:null},
  {id:'p7',category:'novinka',kind:'image',title:'Nový obsah v knižnici',excerpt:'Pridali sme ďalšiu lekciu programu RESET 40+.',image_url:'/img/atmosphere/olive-branch.webp',image_alt:'',video_url:null,poster_url:null,youtube_id:null,link_url:'/reset-40',link_label:'Otvoriť',published_at:'2026-10-22T08:00:00Z',poll:null}
 ],
 ads:[
  {slot:1,label:'Reklama · Partner',title:'Minerály pre pokojný spánok',text:'Popis ponuky do 140 znakov, vždy v rovnakom formáte pre všetkých partnerov.',button:'Zistiť viac',url:'https://www.anastasia.sk/',image_url:'/assets/packshots/mineral-protect.webp',image_alt:''},
  {slot:2,label:'Reklama · Partner',title:'Relaxačný pobyt v prírode',text:'Víkend plný pokoja, prechádzok a regenerácie pre telo aj myseľ.',button:'Zistiť viac',url:'https://www.anastasia.sk/',image_url:'/img/atmosphere/olive-branch.webp',image_alt:''},
  {slot:3,label:'Reklama · Partner',title:'Diagnostika a prevencia',text:'Moderné vyšetrenia, ktoré pomôžu zachytiť zmeny včas.',button:'Zistiť viac',url:'https://www.anastasia.sk/',image_url:'/img/atmosphere/pharmacy-glass.webp',image_alt:''}
 ],
 panel:{enabled:true,title:'Naše',title_script:'novinky',ad:null},
 updated_at:'2026-10-28T08:00:00Z'
};
NOVINKY_SAMPLE.panel.ad=NOVINKY_SAMPLE.ads[0];
