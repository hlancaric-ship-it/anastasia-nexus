// Stráž účtu pre /ucet.
//
// Bez prihláseného tokenu účet neexistí: zákazník pokračuje na prihlásenie.
// Skript sa načíta v hlave stránky (ako /center-theme.js), ešte pred runtime aplikácie,
// aby sa účet nestihol zobraziť ani na chvíľu. Kľúč tokenu je ten istý, ktorý používa
// API adaptér (src/lib/api/http.mjs) – zdroj pravdy je export JWT_KEY.
// Odkaz na objednávku z e-mailu (?objednavka=) si zapamätá, aby sa po prihlásení dal otvoriť.
export const accountGuardBoot = (jwtKey) =>
  `try{var k=${JSON.stringify(jwtKey)},t=null;try{t=localStorage.getItem(k);}catch(e){}if(!t)t=sessionStorage.getItem(k);if(!t){if(/objednavka=/.test(location.search))try{localStorage.setItem('anastasia.return','/ucet'+location.search);}catch(e){}location.replace(location.search.includes('mode=register')?'/prihlasenie?mode=register':'/prihlasenie');}}catch(e){/* prehliadač bez úložiska nechá rozhodnúť aplikácia */}\n`;
