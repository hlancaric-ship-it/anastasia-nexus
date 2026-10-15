// Barvy zákaznické části. Jediný zdroj: swatche v účtu, CSS proměnné i skript v <head> se generují odsud.
// main nese krémový text (#EFE5C7), accent je popisek/aktivní stav na main, deep je spodek přechodu do patičky.
export const CENTER_THEME_KEY='ana-center-theme';
export const centerThemes=[
  {id:'bordo',label:'Bordová',main:'#4A1A26',accent:'#A9B8DA',deep:'#17332F'},
  {id:'zelena',label:'Lesná zelená',main:'#2A3222',accent:'#C9A355',deep:'#17332F'},
  {id:'terakota',label:'Terakota',main:'#7A3A1A',accent:'#F2C98A',deep:'#2A160C'},
  {id:'modra',label:'Nočná modrá',main:'#1F2A4A',accent:'#C9A355',deep:'#0F1628'},
  {id:'levandula',label:'Levanduľová',main:'#55547F',accent:'#E2E1F5',deep:'#222137'},
  {id:'slivka',label:'Slivková',main:'#3E2448',accent:'#D8C3E6',deep:'#1C1022'},
];
export const centerThemeCss=()=>centerThemes.map((t,i)=>`${i?`:root[data-center-theme="${t.id}"]`:':root'}{--center-main:${t.main};--center-accent:${t.accent};--center-deep:${t.deep}}`).join('');
// Běží synchronně v <head>, aby účet neproblikl výchozí barvou. localStorage může vyhodit (soukromé okno) – pak zůstane výchozí.
export const centerThemeBoot=()=>`try{var t=localStorage.getItem(${JSON.stringify(CENTER_THEME_KEY)});if(${JSON.stringify(centerThemes.map(t=>t.id))}.indexOf(t)>0)document.documentElement.dataset.centerTheme=t;}catch(e){}\n`;
