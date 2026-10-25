import {escape as e} from './components.mjs';

// Jednotná šablóna konzultácie: úvod a kalendár hore, pod nimi tri karty (pre koho, priebeh, otázky a zrušenie termínu).
// Dĺžku, formu a cenu prepíše runtime podľa servera (data-consult-meta), tu sú len hodnoty pre prvé vykreslenie.
const CANCEL=[
  ['Ako zmením alebo zruším termín?','Napíšte nám najmenej 24 hodín pred začiatkom na zdravysvet@anastasiaoz.eu. Uhradenú cenu presunieme na nový termín bez poplatku.'],
  ['Čo ak to nestihnem oznámiť včas?','Pri kratšom oznámení alebo neúčasti nie je náhradný termín automaticky zaručený, ďalší postup dohodneme individuálne. Paušálny storno poplatok neúčtujeme.'],
  ['Potrebujem účet?','Nie. Termín si rezervujete a zaplatíte aj bez registrácie, potvrdenie príde na e-mail z objednávky.'],
];
export const CONSULT={
  'online-zdravotna-konzultacia':{meta:['60 min','Online alebo telefonicky','69 €'],
    who:['chcete lepšie porozumieť svojmu zdravotnému stavu','potrebujete sa zorientovať v liekoch alebo doplnkoch výživy','hľadáte druhý odborný pohľad a vysvetlenie výsledkov','zaujímate sa o prevenciu, spánok, stres a zdravé starnutie'],
    steps:[['Vyberte si termín','V kalendári zvolíte deň a čas, termín vám podržíme počas objednávky.'],['Pripravte si otázky','Zoznam liekov a doplnkov, výsledky vyšetrení a pokojné miesto so slúchadlami.'],['Stretnutie s Luciou','Videohovor alebo telefonát, 60 minút venovaných len vašej situácii.']],
    faq:[['Nahrádza konzultácia lekára?','Nie. Nenahrádza vyšetrenie lekárom, diagnostiku ani akútnu starostlivosť. Pomáha zorientovať sa a pripraviť sa na rozhovor s lekárom.'],...CANCEL]},
  'supervizia':{meta:['50–60 min','Osobne alebo online','69 €'],
    who:['pracujete s klientom a potrebujete odstup a nadhľad','chcete predísť vyhoreniu a nájsť nové riešenia','rozvíjate komunikačné zručnosti a empatiu','hľadáte lepšiu organizáciu vlastnej práce'],
    steps:[['Vyberte si termín','V kalendári zvolíte deň a čas, termín vám podržíme počas objednávky.'],['Prineste tému','Situáciu z praxe, otázku alebo dilemu, ktorú chcete otvoriť.'],['Rozhovor so supervízorkou','Naživo vo Vyšnej Slanej alebo online cez Teams či Zoom, 50 až 60 minút.']],
    faq:[['Je supervízia terapia?','Nie. Supervízia vedie k vlastným odpovediam cez otázky a projekčné techniky. Ak sa otvorí téma pre terapiu, odporučíme ďalší postup.'],...CANCEL]},
  'astrologia-zdravie-predispozicia':{meta:['60 min','Online','59 €'],
    who:['chcete lepšie pochopiť sami seba a svoje silné stránky','zaujímate sa o vitalitu, zdravie a prevenciu','stojíte na životnej križovatke','chcete porozumieť svojim vzťahom a vzorcom'],
    steps:[['Vyberte si termín','V kalendári zvolíte deň a čas, termín vám podržíme počas objednávky.'],['Pošlite údaje o narodení','Dátum, presný čas a miesto narodenia doplníte v účte alebo e-mailom.'],['Výklad a písomný profil','Prejdeme spolu váš profil a výstup v rozsahu 6 až 10 strán dostanete elektronicky.']],
    faq:[['Je to predpoveď budúcnosti?','Nie. Profil nie je predpoveď ani zdravotná diagnóza. Je to nástroj sebapoznania podľa siderickej (védskej) astrológie.'],...CANCEL]},
  'personalizovany-zdravotny-protokol-pro':{meta:['60 min','Online','59 €'],
    who:['chcete jasný plán pre lieky, doplnky a životný štýl','potrebujete zladiť viac prípravkov naraz','hľadáte postup šitý na mieru vášmu dňu','chcete merať pokrok a vedieť, čo funguje'],
    steps:[['Vyberte si termín','V kalendári zvolíte deň a čas, termín vám podržíme počas objednávky.'],['Pripravte podklady','Zoznam liekov a doplnkov a výsledky posledných vyšetrení.'],['Váš protokol','Spolu prejdeme odporúčania a dostanete ich v písomnej podobe.']],
    faq:CANCEL},
};
const ico='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';
export const consultCards=handle=>{
  const c=CONSULT[handle];if(!c)return '';
  return `<div class="cv2-info"><article class="cv2-card"><p class="eyebrow">Pre koho</p><h2>Pre koho a s čím pomáha</h2><ul class="cv2-ticks">${c.who.map(x=>`<li>${ico}<span>${e(x.charAt(0).toUpperCase()+x.slice(1))}</span></li>`).join('')}</ul></article><article class="cv2-card"><p class="eyebrow">Priebeh</p><h2>Ako stretnutie prebieha</h2><ol class="cv2-steps">${c.steps.map(([t,d],i)=>`<li><span class="cv2-steps__no">${i+1}</span><div><h3>${e(t)}</h3><p>${e(d)}</p></div></li>`).join('')}</ol></article><article class="cv2-card cv2-faq"><p class="eyebrow">Otázky</p><h2>Časté otázky a podmienky zrušenia termínu</h2>${c.faq.map(([q,a])=>`<details><summary>${e(q)}</summary><p>${e(a)}</p></details>`).join('')}<a class="text-link" href="/vop">Celé obchodné podmienky</a></article></div>`;
};
export const consultMeta=handle=>(CONSULT[handle]?.meta||[]).map(x=>`<span>${e(x)}</span>`).join('');
// Krátky popis pre výpis konzultácií, keď produkt nemá vlastný text.
export const consultLead=handle=>{const w=CONSULT[handle]?.who;return w?.length?`Pre vás, ak ${w[0]}.`:'';};
