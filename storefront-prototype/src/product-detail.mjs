import {digitalTopics} from './lib/digital-content.mjs';
import {isMediaUrl} from './lib/media-url.mjs';
import {descriptionHtml} from './lib/description-blocks.mjs';
import {escape as e,arrow,shopShortcuts} from './components.mjs';
import {VOUCHER_CATEGORY,VOUCHER_CATEGORY_HANDLE,SHOP_CATEGORY_HANDLES,voucherAmountFromSlug} from './lib/api/catalog.mjs';
import {VVV_HANDLE,VVV_INTRO,VVV_FACTS,VVV_CARDS,VVV_PANELS} from './product-course-vvv.mjs';

// Jednotná šablóna detailu (master protokol 25. 10.): vľavo médiá, vpravo nákupný panel
// s vlastnosťami a akordeónmi. Obsah je výhradne z katalógu, nič sa nedopĺňa.
const txt = value => e(String(value ?? ''));
const url = value => { const s=String(value||''); return isMediaUrl(s) ? txt(s) : '/assets/product-sun.svg'; };
const source = p => { const s=String(p.longDescription||p.description||'').trim(); return /^Podrobnosti a podmienky nájdete v detaile produktu\.?$/.test(s) ? '' : s; };
const perex = p => {
  const s = source(p).replace(/\s+/g, ' ').trim();
  if (!s) return '<p class="pdm-perex" data-product-intro hidden></p>';
  return `<p class="pdm-perex" data-product-intro>${txt(s.length > 220 ? s.slice(0, 220).replace(/\s+\S*$/, '') + '…' : s)}</p>`;
};
const kindOf = p => p.slug===VVV_HANDLE ? 'digital' : (p.giftVoucher||voucherAmountFromSlug(p.slug)!=null) ? 'voucher' : (p.booking||p.category==='Konzultácie'||p.kind==='consultation') ? 'consultation' : p.kind==='digital' ? 'digital' : 'physical';
const categoryHref = p => '/eshop/?category='+encodeURIComponent(SHOP_CATEGORY_HANDLES[p.category]||p.category)+'#nase-produkty';

