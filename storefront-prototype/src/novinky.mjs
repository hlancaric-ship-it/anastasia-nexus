// Stránka Novinky: layout podľa úvodu, príspevky v jednej jazdiacej rade, partneri dole, výsuvný panel zprava.
// Obsah doplňuje public/novinky.mjs z API (GET /store/novinky), do tej doby z ukážkových dát vložených do stránky.
import {NOVINKY_SAMPLE} from './novinky-data.mjs';
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
const LEAF='<svg class="nv-leaf" viewBox="0 0 120 160" fill="none" stroke="#C9A55C" stroke-width="1.1" stroke-linecap="round" aria-hidden="true"><path d="M60 158C58 110 62 60 78 8"/><path d="M60 128C42 120 28 104 24 84c20 4 34 22 36 44z"/><path d="M62 100C80 94 94 78 98 58c-20 2-34 20-36 42z"/><path d="M60 70C46 62 36 48 34 30c16 4 26 18 26 40z"/><path d="M70 44C82 38 90 26 92 12c-14 2-22 14-22 32z"/></svg>';
export const novinky=()=>`<link rel="stylesheet" href="/novinky.css"><div class="nv" id="nv">
<section class="nv-hero"><div class="nv-w"><p class="nv-k" id="nv-eyebrow"></p><h1 id="nv-title"></h1><p class="nv-lead" id="nv-intro"></p><div class="nv-chips" id="nv-chips" role="group" aria-label="Rubriky"></div></div></section>
<section class="nv-feat" id="nv-feat" hidden></section>
<section class="nv-reel-sec"><div class="nv-w"><p class="nv-tag">Najnovšie</p><h2>Čerstvé <em>príspevky</em></h2></div>
<div class="nv-reel" id="nv-reel" tabindex="0" aria-label="Príspevky, potiahnite myšou alebo použite šípky"><div class="nv-track" id="nv-track"></div></div>
<div class="nv-w nv-reelbar"><span>Najedťte myšou pre zastavenie · potiahnite pre posun</span><span class="nv-arrows"><button type="button" id="nv-prev" aria-label="Predchádzajúci">←</button><button type="button" id="nv-next" aria-label="Ďalší">→</button></span></div></section>
<section class="nv-invite" id="nv-invite" hidden></section>
<section class="nv-partners"><div class="nv-w"><p class="nv-tag">Spolupráca</p><h2>Naši <em>partneri</em></h2><p class="nv-sub">Preverené ponuky, ktoré zapadajú do sveta ANASTASIA. Každý partner má rovnaký formát a jasne označenú reklamu.</p><div class="nv-pgrid" id="nv-pgrid"></div><div class="nv-pfoot"><a class="nv-btn nv-btn--w" id="nv-partner" href="/kontakt">Chcem sa stať partnerom →</a><span>Reklama je platený obsah a neobsahuje zdravotné tvrdenia.</span></div></div></section>
<button type="button" class="nv-tab" id="nv-tab" aria-controls="nv-dock" aria-expanded="false">Novinky</button>
<aside class="nv-dock" id="nv-dock" aria-label="Novinky" hidden><div class="nv-leafp"><button type="button" class="nv-x" id="nv-x" aria-label="Zavrieť">×</button><div class="nv-head">${LEAF}<p class="nv-lbl">Čo je nové</p><h2 id="nv-ptitle"></h2></div><div class="nv-feed" id="nv-feed"></div></div><div class="nv-adbox" id="nv-adbox" hidden></div></aside>
<script type="application/json" id="nv-data">${json(NOVINKY_SAMPLE)}</script><script type="module" src="/novinky.mjs"></script></div>`;