// Minimalistické ikony, linka 1,3 px ako šípky v obchode.
const ICON = {
  stock:'<path d="M5 12.5 10 17 19 7"/>',
  truck:'<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17.5" cy="17.5" r="1.6"/>',
  gift:'<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>',
  return:'<path d="M9 7 4 12l5 5M4 12h11a4 4 0 0 1 0 8h-3"/>',
  bolt:'<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
  file:'<path d="M7 3h7l4 4v14H7zM14 3v4h4"/>',
  audio:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14h3v6H4zM17 14h3v6h-3z"/>',
  infinity:'<path d="M7.5 9a3 3 0 1 0 0 6c3 0 6-6 9-6a3 3 0 1 1 0 6c-3 0-6-6-9-6z"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>',
  calendar:'<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  card:'<path d="M3 6h18v12H3zM3 10h18M7 15h4"/>',
  mail:'<path d="M3 6h18v12H3zM3 7l9 7 9-7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  screen:'<path d="M3 5h18v11H3zM8 20h8M12 16v4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
};
const icon = name => `<svg class="pdm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]||ICON.check}</svg>`;
const features = items => `<ul class="pdm-features" aria-label="Kľúčové vlastnosti">${items.map(([name,title,detail,attr=''])=>`<li${attr}>${icon(name)}<span><b>${title}</b>${detail?`<small>${detail}</small>`:''}</span></li>`).join('')}</ul>`;
const accordions = (items, open=0, cls='') => `<div class="pdm-accordions${cls}" data-product-accordions>${items.filter(Boolean).map(([title,html],i)=>`<details${i===open?' open':''}><summary>${title}<span class="pdm-plus" aria-hidden="true"></span></summary><div class="pdm-accordion-body">${html}</div></details>`).join('')}</div>`;
// Podrobnosti pod nákupným blokom cez celú šírku: dva stĺpce zatvorených akordeónov (rovnaká výška kariet), posledný (doprava, prístup, podmienky) široký.
const details = items => {
  const list = items.filter(Boolean);
  if (!list.length) return '';
  const wide = list.length > 2 ? list.pop() : null;
  const cols = [[], []];
  list.forEach((item, i) => cols[i % 2].push(item));
  return `<section class="pdm-details" aria-label="Podrobnosti o produkte"><div class="pdm-details-grid">${cols.filter(c => c.length).map(c => accordions(c, -1)).join('')}</div>${wide ? accordions([wide], -1, ' pdm-accordions--wide') : ''}</section>`;
};
const crumb = (label, href, name) => `<nav class="pd-breadcrumbs" aria-label="Drobečková navigácia"><a href="/eshop">Obchod</a><span aria-hidden="true">/</span>${label?`<a href="${txt(href)}">${txt(label)}</a><span aria-hidden="true">/</span>`:''}<span aria-current="page">${txt(name)}</span></nav>`;
const photo = p => `<div class="pd-main-image"><img class="product-media" data-product-main-image src="${url(p.image)}" alt="${txt(p.name)}" width="1000" height="1000"><span class="pd-gallery-actions" data-gallery-actions hidden><button type="button" data-gallery-previous aria-label="Predchádzajúci obrázok">←</button><button type="button" data-gallery-next aria-label="Ďalší obrázok">→</button></span></div><div class="pd-thumbnails" data-product-thumbnails hidden aria-label="Fotografie produktu"></div>`;
const fullDescription = p => `<div class="pd-about-text" data-product-full-description data-structured>${source(p) ? descriptionHtml(source(p)) : '<p>Popis produktu nájdete v obchodných podmienkach alebo nám napíšte.</p>'}</div>`;
const stockLabel = p => ({in_stock:'Skladom',out_of_stock:'Vypredané',preorder:'Na objednávku'})[p.stock] || 'Skladom';

// Varianty dopĺňa app.mjs ako rolovaciu ponuku (vypredané sú vypnuté s označením).
const stepper = () => `<div class="pd-stepper"><button type="button" data-qty-step="-1" aria-label="Znížiť množstvo">−</button><label class="pd-sr" for="pd-qty">Množstvo</label><input id="pd-qty" name="quantity" type="number" inputmode="numeric" min="1" max="99" value="1" required><button type="button" data-qty-step="1" aria-label="Zvýšiť množstvo">+</button></div>`;
const buyForm = (p, {quantity=true}={}) => `<form class="add-product pd-purchase" data-code="${txt(p.code)}"><div class="pdm-buy-row">${quantity?stepper():'<input type="hidden" name="quantity" value="1">'}<button class="button pd-buy" type="submit">Pridať do košíka ${arrow}</button></div></form><p class="form-status" role="status"></p>`;
const head = (p, {eyebrow=p.category, badge=''}={}) => `<p class="pd-eyebrow" data-product-category>${txt(eyebrow)}</p><h1 data-product-title>${txt(p.name)}</h1><div class="pdm-price-row"><p class="pd-price" data-product-price>${txt(p.priceLabel)}</p>${badge}</div>`;
const shell = (p, kind, crumbs, media, panel, extra='', attrs='') => `<section class="pd-page pdm pdm--${kind} kc-motif" data-product-detail${attrs} data-product-handle="${txt(p.slug)}" data-product-kind="${kind}">${shopShortcuts()}${crumbs}<div class="pdm-grid"><div class="pdm-media">${media}</div><div class="pdm-panel kc-glass">${panel}</div></div>${extra}</section>`;
const related = (p, products) => {
  const kind=kindOf(p);const ok=x=>x.slug!==p.slug&&x.priceLabel!=='Cena sa doplní';
  // Pri poukaze sú ostatné hodnoty v rolovacej ponuke, preto ukážeme produkty z obchodu.
  const options=(kind==='voucher'?products.filter(x=>ok(x)&&kindOf(x)!=='voucher'):products.filter(x=>ok(x)&&kindOf(x)===kind)).slice(0,4);
  return options.length?`<section class="pdm-related" aria-labelledby="pdm-related-h"><div class="pdm-related-head"><h2 id="pdm-related-h">Objavte aj</h2><a class="pdm-link" href="/eshop">Všetky produkty ${arrow}</a></div><div class="pdm-related-grid">${options.map(x=>`<a class="pdm-related-card" href="/eshop/produkt/${txt(x.slug)}/"><span class="pdm-related-img"><img src="${url(x.image)}" alt="" width="400" height="400" loading="lazy"></span><small>${txt(x.category)}</small><b>${txt(x.name)}</b><em>${txt(x.priceLabel)}</em></a>`).join('')}</div></section>`:'';
};

// Doprava a vrátenie: sumy dopĺňa app.mjs zo servera (getShippingInfo), nič natvrdo.
const deliveryHtml = `<ul class="pdm-list" data-shipping-info><li data-ship="courier">Doručenie kuriérom, cenu uvidíte v pokladni pred zaplatením.</li><li data-ship="pickup">Osobný odber v lekárni.</li><li data-ship="free" hidden></li><li>Od zmluvy môžete odstúpiť do 14 dní. Postup nájdete vo <a href="/odstupenie-od-zmluvy">formulári na odstúpenie</a> a v <a href="/vop">obchodných podmienkach</a>.</li></ul>`;

// Špecifikácia len z údajov v popise (riadky „Názov: hodnota“) a z katalógu.
const SPEC = /^(Objem|Hmotnosť|Balenie|Obsah balenia|Veľkosť|Rozmery|Množstvo|Trvanlivosť|Dávkovanie)\s*:\s*(.{1,80})$/i;
const specRows = p => {
  const raw = String(p.descriptionHtml||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ')+'\n'+source(p);
  const rows=[];const seen=new Set();
  for(const line of raw.split('\n').map(l=>l.trim()).filter(Boolean)){const m=line.match(SPEC);const key=m?.[1].toLowerCase();if(m&&!seen.has(key)){seen.add(key);rows.push([m[1][0].toUpperCase()+m[1].slice(1).toLowerCase(),m[2].replace(/[,;.]\s*$/,'')]);}}
  if(p.sku)rows.push(['Kód produktu',p.sku]);
  if(p.manufacturer)rows.push(['Predajca',p.manufacturer]);
  rows.push(['Dostupnosť',stockLabel(p)]);
  return `<dl class="pdm-spec">${rows.map(([k,v])=>`<div><dt>${txt(k)}</dt><dd>${txt(v)}</dd></div>`).join('')}</dl>`;
};

// Varianta B (?foto=b): produktové obaly namiesto fotiek z katalógu.
const PACKSHOTS = {'bio-sprchovy-gel':['sprchovy-gel-kralovna','sprchovy-gel-kral'],'bio-plet-krem':['plet-krem-zeny','plet-krem-muzi'],'mineralny-ochranny-krem-pre-citlivu-pokozku':['mineral-protect'],'chripka-prasok':['chripkovy-prasok'],'antibioticky-prasok':['jancova-antibioticka-zmes'],'pletova-voda':['pletova-voda-diva'],'osviezit-plet':['pletova-voda-osviezujuca']};
const packshots = p => (PACKSHOTS[String(p.slug).toLowerCase()]||[]).map(n => '/assets/packshots/'+n+'.webp');

function physicalPage(p, products) {
  const stock = stockLabel(p);
  const panel = head(p,{badge:`<p class="pd-availability"><span class="status-dot" aria-hidden="true"></span><span data-product-availability>${txt(stock)}</span></p>`})
    + perex(p) + buyForm(p)
    + features([['stock',txt(stock),'odosielame po zaplatení'],['truck','Kuriér alebo osobný odber','cenu uvidíte pred zaplatením'],['gift','Doprava zdarma','<span data-ship-free-detail>pri väčšom nákupe</span>',' data-ship-free hidden'],['return','14 dní na vrátenie','podľa obchodných podmienok']]);
  const more = details([['Zloženie a účinky',fullDescription(p)],['Špecifikácia a rozmery',specRows(p)],['Doprava, vrátenie a balenie',deliveryHtml]]);
  return shell(p,'physical',crumb(p.category,categoryHref(p),p.name),photo(p),panel,more+related(p,products),` data-packshots='${txt(JSON.stringify(packshots(p)))}'`);
}

// Digitálny obsah: prístup sa aktivuje v účte (Moja knižnica) hneď po zaplatení, bez posielania súborov.
const FORMAT = {mp4:['play','Video MP4'],mov:['play','Video'],pdf:['file','PDF'],mp3:['audio','Audio MP3'],m4a:['audio','Audio'],wav:['audio','Audio']};
const formats = p => {const count=new Map();for(const c of p.contents||[]){const f=FORMAT[c.ext];if(f)count.set(f[1],(count.get(f[1])||0)+1);}return [...count].map(([label,n])=>`${label} (${n})`);};
const digitalBadge = `<p class="pdm-badge">${icon('bolt')}<span>Okamžitá automatická aktivácia vo vašom účte hneď po zaplatení</span></p>`;
const accessBox = `<div class="pdm-note">${icon('infinity')}<p>K zakúpenému obsahu získate okamžitý trvalý prístup priamo vo svojej zákazníckej sekcii <a href="/ucet#kniznica">Moja knižnica</a>.</p></div>`;
const lessonList = p => {const items=(p.contents||[]).filter(c=>FORMAT[c.ext]&&c.title);if(!items.length)return '';const shown=items.slice(0,10);return `<ol class="pdm-contents">${shown.map(c=>`<li>${icon(FORMAT[c.ext][0])}<span>${txt(c.title)}</span><small>${FORMAT[c.ext][1]}</small></li>`).join('')}</ol>${items.length>shown.length?`<p class="pdm-more">Ďalších ${items.length-shown.length} súborov nájdete v knižnici po nákupe.</p>`:''}`;};
// Verejná ukážka existuje len pri „Nič nemusíš“ (audio 0 zo starého webu).
const preview = p => p.slug==='nic-nemusis'?`<div class="pdm-preview"><p>${icon('audio')}<span>Ukážka · Audio 0</span></p><audio controls preload="none" src="/media/a0_nic-nemusis.mp3">Prehrávač audio podporuje váš prehliadač.</audio></div>`:'';

function digitalPage(p, products) {
  const isVvv = p.slug===VVV_HANDLE;
  const fmt = formats(p);
  const facts = isVvv
    ? VVV_FACTS.map(f=>[f.symbol,txt(f.name),txt(f.detail)])
    : [['key','Osobná licencia','pre váš zákaznícky účet'],['play',fmt.length?txt(fmt.join(' · ')):'Online v účte','formát obsahu'],['infinity','Trvalý prístup','bez časového obmedzenia'],['screen','Kedykoľvek online','počítač, tablet aj mobil']];
  const topics = isVvv ? [] : digitalTopics(p);
  const contentHtml = isVvv
    ? `<ol class="pdm-contents">${VVV_CARDS.map(c=>`<li><b>${txt(c.label)}</b><span>${txt(c.title)}<small>${txt(c.detail)}</small></span></li>`).join('')}</ol>`
    : topics.length ? `<ol class="pdm-contents">${topics.map(t=>`<li><b>${txt(String(t.number).padStart(2,'0'))}</b><span>${txt(t.title)}</span></li>`).join('')}</ol>` : lessonList(p);
  const terms = `<ul class="pdm-list"><li>Prístup sa aktivuje automaticky po prijatí platby, nájdete ho v sekcii Moja knižnica vo svojom účte.</li><li>Obsah je určený pre vás osobne. Tímovú alebo profesijnú licenciu dohodneme osobitne.</li><li>Prečítajte si <a href="/vop">obchodné podmienky</a>. S otázkami sa obráťte na Luciu cez <a href="/kontakt?produkt=${encodeURIComponent(p.slug)}">kontaktný formulár</a>.</li></ul>`;
  const items = isVvv
    ? [['Čo vás čaká',contentHtml],...VVV_PANELS.map((item,index)=>[txt(item.title),`<div class="pd-original-text">${index===4?VVV_INTRO.slice(1).map(t=>'<p>'+t+'</p>').join(''):''}${item.html}</div>`]),['Pôvodný popis produktu',fullDescription(p)],['Prístup a podmienky',terms]]
    : [['Popis programu',fullDescription(p)],contentHtml?['Obsah a formáty',contentHtml+(fmt.length?`<p class="pdm-more">Formáty: ${txt(fmt.join(', '))}.</p>`:'')]:null,['Prístup a podmienky',terms]];
  const perexHtml = isVvv ? `<p class="pdm-perex" data-product-approved-intro>${VVV_INTRO[0]}</p>` : perex(p);
  const panel = head(p) + digitalBadge + perexHtml + buyForm(p,{quantity:false}) + features(facts) + accessBox + preview(p);
  return shell(p,'digital',crumb(p.category,categoryHref(p),p.name),photo(p),panel,details(items)+related(p,products),isVvv?' data-product-authoritative':'');
}

// Darčekový poukaz: každá hodnota je samostatný produkt, hodnota sa vyberá v rolovacej ponuke.
const amountText = n => new Intl.NumberFormat('sk-SK',{maximumFractionDigits:2}).format(n);
const voucherCard = amount => `<div class="gv pd-gv" data-voucher-preview><div class="gv-card"><img class="gv-mark" src="/assets/brand-mark.svg" alt="" aria-hidden="true"><div class="gv-main"><span class="gv-kick">ANASTASIA · Light for the Future</span><p class="gv-title">Darčekový <em>poukaz</em></p><div class="gv-value"><span>${txt(amountText(amount))}</span><small>€</small></div><p class="gv-to">pre <b>vašich blízkych</b></p></div><div class="gv-stub"><span>Kód poukazu</span><b>•••••-•••••</b><small>Platnosť a hodnotu potvrdzuje obchod.</small></div><i class="gv-foil" aria-hidden="true"></i></div></div>`;
// Názvy úrovní poukazu podľa hodnoty, ostatné hodnoty ostanú len so sumou.
const VOUCHER_TIERS = {50:'Základný darčekový poukaz',100:'Rozšírený darčekový poukaz',200:'Exkluzívny darčekový poukaz'};
const voucherOption = v => {const n=v.voucherAmount??voucherAmountFromSlug(v.slug);const tier=VOUCHER_TIERS[n];return `${amountText(n)} €${tier?` (${tier})`:''}`;};
// Z popisu vypadnú vety o e-maile a PDF, poukaz je po zaplatení v zákazníckej zóne.
const voucherPerex = p => String(p.description||'').split(/(?<=[.!?])\s+/).filter(t=>t&&!/e-?mail|pdf/i.test(t)).join(' ');
const voucherBadge = `<div class="pdm-status"><p class="pdm-badge">${icon('bolt')}<span>Okamžitá automatická aktivácia v zákazníckej zóne po zaplatení</span></p><p class="pdm-status-sub">Poukaz s unikátnym kódom nájdete ihneď po platbe vo svojom účte pripravený na uplatnenie alebo vytlačenie.</p></div>`;
function voucherPage(p, products) {
  const amount = voucherAmountFromSlug(p.slug);
  const values = products.filter(x => x.category === VOUCHER_CATEGORY && voucherAmountFromSlug(x.slug)!=null);
  const select = values.length ? `<label class="pdm-select pdm-select--voucher"><span>Hodnota poukazu</span><select data-voucher-value aria-label="Hodnota poukazu">${values.map(v=>`<option value="/eshop/produkt/${txt(v.slug)}/" data-code="${txt(v.code)}" data-name="${txt(v.name)}" data-price="${txt(v.priceLabel)}" data-amount="${txt(amountText(voucherAmountFromSlug(v.slug)))}"${v.slug===p.slug?' selected':''}>${txt(voucherOption(v))}</option>`).join('')}</select></label>` : '';
  const perexText = voucherPerex(p);
  const panel = head(p,{eyebrow:VOUCHER_CATEGORY}) + voucherBadge + (perexText?`<p class="pdm-perex">${txt(perexText)}</p>`:'')
    + `<div class="pdm-voucher-buy">${select}${buyForm(p,{quantity:false})}</div>`
    + features([['bolt','Ihneď v účte','aktivácia po zaplatení'],['calendar','Platnosť 12 mesiacov','od dátumu nákupu'],['gift','Na celý obchod','produkty, programy aj konzultácie'],['card','Čerpanie po častiach','zostatok ostáva na poukaze']]);
  const more = details([['Ako poukaz funguje','<ul class="pdm-list"><li>Po zaplatení nájdete poukaz s jedinečným kódom vo svojom účte v sekcii <a href="/ucet#poukazy">Poukazy</a>, pripravený na uplatnenie alebo vytlačenie.</li><li>Poukaz odovzdáte, komu chcete. Obdarovaný zadá kód v košíku do poľa Darčekový poukaz.</li><li>Ak nákup nevyčerpá celú hodnotu, zostatok ostáva na poukaze.</li></ul>'],['Podmienky','<p>Platnosť poukazu je 12 mesiacov od nákupu. Podrobnosti nájdete v <a href="/vop">obchodných podmienkach</a>.</p>']]);
  return shell(p,'voucher',crumb(VOUCHER_CATEGORY,'/eshop/?category='+VOUCHER_CATEGORY_HANDLE+'#nase-produkty',p.name),`<div class="pdm-voucher-stage"><div class="pdm-voucher-frame">${voucherCard(amount)}</div></div>`,panel,more+related(p,products));
}

// Konzultácia sa nekupuje s množstvom: vedie na výber termínu, ktorý potvrdí Lucia.
function consultationPage(p, products) {
  const panel = head(p,{eyebrow:'Konzultácie'}) + perex(p)
    + `<a class="button pd-buy pdm-cta" href="/konzultacie/rezervacia?typ=${encodeURIComponent(p.slug)}">Vybrať termín ${arrow}</a>`
    + features([['calendar','Navrhnete termín','deň a čas si vyberiete v kalendári'],['check','Lucia ho potvrdí','príde vám e-mail s odkazom'],['card','Zaplatíte','až po potvrdení termínu'],['screen','Online stretnutie','odkaz dostanete pri potvrdení']]);
  const more = details([['Popis konzultácie',fullDescription(p)],['Termín a platba','<ul class="pdm-list"><li>Termín navrhnete v rezervácii. Lucia ho potvrdí alebo ponúkne iný.</li><li>Po potvrdení vám príde e-mail s odkazom na platbu. Termín je váš po zaplatení.</li><li>Podmienky nájdete v <a href="/vop">obchodných podmienkach</a>.</li></ul>']]);
  return shell(p,'consultation',crumb('Konzultácie','/eshop/?category='+encodeURIComponent(SHOP_CATEGORY_HANDLES['Konzultácie']||'konzultacie')+'#nase-produkty',p.name),photo(p),panel,more+related(p,products));
}

export function productDetail(p, products=[]) {
  const kind = kindOf(p);
  if(kind==='voucher')return voucherPage(p,products);
  if(kind==='consultation')return consultationPage(p,products);
  if(kind==='digital')return digitalPage(p,products);
  return physicalPage(p,products);
}
